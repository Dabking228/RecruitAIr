"""
Manages evidence records linked to candidate claims.

Evidence is the candidate's proof for a specific claim.
Adding evidence automatically moves the claim's verification
status to 'verified'. Removing the last piece of evidence
reverts the status appropriately.
"""
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Evidence types that reference a URL vs those that reference an uploaded file
URL_EVIDENCE_TYPES = {"github", "link"}
FILE_EVIDENCE_TYPES = {"certificate", "screenshot", "file"}


def get_claim_evidence(claim_id: str) -> list[dict]:
    """Returns all evidence records for a specific claim."""
    result = (
        supabase.table("evidence")
        .select("*")
        .eq("claim_id", claim_id)
        .order("uploaded_at", desc=False)
        .execute()
    )
    return result.data or []


def add_evidence(
    candidate_id: str,
    claim_id: str,
    evidence_type: str,
    evidence_url: str,
    description: str | None = None,
) -> dict:
    """
    Adds a piece of evidence to a claim.

    After saving the evidence record, automatically updates the
    claim's verification status to 'verified'.

    Args:
        candidate_id:  The candidate's user ID (for ownership validation)
        claim_id:      Which claim this evidence supports
        evidence_type: One of github | link | certificate | screenshot | file
        evidence_url:  URL or storage path to the evidence
        description:   Optional note from the candidate

    Returns:
        The newly created evidence row

    Raises:
        ValueError: if the claim doesn't belong to this candidate
    """
    # ── Validate ownership ─────────────────────────────────────
    # The candidate can only add evidence to their own claims
    claim_check = (
        supabase.table("claims")
        .select("id, candidate_id")
        .eq("id", claim_id)
        .eq("candidate_id", candidate_id)
        .execute()
    )
    if not claim_check.data:
        raise ValueError("Claim not found or you do not have permission to add evidence.")

    # ── Save the evidence record ───────────────────────────────
    result = (
        supabase.table("evidence")
        .insert({
            "candidate_id": candidate_id,
            "claim_id": claim_id,
            "evidence_type": evidence_type,
            "evidence_url": evidence_url.strip(),
            "description": description.strip() if description else None,
        })
        .execute()
    )

    if not result.data:
        raise RuntimeError("Failed to save evidence record.")

    new_evidence = result.data[0]
    logger.info(f"Evidence added to claim {claim_id}: {evidence_type}")

    # ── Update verification status ─────────────────────────────
    _update_verification_status(claim_id)

    return new_evidence


def remove_evidence(evidence_id: str, candidate_id: str) -> bool:
    """
    Removes a piece of evidence and updates the claim's verification status.

    Returns True if deleted, False if not found.
    """
    # Get the evidence record first (we need claim_id for status update)
    evidence_check = (
        supabase.table("evidence")
        .select("id, claim_id, candidate_id")
        .eq("id", evidence_id)
        .eq("candidate_id", candidate_id)  # ownership check
        .execute()
    )
    if not evidence_check.data:
        return False

    claim_id = evidence_check.data[0]["claim_id"]

    # Delete the evidence record
    supabase.table("evidence").delete().eq("id", evidence_id).execute()
    logger.info(f"Evidence {evidence_id} removed from claim {claim_id}")

    # Recalculate verification status based on remaining evidence
    _update_verification_status(claim_id)

    return True


def _update_verification_status(claim_id: str) -> None:
    """
    Internal helper. Called after evidence is added or removed.
    Recalculates and saves the correct verification status.

    Reads candidate_confirmed from the DB — never overrides it.
    Only confirm_claim (the "Accurate" button) may change that flag.
    """
    # Count remaining evidence for this claim
    evidence_count_result = (
        supabase.table("evidence")
        .select("id", count="exact")
        .eq("claim_id", claim_id)
        .execute()
    )
    evidence_count = evidence_count_result.count or 0

    # Read current verification record
    verification_result = (
        supabase.table("claim_verifications")
        .select("id, status, candidate_confirmed")
        .eq("claim_id", claim_id)
        .execute()
    )
    if not verification_result.data:
        logger.warning(f"No verification record found for claim {claim_id}")
        return

    current = verification_result.data[0]

    # Always read candidate_confirmed from DB — never write a forced value
    is_confirmed = current.get("candidate_confirmed", False)

    # ── Calculate the new status ───────────────────────────────
    if evidence_count > 0:
        # Evidence exists → always "verified" (evidence-supported)
        new_status = "verified"
        ai_reason = (
            f"{evidence_count} piece(s) of evidence provided by candidate. "
            "Full evidence assessment will run when the application is scored."
        )
    elif is_confirmed:
        # No evidence but candidate confirmed → user_confirmed
        new_status = "user_confirmed"
        ai_reason = "Candidate confirmed this claim. No evidence provided yet."
    else:
        # No evidence, not confirmed → back to ai_inferred
        new_status = "ai_inferred"
        ai_reason = "Extracted by AI. Awaiting candidate confirmation and evidence."

    # ── Save the updated status ────────────────────────────────
    supabase.table("claim_verifications").update({
        "status": new_status,
        "candidate_confirmed": is_confirmed,
        "ai_reason": ai_reason,
    }).eq("claim_id", claim_id).execute()

    logger.info(f"Claim {claim_id} verification → {new_status} (evidence: {evidence_count})")