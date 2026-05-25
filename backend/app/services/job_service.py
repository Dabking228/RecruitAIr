"""
Job service — business logic for job management.
All database operations for the jobs table live here.
"""
from app.db.supabase_client import supabase


def get_jobs_by_recruiter(recruiter_id: str) -> list[dict]:
    """
    Returns all jobs created by this recruiter, newest first.
    Joins the company name for display.
    """
    result = (
        supabase.table("jobs")
        .select("*, companies(name)")
        .eq("recruiter_id", recruiter_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_job_by_id(job_id: str, recruiter_id: str) -> dict | None:
    """
    Returns a single job with its requirements.
    Only returns it if this recruiter owns it (prevents data leaks).
    """
    result = (
        supabase.table("jobs")
        .select("*, companies(name), job_requirements(*)")
        .eq("id", job_id)
        .eq("recruiter_id", recruiter_id)
        .single()
        .execute()
    )
    return result.data


def create_job(
    recruiter_id: str,
    company_id: str,
    title: str,
    description: str,
    location: str | None = None,
    work_mode: str | None = None,
    employment_type: str | None = None,
    verification_threshold: int = 60,
) -> dict:
    """
    Creates a new job in 'draft' status.
    The job stays draft until the recruiter confirms
    the AI-extracted requirements and publishes it.
    """
    result = (
        supabase.table("jobs")
        .insert({
            "recruiter_id": recruiter_id,
            "company_id": company_id,
            "title": title,
            "description": description,
            "location": location,
            "work_mode": work_mode,
            "employment_type": employment_type,
            "verification_threshold": verification_threshold,
            "status": "draft",   # always starts as draft
        })
        .execute()
    )
    return result.data[0]


def update_job_status(job_id: str, recruiter_id: str, status: str) -> dict:
    """
    Updates a job's status. Recruiter must own the job.
    Valid transitions: draft → open, open → closed.
    """
    result = (
        supabase.table("jobs")
        .update({"status": status})
        .eq("id", job_id)
        .eq("recruiter_id", recruiter_id)   # ownership check
        .execute()
    )
    if not result.data:
        raise ValueError("Job not found or you do not own this job.")
    return result.data[0]