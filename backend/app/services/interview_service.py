"""
Manages the full interview question lifecycle:
  generate  → AI returns suggestions (not saved)
  save      → recruiter confirms, saved to DB
  get       → retrieve saved questions
  delete    → recruiter removes individual questions
"""
import logging
from app.db.supabase_client import supabase
from app.ai.interview_question_generator import generate_interview_questions
from app.services import audit_service

logger = logging.getLogger(__name__)


# ── Private helpers ───────────────────────────────────────────

def _verify_recruiter_owns_application(application_id: str, recruiter_id: str) -> dict:
    """
    Checks that this application belongs to a job owned by this recruiter.
    Returns the application row on success.
    Raises ValueError if not found or not owned.
    """
    result = (
        supabase.table("applications")
        .select("id, candidate_id, job_id, jobs(id, title, description, recruiter_id)")
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Application not found.")

    application = result.data[0]
    job = application.get("jobs", {})

    if job.get("recruiter_id") != recruiter_id:
        raise ValueError("You do not have permission to access this application.")

    return application


def _get_claims_with_evidence(candidate_id: str) -> list[dict]:
    """
    Fetches all claims for a candidate enriched with verification status
    and evidence count. Uses two explicit queries — same pattern as match_service.
    """
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
        verif = verif_by_claim.get(claim["id"], {})
        ev_count_result = (
            supabase.table("evidence")
            .select("id", count="exact")
            .eq("claim_id", claim["id"])
            .execute()
        )
        enriched.append({
            "claim_text": claim["claim_text"],
            "claim_type": claim["claim_type"],
            "verification_status": verif.get("status", "ai_inferred"),
            "evidence_count": ev_count_result.count or 0,
        })

    return enriched


# ── Public functions ──────────────────────────────────────────

def generate_questions(application_id: str, recruiter_id: str) -> list[dict]:
    """
    Gathers all context and calls Gemini to generate interview questions.

    IMPORTANT: This does NOT save anything to the database.
    The recruiter reviews the suggestions and calls save_questions() to confirm.

    Returns a list of question dicts (question, question_type, reason).
    Raises ValueError for ownership failures or AI errors.
    """
    # Step 1: ownership check + get application, job, requirements
    application = _verify_recruiter_owns_application(application_id, recruiter_id)
    job = application["jobs"]
    candidate_id = application["candidate_id"]

    requirements_result = (
        supabase.table("job_requirements")
        .select("requirement_type, name, importance, evidence_expected")
        .eq("job_id", application["job_id"])
        .execute()
    )
    requirements = requirements_result.data or []

    # Step 2: get candidate claims
    claims = _get_claims_with_evidence(candidate_id)

    # Step 3: get match scores (optional — give zeros if not yet scored)
    score_result = (
        supabase.table("match_scores")
        .select("job_fit_score, evidence_confidence_score, required_skill_match")
        .eq("application_id", application_id)
        .execute()
    )
    scores = score_result.data[0] if score_result.data else {}

    logger.info(
        f"Generating questions for application {application_id}: "
        f"{len(requirements)} requirements, {len(claims)} claims"
    )

    # Step 4: call Gemini
    return generate_interview_questions(
        job_title=job["title"],
        job_description=job.get("description") or "",
        requirements=requirements,
        claims=claims,
        job_fit_score=scores.get("job_fit_score", 0),
        evidence_confidence_score=scores.get("evidence_confidence_score", 0),
        required_skill_match=scores.get("required_skill_match", 0),
    )


def save_questions(
    application_id: str,
    questions: list[dict],
    recruiter_id: str,
) -> list[dict]:
    """
    Saves the recruiter-confirmed questions to the database.

    Strategy: delete-then-insert (same as save_job_requirements).
    Calling this twice replaces the previous set of questions.

    Args:
        application_id: The application being prepared for interview
        questions:      List of {question, question_type, reason} dicts
        recruiter_id:   Must own the job this application is for

    Returns:
        The saved question rows.
    Raises:
        ValueError: if no questions provided or recruiter doesn't own the job
    """
    # Ownership check
    _verify_recruiter_owns_application(application_id, recruiter_id)

    if not questions:
        raise ValueError("At least one question must be confirmed.")

    # Step 1: delete any existing questions for this application
    supabase.table("interview_questions").delete().eq(
        "application_id", application_id
    ).execute()

    # Step 2: insert the confirmed questions
    rows = [
        {
            "application_id": application_id,
            "question": q["question"],
            "question_type": q["question_type"],
            "reason": q.get("reason"),
        }
        for q in questions
    ]

    result = supabase.table("interview_questions").insert(rows).execute()

    if not result.data:
        raise RuntimeError("Failed to save interview questions.")

    logger.info(f"Saved {len(rows)} interview questions for application {application_id}")

    audit_service.log_action(
        user_id=recruiter_id,
        action="questions.saved",
        target_type="application",
        target_id=application_id,
        metadata={"question_count": len(rows)},
    )

    return result.data


def get_questions(application_id: str) -> list[dict]:
    """Returns all saved interview questions for an application."""
    result = (
        supabase.table("interview_questions")
        .select("*")
        .eq("application_id", application_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def delete_question(question_id: str, recruiter_id: str) -> bool:
    """
    Deletes a single interview question.
    Ownership is enforced with two explicit queries — avoids deep nested
    embed issues (interview_questions → applications → jobs would require
    a two-level PostgREST embed that silently fails when schema cache is stale).
    Returns True if deleted, False if not found.
    Raises ValueError if recruiter does not own the job.
    """
    # Step 1: find the question to get its application_id
    q_result = (
        supabase.table("interview_questions")
        .select("id, application_id")
        .eq("id", question_id)
        .execute()
    )
    if not q_result.data:
        return False

    application_id = q_result.data[0]["application_id"]

    # Step 2: ownership check — raises ValueError if access denied
    _verify_recruiter_owns_application(application_id, recruiter_id)

    # Step 3: delete
    supabase.table("interview_questions").delete().eq("id", question_id).execute()
    return True