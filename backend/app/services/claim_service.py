"""
Database operations for claims and claim_verifications.
Both tables are managed together — every claim has exactly
one verification record that tracks its status.
"""
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


def get_candidate_claims(candidate_id: str, application_id: str | None = None) -> list[dict]:
    """
    Returns all claims for a candidate, with their verification record attached.
    Optionally filter by application_id.

    Uses two explicit queries instead of a PostgREST nested embed because the
    embedded select silently returns an empty array when PostgREST can't resolve
    the FK relationship (e.g. schema cache not refreshed, ambiguous FK).
    Two explicit queries are always reliable.
    """
    # ── Step 1: fetch the claims ───────────────────────────────
    query = (
        supabase.table("claims")
        .select("*")
        .eq("candidate_id", candidate_id)
    )

    if application_id:
        query = query.eq("application_id", application_id)
    else:
        query = query.is_("application_id", "null")

    result = query.order("created_at", desc=False).execute()
    claims = result.data or []

    if not claims:
        return []

    # ── Step 2: fetch all verifications for these claims ───────
    claim_ids = [c["id"] for c in claims]
    verif_result = (
        supabase.table("claim_verifications")
        .select("*")
        .in_("claim_id", claim_ids)
        .execute()
    )
    verifications = verif_result.data or []

    # ── Step 3: group by claim_id and attach ───────────────────
    verif_by_claim: dict[str, list] = {}
    for v in verifications:
        verif_by_claim.setdefault(v["claim_id"], []).append(v)

    for claim in claims:
        claim["claim_verifications"] = verif_by_claim.get(claim["id"], [])

    return claims


def save_extracted_claims(
    candidate_id: str,
    claims: list[dict],
    source_document_map: dict[str, str],  # source_hint → document_id
    application_id: str | None = None,
) -> list[dict]:
    """
    Saves a batch of AI-extracted claims and their initial verification records.

    Strategy:
    - Delete any existing claims for this candidate (same application context)
    - Insert all new claims
    - For each claim, insert a claim_verifications row with status 'ai_inferred'

    Args:
        candidate_id:       The candidate's user ID
        claims:             List of claim dicts from the AI extractor
        source_document_map: Maps source_hint keywords → document IDs
                            (best-effort — we try to link claims to source docs)
        application_id:     If applying to a specific job, link claims to it

    Returns:
        List of saved claim rows with their verification records
    """
    # Step 1: Clear existing claims for this context
    delete_query = (
        supabase.table("claims")
        .delete()
        .eq("candidate_id", candidate_id)
    )
    if application_id:
        delete_query = delete_query.eq("application_id", application_id)
    else:
        delete_query = delete_query.is_("application_id", "null")

    delete_query.execute()
    logger.info(f"Cleared existing claims for candidate {candidate_id}")

    if not claims:
        return []

    # Step 2: Insert all claims
    claim_rows = []
    for claim in claims:
        # Try to find which document this claim came from
        source_doc_id = None
        source_hint = claim.get("source_hint", "").lower()
        for hint_keyword, doc_id in source_document_map.items():
            if hint_keyword.lower() in source_hint:
                source_doc_id = doc_id
                break

        claim_rows.append({
            "candidate_id": candidate_id,
            "application_id": application_id,
            "claim_text": claim["claim_text"],
            "claim_type": claim["claim_type"],
            "source_document_id": source_doc_id,
        })

    inserted_claims = supabase.table("claims").insert(claim_rows).execute()
    saved_claims = inserted_claims.data or []

    if not saved_claims:
        raise RuntimeError("Failed to save claims to the database.")

    # Step 3: Create a claim_verifications row for every claim
    # Initial status is always 'ai_inferred' — the candidate hasn't confirmed anything yet
    verification_rows = []
    for claim_data, claim_row in zip(claims, saved_claims):
        confidence_score = round(claim_data.get("confidence", 0.7) * 100, 1)
        verification_rows.append({
            "claim_id": claim_row["id"],
            "status": "ai_inferred",
            "confidence_score": confidence_score,
            "ai_reason": (
                f"Extracted from: {claim_data.get('source_hint', 'candidate documents')}. "
                f"Awaiting candidate confirmation and evidence."
            ),
            "candidate_confirmed": False,
        })

    supabase.table("claim_verifications").insert(verification_rows).execute()
    logger.info(f"Created {len(verification_rows)} verification records")

    # Return claims with verifications attached
    return get_candidate_claims(candidate_id, application_id)


def delete_claim(claim_id: str, candidate_id: str) -> bool:
    """
    Deletes a claim and its verification record.
    claim_verifications deletes automatically via ON DELETE CASCADE.
    Ownership is enforced by the candidate_id check.
    """
    result = (
        supabase.table("claims")
        .delete()
        .eq("id", claim_id)
        .eq("candidate_id", candidate_id)
        .execute()
    )
    return bool(result.data)


def confirm_claim(claim_id: str, candidate_id: str) -> dict | None:
    """
    Candidate confirms a claim is true.
    Updates the verification status from 'ai_inferred' to 'user_confirmed'.
    """
    # First verify ownership
    claim_check = (
        supabase.table("claims")
        .select("id")
        .eq("id", claim_id)
        .eq("candidate_id", candidate_id)
        .execute()
    )
    if not claim_check.data:
        return None  # Not found or not owned

    # Update the verification record
    result = (
        supabase.table("claim_verifications")
        .update({
            "status": "user_confirmed",
            "candidate_confirmed": True,
        })
        .eq("claim_id", claim_id)
        .execute()
    )
    return result.data[0] if result.data else None