"""
Session management for the agent chat drawer.

Handles all reads and writes for agent_sessions and agent_messages.
No other file in the codebase should query those tables directly.

Session lifecycle:
  active   → the current open conversation
  archived → the user started a new chat (or will be in future: session timed out)

One user has at most one active session at a time.
If somehow multiple exist (e.g. from a bug), get_or_create_active_session
returns the most recently active one.
"""
import logging
from datetime import datetime, timezone
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Max number of messages loaded into Gemini's context per turn.
# Older messages beyond this are ignored to keep prompts from growing too large.
MAX_HISTORY_MESSAGES = 20


# ── Session retrieval ─────────────────────────────────────────


def get_or_create_active_session(user_id: str) -> dict:
    """
    Returns the user's current active session and its messages.
    Creates a new session if none exists.

    This is called when the agent drawer opens or on the first
    message of a new page load.

    Returns:
        {
            "session_id": str,
            "messages": [{"role": ..., "content": ..., "context": ..., "created_at": ...}]
        }
    """
    # Look for an existing active session
    result = (
        supabase.table("agent_sessions")
        .select("id, last_active_at")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("last_active_at", desc=True)   # newest first if duplicates exist
        .limit(1)
        .execute()
    )

    if result.data:
        session_id = result.data[0]["id"]
        logger.info(f"Resumed active session {session_id} for user {user_id}")
    else:
        # No active session — create one
        created = (
            supabase.table("agent_sessions")
            .insert({"user_id": user_id, "status": "active"})
            .execute()
        )
        if not created.data:
            raise RuntimeError("Failed to create a new agent session.")
        session_id = created.data[0]["id"]
        logger.info(f"Created new session {session_id} for user {user_id}")

    messages = get_session_messages(session_id)
    return {"session_id": session_id, "messages": messages}


def get_session_messages(session_id: str) -> list[dict]:
    """
    Returns all messages in a session, oldest first.
    Capped at MAX_HISTORY_MESSAGES to keep Gemini context reasonable.

    Each message: {role, content, context, created_at}
    """
    result = (
        supabase.table("agent_messages")
        .select("role, content, context, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .limit(MAX_HISTORY_MESSAGES)
        .execute()
    )
    return result.data or []


def load_session(session_id: str, user_id: str) -> dict | None:
    """
    Load a specific session with ownership check.
    Used when the user clicks a past session in the history list.

    Returns None if the session does not exist or belongs to another user.
    Returns:
        {
            "session_id": str,
            "status": "active" | "archived",
            "messages": [...]
        }
    """
    result = (
        supabase.table("agent_sessions")
        .select("id, status")
        .eq("id", session_id)
        .eq("user_id", user_id)   # ownership check
        .execute()
    )
    if not result.data:
        return None

    session = result.data[0]
    messages = get_session_messages(session_id)
    return {
        "session_id": session["id"],
        "status": session["status"],
        "messages": messages,
    }


def get_past_sessions(user_id: str, limit: int = 10) -> list[dict]:
    """
    Returns the user's most recent archived sessions.
    Each entry includes a short preview of the first message sent,
    used to display "May 26 — Compare top candidates..." in the sidebar.

    Returns:
        [
            {
                "session_id": str,
                "started_at": str,
                "last_active_at": str,
                "preview": str   ← first 60 chars of the first user message
            },
            ...
        ]
    """
    sessions_result = (
        supabase.table("agent_sessions")
        .select("id, started_at, last_active_at")
        .eq("user_id", user_id)
        .eq("status", "archived")
        .order("last_active_at", desc=True)
        .limit(limit)
        .execute()
    )
    sessions = sessions_result.data or []

    for session in sessions:
        # Fetch the first user message for the preview
        preview_result = (
            supabase.table("agent_messages")
            .select("content")
            .eq("session_id", session["id"])
            .eq("role", "user")
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
        if preview_result.data:
            content = preview_result.data[0]["content"]
            # Strip context prefix if present (e.g. "[Context: ...]\n")
            if content.startswith("[Context:") and "\n" in content:
                content = content.split("\n", 1)[1]
            session["preview"] = content[:60] + "..." if len(content) > 60 else content
        else:
            session["preview"] = "Empty session"

        # Rename id → session_id for consistency with other responses
        session["session_id"] = session.pop("id")

    return sessions


# ── Session writes ────────────────────────────────────────────


def save_message(
    session_id: str,
    role: str,
    content: str,
    context: dict | None = None,
) -> dict:
    """
    Saves one message to agent_messages and updates the session's
    last_active_at timestamp.

    Args:
        session_id: The session this message belongs to.
        role:       "user" or "assistant".
        content:    The message text.
        context:    The page context at the time of the message (optional).

    Returns the saved message row.
    """
    # Insert the message
    msg_result = (
        supabase.table("agent_messages")
        .insert({
            "session_id": session_id,
            "role": role,
            "content": content,
            "context": context,
        })
        .execute()
    )
    if not msg_result.data:
        raise RuntimeError(f"Failed to save {role} message to session {session_id}.")

    # Update last_active_at on the session
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("agent_sessions").update(
        {"last_active_at": now}
    ).eq("id", session_id).execute()

    return msg_result.data[0]


def create_new_session(user_id: str) -> dict:
    """
    Archives all active sessions for this user and creates a fresh one.
    Called when the user clicks "+ New Session" in the drawer.

    Returns:
        {"session_id": str}  ← the new empty session
    """
    # Archive any existing active sessions
    supabase.table("agent_sessions").update(
        {"status": "archived"}
    ).eq("user_id", user_id).eq("status", "active").execute()

    logger.info(f"Archived active sessions for user {user_id}")

    # Create the new session
    result = (
        supabase.table("agent_sessions")
        .insert({"user_id": user_id, "status": "active"})
        .execute()
    )
    if not result.data:
        raise RuntimeError("Failed to create new session.")

    new_session_id = result.data[0]["id"]
    logger.info(f"New session {new_session_id} created for user {user_id}")
    return {"session_id": new_session_id}