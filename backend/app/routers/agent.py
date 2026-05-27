"""
Agent router — HTTP endpoints for the AI chat drawer.

Two chat endpoints are intentionally separate:
  /recruiter/chat  → require_recruiter + recruiter tools
  /candidate/chat  → require_candidate + candidate tools

Session endpoints (/session, /sessions) are accessible to both roles.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth.dependencies import get_current_user, require_recruiter, require_candidate, CurrentUser
from app.services import agent_session_service
from app.agent.agent_loop import run_agent
from app.agent.tools.recruiter_tools import make_recruiter_tools
from app.agent.tools.candidate_tools import make_candidate_tools

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schemas ───────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str
    context: dict | None = None


# ── Session endpoints (both roles) ───────────────────────────

@router.get("/session")
async def get_active_session(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Called when the agent drawer opens.
    Returns the user's active session and its full message history.
    Creates a new session automatically if none exists.
    """
    try:
        session = agent_session_service.get_or_create_active_session(
            user_id=current_user.user_id,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return session


@router.get("/sessions")
async def get_past_sessions(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the user's archived session list for the history sidebar.
    Each entry includes a short preview of the first message.
    """
    sessions = agent_session_service.get_past_sessions(user_id=current_user.user_id)
    return {"sessions": sessions}


@router.get("/session/{session_id}")
async def load_session(
    session_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Loads a specific session (active or archived) with its full message history.
    Used when the user clicks a past session in the history sidebar.
    Returns 404 if the session does not exist or belongs to another user.
    """
    session = agent_session_service.load_session(
        session_id=session_id,
        user_id=current_user.user_id,
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    return session


@router.post("/session/new")
async def new_session(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Archives the current active session and creates a fresh one.
    Called when the user clicks '+ New Session' in the drawer.
    """
    try:
        session = agent_session_service.create_new_session(user_id=current_user.user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return session


# ── Chat endpoints ────────────────────────────────────────────

@router.post("/recruiter/chat")
async def recruiter_chat(
    body: ChatRequest,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Accepts a recruiter's message and returns the agent's response.

    Steps:
      1. Load existing message history for context
      2. Save the user's message
      3. Run the recruiter agent loop (Gemini + recruiter tools)
      4. Save the agent's response
      5. Return the response text

    The session_id in the request body must belong to the current user.
    If history load fails silently (e.g. session is new), the agent
    still runs — Gemini just has no prior context.
    """
    try:
        # Step 1: load history for Gemini context
        history = agent_session_service.get_session_messages(body.session_id)

        # Step 2: save user message before running the agent
        agent_session_service.save_message(
            session_id=body.session_id,
            role="user",
            content=body.message,
            context=body.context,
        )

        # Step 3: build tools with this recruiter's ID locked in
        tools = make_recruiter_tools(recruiter_id=current_user.user_id)

        # Step 4: run the agent loop
        response_text = run_agent(
            user_message=body.message,
            history=history,
            tools=tools,
            role="recruiter",
            context=body.context,
        )

        # Step 5: save the agent's response
        agent_session_service.save_message(
            session_id=body.session_id,
            role="assistant",
            content=response_text,
        )

    except ValueError as e:
        logger.warning(f"Recruiter agent value error: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Recruiter agent runtime error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        logger.error(f"Recruiter agent unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The agent encountered an unexpected error. Please try again.",
        )

    return {"response": response_text}


@router.post("/candidate/chat")
async def candidate_chat(
    body: ChatRequest,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Accepts a candidate's message and returns the agent's response.

    Identical flow to /recruiter/chat but uses candidate tools
    and the candidate system prompt.
    """
    try:
        # Step 1: load history
        history = agent_session_service.get_session_messages(body.session_id)

        # Step 2: save user message
        agent_session_service.save_message(
            session_id=body.session_id,
            role="user",
            content=body.message,
            context=body.context,
        )

        # Step 3: build tools with this candidate's ID locked in
        tools = make_candidate_tools(candidate_id=current_user.user_id)

        # Step 4: run the agent loop
        response_text = run_agent(
            user_message=body.message,
            history=history,
            tools=tools,
            role="candidate",
            context=body.context,
        )

        # Step 5: save the agent's response
        agent_session_service.save_message(
            session_id=body.session_id,
            role="assistant",
            content=response_text,
        )

    except ValueError as e:
        logger.warning(f"Candidate agent value error: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Candidate agent runtime error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        logger.error(f"Candidate agent unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The agent encountered an unexpected error. Please try again.",
        )

    return {"response": response_text}