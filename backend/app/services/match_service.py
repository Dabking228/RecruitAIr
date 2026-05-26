"""
Orchestrates AI scoring for a job application.

Called in two ways:
  1. Automatically as a BackgroundTask after a candidate applies (jobs.py)
  2. Manually by a recruiter via POST /api/applications/{id}/score

Both paths call run_match_scoring(application_id).
"""
import logging
from app.db.supabase_client import supabase
from app.ai.candidate_matcher import score_candidate_against_job

logger = logging.getLogger(__name__)


def _get_job_requirements(job_id: str) -> list[dict]:
    result = (
        supabase.table("job_requirements")
        .select("requirement_type, name, description, importance, weight, evidence_expected")
        .eq("job_id", job_id)
        .execute()
    )
    return result.data or []


def _get_candidate_claims_with_evidence(candidate_id: str) -> list[dict]:
    """
    Fetches all claims for a candidate, enriched with their verification
    status and evidence count.

    Uses two explicit queries (not nested embed) for reliability.
    See claim_service.get_candidate_claims() for the same reasoning.
    """
    # Query 1: all claims for this candidate
    claims_result = (
        supabase.table("claims")
        .select("id, claim_text, claim_type")
        .eq("candidate_id", candidate_id)
        .execute()
    )
    claims = claims_result.data or []

    if not claims:
        return []

    claim_ids = [c["id"] for c in claims]

    # Query 2: all verifications for these claims
    verif_result = (
        supabase.table("claim_verifications")
        .select("claim_id, status, candidate_confirmed")
        .in_("claim_id", claim_ids)
        .execute()
    )
    verif_by_claim = {v["claim_id"]: v for v in (verif_result.data or [])}

    # Enrich each claim with its verification status and evidence count
    enriched = []
    for claim in claims:
        verif = verif_by_claim.get(claim["id"], {})

        # Count evidence for this claim
        ev_result = (
            supabase.table("evidence")
            .select("id", count="exact")
            .eq("claim_id", claim["id"])
            .execute()
        )
        evidence_count = ev_result.count or 0

        enriched.append({
            "claim_text": claim["claim_text"],
            "claim_type": claim["claim_type"],
            "verification_status": verif.get("status", "ai_inferred"),
            "candidate_confirmed": verif.get("candidate_confirmed", False),
            "evidence_count": evidence_count,
        })

    return enriched


def run_match_scoring(application_id: str) -> dict:
    """
    Main entry point. Scores a candidate against a job and saves to match_scores.

    Steps:
      1. Load the application → get job_id and candidate_id
      2. Load the job's title and requirements
      3. Load the candidate's claims with evidence counts
      4. Call Gemini to produce 5 scores + recommendation
      5. Upsert into match_scores (safe to re-run — replaces the old score)

    Returns the saved match_scores row.
    Raises ValueError for any data problem (caught by the router).
    """
    # Step 1: load application
    app_result = (
        supabase.table("applications")
        .select("id, job_id, candidate_id")
        .eq("id", application_id)
        .execute()
    )
    if not app_result.data:
        raise ValueError(f"Application {application_id} not found.")

    application = app_result.data[0]
    job_id = application["job_id"]
    candidate_id = application["candidate_id"]   # this is the auth user_id directly

    # Step 2: load job info
    # Note: jobs table has no job_summary column — the AI parser returns a summary
    # as a suggestion but never persists it. We pass the full description instead,
    # which gives Gemini better context for scoring anyway.
    job_result = (
        supabase.table("jobs")
        .select("title, description")
        .eq("id", job_id)
        .execute()
    )
    if not job_result.data:
        raise ValueError(f"Job {job_id} not found.")

    job = job_result.data[0]
    requirements = _get_job_requirements(job_id)

    # Step 3: load candidate's claims
    claims = _get_candidate_claims_with_evidence(candidate_id)

    logger.info(
        f"Scoring application {application_id}: "
        f"{len(requirements)} requirements, {len(claims)} claims"
    )

    # Step 4: call Gemini
    try:
        scores = score_candidate_against_job(
            job_title=job["title"],
            job_summary=job.get("description") or "",
            requirements=requirements,
            claims=claims,
        )
    except ValueError as e:
        logger.error(f"Scoring failed for application {application_id}: {e}")
        raise

    # Step 5: upsert into match_scores
    # UNIQUE constraint on application_id — upsert is safe even if re-run
    score_row = {
        "application_id": application_id,
        "job_fit_score": scores["job_fit_score"],
        "evidence_confidence_score": scores["evidence_confidence_score"],
        "required_skill_match": scores["required_skill_match"],
        "preferred_skill_match": scores["preferred_skill_match"],
        "experience_relevance_score": scores["experience_relevance_score"],
        "recommendation": scores["recommendation"],
    }

    saved = (
        supabase.table("match_scores")
        .upsert(score_row, on_conflict="application_id")
        .execute()
    )

    if not saved.data:
        raise RuntimeError("Failed to save match score to the database.")

    logger.info(
        f"Score saved for application {application_id}: "
        f"fit={scores['job_fit_score']}, recommendation={scores['recommendation']}"
    )

    return saved.data[0]