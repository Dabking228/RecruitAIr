"""
Manages job applications — the link between a candidate and a job.
An application is created at submit time and updated as the recruiter
moves the candidate through the hiring pipeline.
"""
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


# ── Reading applications ──────────────────────────────────────

def get_open_jobs() -> list[dict]:
    """
    Returns all open jobs with company name joined.
    Used by the candidate jobs browsing page.
    """
    result = (
        supabase.table("jobs")
        .select("*, companies(name, industry)")
        .eq("status", "open")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_job_for_candidate(job_id: str) -> dict | None:
    """
    Returns a job with its requirements and company info.
    Only returns the job if its status is 'open'.
    Used by the candidate to review a job before applying.
    """
    result = (
        supabase.table("jobs")
        .select("*, companies(name, industry, website), job_requirements(*)")
        .eq("id", job_id)
        .eq("status", "open")
        .execute()
    )
    return result.data[0] if result.data else None


def get_existing_application(job_id: str, candidate_id: str) -> dict | None:
    """
    Checks if a candidate has already applied to this job.
    Returns the application row if found, None otherwise.
    """
    result = (
        supabase.table("applications")
        .select("*")
        .eq("job_id", job_id)
        .eq("candidate_id", candidate_id)
        .execute()
    )
    return result.data[0] if result.data else None


def get_candidate_applications(candidate_id: str) -> list[dict]:
    """
    Returns all applications for a candidate with job, company, and score info.
    Used by the candidate's My Applications page.

    Uses explicit separate queries for match_scores rather than a PostgREST
    FK embed — the embed silently returns [] when the schema cache hasn't
    mapped the FK, causing scores to never appear on the frontend.
    """
    # Query 1: applications with job + company info
    result = (
        supabase.table("applications")
        .select("""
            id, status, submitted_at, candidate_id,
            jobs(
                title,
                location,
                work_mode,
                employment_type,
                companies(name)
            )
        """)
        .eq("candidate_id", candidate_id)
        .order("submitted_at", desc=True)
        .execute()
    )
    apps = result.data or []

    if not apps:
        return []

    # Query 2: match scores — explicit query, same pattern as get_applications_for_job
    app_ids = [a["id"] for a in apps]
    scores_result = (
        supabase.table("match_scores")
        .select("application_id, job_fit_score, evidence_confidence_score, recommendation")
        .in_("application_id", app_ids)
        .execute()
    )
    scores_by_app = {
        s["application_id"]: s
        for s in (scores_result.data or [])
    }

    # Attach scores — keep as a list to match the shape the frontend expects
    for app in apps:
        score = scores_by_app.get(app["id"])
        app["match_scores"] = [score] if score else []

    return apps


def get_candidate_readiness(candidate_id: str) -> dict:
    """
    Checks how ready a candidate's profile is before applying.
    Returns a dict of checks and an overall readiness level.

    This is informational only — it does not block the application.
    """
    checks = {
        "has_profile": False,
        "has_resume": False,
        "has_claims": False,
        "has_evidence": False,
    }

    # Check profile
    profile = (
        supabase.table("candidate_profiles")
        .select("id, full_name, summary")
        .eq("user_id", candidate_id)
        .execute()
    )
    if profile.data and profile.data[0].get("full_name"):
        checks["has_profile"] = True

    # Check resume
    resume = (
        supabase.table("documents")
        .select("id")
        .eq("candidate_id", candidate_id)
        .eq("file_type", "resume")
        .execute()
    )
    if resume.data:
        checks["has_resume"] = True

    # Check claims
    claims = (
        supabase.table("claims")
        .select("id")
        .eq("candidate_id", candidate_id)
        .is_("application_id", "null")
        .execute()
    )
    if claims.data:
        checks["has_claims"] = True

    # Check evidence
    if claims.data:
        claim_ids = [c["id"] for c in claims.data]
        evidence = (
            supabase.table("evidence")
            .select("id")
            .in_("claim_id", claim_ids)
            .execute()
        )
        if evidence.data:
            checks["has_evidence"] = True

    # Calculate readiness level
    passed = sum(checks.values())
    if passed == 4:
        level = "excellent"
    elif passed == 3:
        level = "good"
    elif passed == 2:
        level = "fair"
    else:
        level = "low"

    return {
        "checks": checks,
        "passed": passed,
        "total": 4,
        "level": level,
    }


# ── Creating and updating applications ───────────────────────

def create_application(job_id: str, candidate_id: str) -> dict:
    """
    Creates a new application record.

    Validates:
    1. The job exists and is open
    2. The candidate has not already applied

    Returns the created application row.
    Raises ValueError with a user-friendly message for validation failures.
    """
    # Check job is open
    job = (
        supabase.table("jobs")
        .select("id, status, title")
        .eq("id", job_id)
        .execute()
    )
    if not job.data:
        raise ValueError("Job not found.")
    if job.data[0]["status"] != "open":
        raise ValueError("This job is no longer accepting applications.")

    # Check for duplicate
    existing = get_existing_application(job_id, candidate_id)
    if existing:
        raise ValueError(
            f"You have already applied to this position. "
            f"Application status: {existing['status']}."
        )

    # Create the application
    try:
        result = (
            supabase.table("applications")
            .insert({
                "job_id": job_id,
                "candidate_id": candidate_id,
                "status": "submitted",
            })
            .execute()
        )
    except Exception as e:
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            raise ValueError("You have already applied to this job.")
        raise RuntimeError("Failed to create application. Please try again.")

    if not result.data:
        raise RuntimeError("Application was not saved correctly.")

    application = result.data[0]
    logger.info(
        f"Application created: candidate={candidate_id}, job={job_id}, "
        f"application={application['id']}"
    )
    return application


def update_application_status(
    application_id: str,
    recruiter_id: str,
    new_status: str,
) -> dict | None:
    """
    Recruiter updates the application status (shortlist, reject, invite).
    Validates that the recruiter owns the job this application is for.
    """
    valid_statuses = {"submitted", "shortlisted", "rejected", "interview_invited"}
    if new_status not in valid_statuses:
        raise ValueError(f"Invalid status: {new_status}")

    # Ownership check — recruiter must own the job
    ownership = (
        supabase.table("applications")
        .select("id, jobs(recruiter_id)")
        .eq("id", application_id)
        .execute()
    )
    if not ownership.data:
        return None

    job_recruiter_id = ownership.data[0]["jobs"]["recruiter_id"]
    if job_recruiter_id != recruiter_id:
        raise ValueError("You do not have permission to update this application.")

    result = (
        supabase.table("applications")
        .update({"status": new_status})
        .eq("id", application_id)
        .execute()
    )
    return result.data[0] if result.data else None


def get_applications_for_job(job_id: str, recruiter_id: str) -> list[dict]:
    """
    Returns all applications for a job, with match scores attached.
    Ownership check: the recruiter must own the job.
    Used by the recruiter's candidate ranking page.
    """
    # Ownership check
    job_check = (
        supabase.table("jobs")
        .select("id")
        .eq("id", job_id)
        .eq("recruiter_id", recruiter_id)
        .execute()
    )
    if not job_check.data:
        raise ValueError("Job not found.")

    # Query 1: applications (base columns only — no embed)
    apps_result = (
        supabase.table("applications")
        .select("id, status, submitted_at, candidate_id")
        .eq("job_id", job_id)
        .order("submitted_at", desc=True)
        .execute()
    )
    apps = apps_result.data or []

    if not apps:
        return []

    app_ids      = [a["id"]           for a in apps]
    candidate_ids = [a["candidate_id"] for a in apps]

    # Query 2: match scores — explicit query avoids PostgREST FK embed issues
    # (embed silently returns [] when schema cache hasn't mapped the FK)
    scores_result = (
        supabase.table("match_scores")
        .select(
            "application_id, job_fit_score, evidence_confidence_score, "
            "required_skill_match, preferred_skill_match, "
            "experience_relevance_score, recommendation"
        )
        .in_("application_id", app_ids)
        .execute()
    )
    scores_by_app = {
        s["application_id"]: s
        for s in (scores_result.data or [])
    }

    # Query 3: candidate name + email
    users_result = (
        supabase.table("users")
        .select("id, name, email")
        .in_("id", candidate_ids)
        .execute()
    )
    users_by_id = {u["id"]: u for u in (users_result.data or [])}

    # Assemble — frontend expects match_scores as a list (matches Supabase embed shape)
    for app in apps:
        score = scores_by_app.get(app["id"])
        app["match_scores"] = [score] if score else []
        app["candidate"]    = users_by_id.get(app["candidate_id"], {"name": None, "email": ""})

    return apps