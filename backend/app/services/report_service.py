"""
Generates the AI candidate assessment report for a specific application.

No DB storage — reports are generated fresh on demand.
The recruiter sees a live analysis every time they view the report.
"""
import logging
from app.db.supabase_client import supabase
from app.ai.report_generator import generate_report

logger = logging.getLogger(__name__)


def _verify_recruiter_owns_application(application_id: str, recruiter_id: str) -> dict:
    """Ownership check — same pattern used across all services."""
    result = (
        supabase.table("applications")
        .select("id, candidate_id, job_id, jobs(id, title, recruiter_id)")
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Application not found.")

    application = result.data[0]
    if application["jobs"]["recruiter_id"] != recruiter_id:
        raise ValueError("You do not have permission to access this application.")

    return application


def _get_claims_with_evidence(candidate_id: str) -> list[dict]:
    """Two-query pattern — same approach used in interview_service and match_service."""
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

    verif_result = (
        supabase.table("claim_verifications")
        .select("claim_id, status")
        .in_("claim_id", claim_ids)
        .execute()
    )
    verif_by_claim = {v["claim_id"]: v for v in (verif_result.data or [])}

    enriched = []
    for claim in claims:
        ev_result = (
            supabase.table("evidence")
            .select("id", count="exact")
            .eq("claim_id", claim["id"])
            .execute()
        )
        enriched.append({
            "claim_text": claim["claim_text"],
            "claim_type": claim["claim_type"],
            "verification_status": verif_by_claim.get(claim["id"], {}).get("status", "ai_inferred"),
            "evidence_count": ev_result.count or 0,
        })

    return enriched


def generate_candidate_report(application_id: str, recruiter_id: str) -> dict:
    """
    Gathers all context for a candidate application and generates a
    structured AI assessment report.

    This function never saves to the database. Call it again to regenerate.

    Args:
        application_id: The application to report on
        recruiter_id:   Must own the job this application is for

    Returns:
        Report dict: executive_summary, strengths, evidence_highlights,
                     evidence_gaps, concerns, recommended_next_step.
        Also includes 'candidate_name', 'job_title', and 'scores' for
        the frontend to display without a second API call.

    Raises:
        ValueError: ownership failure, missing scores, or AI error
    """
    # Step 1: ownership + basic info
    application = _verify_recruiter_owns_application(application_id, recruiter_id)
    job = application["jobs"]

    # Step 2: job requirements
    req_result = (
        supabase.table("job_requirements")
        .select("requirement_type, name, importance, weight, evidence_expected")
        .eq("job_id", application["job_id"])
        .execute()
    )
    requirements = req_result.data or []

    # Step 3: candidate claims + evidence
    claims = _get_claims_with_evidence(application["candidate_id"])

    # Step 4: match scores — report requires scoring to have run first
    score_result = (
        supabase.table("match_scores")
        .select("*")
        .eq("application_id", application_id)
        .execute()
    )
    if not score_result.data:
        raise ValueError(
            "This application has not been scored yet. "
            "Run AI scoring first, then generate the report."
        )
    scores = score_result.data[0]

    # Step 5: candidate name for the frontend header
    user_result = (
        supabase.table("users")
        .select("name, email")
        .eq("id", application["candidate_id"])
        .execute()
    )
    user = user_result.data[0] if user_result.data else {}
    candidate_name = user.get("name") or user.get("email", "Candidate")

    logger.info(
        f"Generating report for application {application_id}: "
        f"candidate='{candidate_name}', job='{job['title']}'"
    )

    # Step 6: call Gemini
    report = generate_report(
        job_title=job["title"],
        requirements=requirements,
        claims=claims,
        scores=scores,
    )

    # Attach context the frontend needs for the page header
    report["candidate_name"] = candidate_name
    report["job_title"] = job["title"]
    report["scores"] = scores

    return report