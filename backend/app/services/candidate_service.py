"""
Business logic for candidate profiles and documents.
All database access for the candidate module goes through here.
"""
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


# ── Profile ───────────────────────────────────────────────────

def get_candidate_profile(user_id: str) -> dict | None:
    """
    Returns the candidate's profile row, or None if it does not exist.
    We use .execute() and check result.data instead of .single()
    because .single() raises an exception when no row is found.
    """
    result = (
        supabase.table("candidate_profiles")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def upsert_candidate_profile(user_id: str, profile_data: dict) -> dict:
    """
    Creates a new profile or updates the existing one.
    Uses ON CONFLICT (user_id) DO UPDATE — one candidate, one profile.
    """
    payload = {"user_id": user_id, **profile_data}

    result = (
        supabase.table("candidate_profiles")
        .upsert(payload, on_conflict="user_id")
        .execute()
    )

    if not result.data:
        raise RuntimeError("Failed to save candidate profile.")

    logger.info(f"Profile upserted for user {user_id}")
    return result.data[0]


# ── Documents ─────────────────────────────────────────────────

def save_document_record(
    candidate_id: str,
    file_url: str,
    file_type: str,
    application_id: str | None = None,
) -> dict:
    """
    Saves a document record AFTER the file has been uploaded to Supabase Storage.
    This function only saves the reference (file_url), not the file itself.
    """
    result = (
        supabase.table("documents")
        .insert({
            "candidate_id": candidate_id,
            "file_url": file_url,
            "file_type": file_type,
            "application_id": application_id,
        })
        .execute()
    )

    if not result.data:
        raise RuntimeError("Failed to save document record.")

    logger.info(f"Document record saved for candidate {candidate_id}: {file_type}")
    return result.data[0]


def get_candidate_documents(candidate_id: str) -> list[dict]:
    """Returns all documents uploaded by this candidate, newest first."""
    result = (
        supabase.table("documents")
        .select("*")
        .eq("candidate_id", candidate_id)
        .order("uploaded_at", desc=True)
        .execute()
    )
    return result.data or []


def delete_document(document_id: str, candidate_id: str) -> bool:
    """
    Deletes a document record.
    The candidate_id check enforces ownership — a candidate cannot
    delete another candidate's document by guessing the ID.
    Note: this deletes the DB record only. The file in Storage must
    be deleted separately (we will handle this in the service).
    """
    result = (
        supabase.table("documents")
        .delete()
        .eq("id", document_id)
        .eq("candidate_id", candidate_id)   # ownership check
        .execute()
    )
    return bool(result.data)


def get_document_by_id(document_id: str, candidate_id: str) -> dict | None:
    """Fetch a single document, verifying ownership."""
    result = (
        supabase.table("documents")
        .select("*")
        .eq("id", document_id)
        .eq("candidate_id", candidate_id)
        .execute()
    )
    return result.data[0] if result.data else None