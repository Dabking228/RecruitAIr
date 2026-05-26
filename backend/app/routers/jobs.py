from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.auth.dependencies import require_recruiter, get_current_user, CurrentUser, require_candidate
from app.services import job_service, company_service, application_service
from app.schemas.job import CreateJobRequest, JobResponse, SaveRequirementsRequest
from app.ai.job_parser import parse_job_description as ai_parse_job
from app.services.match_service import run_match_scoring

router = APIRouter()


@router.get("/")
async def list_my_jobs(
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Returns all jobs belonging to the current recruiter."""
    jobs = job_service.get_jobs_by_recruiter(current_user.user_id)
    return {"jobs": jobs}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_job(
    request: CreateJobRequest,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Creates a new job under the recruiter's company.
    The recruiter must have a company profile first.
    """
    # Ensure the recruiter has a company before creating a job
    company = company_service.get_company_by_recruiter(current_user.user_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must create a company profile before posting a job.",
        )

    job = job_service.create_job(
        recruiter_id=current_user.user_id,
        company_id=company["id"],
        title=request.title,
        description=request.description,
        location=request.location,
        work_mode=request.work_mode.value if request.work_mode else None,
        employment_type=request.employment_type.value if request.employment_type else None,
        verification_threshold=request.verification_threshold,
    )
    return job


# ── Candidate-facing routes ───────────────────────────────────
# IMPORTANT: These MUST be defined before any /{job_id} routes.
# FastAPI matches top-to-bottom: if /{job_id} appears first, a request
# to /open is swallowed by that pattern with job_id="open", and the
# correct handler is never reached.

@router.get("/open")
async def list_open_jobs(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns all open jobs for candidates to browse.
    Includes company name and industry.
    """
    jobs = application_service.get_open_jobs()
    return {"jobs": jobs, "total": len(jobs)}




@router.get("/{job_id}/public")
async def get_job_public(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns a job's full details and requirements for a candidate to review.
    Only accessible if the job is open.
    """
    job = application_service.get_job_for_candidate(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or no longer accepting applications.",
        )
    return job


@router.post("/{job_id}/apply")
async def apply_to_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Candidate submits an application to a job.

    Validates:
    - Job is open
    - Candidate has not already applied

    Does NOT validate profile completeness — the candidate is shown
    a readiness check on the frontend but is not hard-blocked.

    After creating the application row, scoring is kicked off in the
    background so the candidate sees "Application submitted" instantly
    rather than waiting 3-5 seconds for Gemini.
    """
    try:
        application = application_service.create_application(
            job_id=job_id,
            candidate_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Fire scoring in background — candidate doesn't wait for this
    background_tasks.add_task(run_match_scoring, application["id"])

    return {
        "message": "Application submitted successfully.",
        "application": application,
    }


@router.get("/{job_id}/readiness")
async def get_apply_readiness(
    job_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Returns the candidate's profile readiness before they apply.
    Also checks if they have already applied to this specific job.
    """
    readiness = application_service.get_candidate_readiness(current_user.user_id)
    existing = application_service.get_existing_application(job_id, current_user.user_id)

    return {
        **readiness,
        "already_applied": existing is not None,
        "existing_application": existing,
    }


@router.get("/{job_id}/applications")
async def get_job_applications(
    job_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Returns all applications for a job, sorted by submission date.
    Includes match scores and candidate name/email.
    Used by the recruiter's candidate ranking page.
    """
    try:
        applications = application_service.get_applications_for_job(
            job_id=job_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return {"applications": applications, "total": len(applications)}


# ── Recruiter-facing routes (dynamic /{job_id} segment) ───────
# All routes below contain /{job_id} and must come AFTER any
# fixed-string paths at the same level (e.g. /open above).

@router.get("/{job_id}")
async def get_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Returns a single job with its requirements."""
    job = job_service.get_job_by_id(job_id, current_user.user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )
    return job


@router.put("/{job_id}/status")
async def update_status(
    job_id: str,
    body: dict,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Updates a job's status (draft → open → closed)."""
    new_status = body.get("status")
    if new_status not in ("draft", "open", "closed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be one of: draft, open, closed",
        )
    try:
        job = job_service.update_job_status(job_id, current_user.user_id, new_status)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return job


@router.post("/{job_id}/parse")
async def parse_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Calls Gemini to parse the job description.

    IMPORTANT: This does NOT save anything to the database.
    It returns suggestions for the recruiter to review.
    The recruiter must call PUT /{job_id}/requirements to save.

    This separation is the human-in-the-loop design principle.
    """
    # Verify the recruiter owns this job
    job = job_service.get_job_by_id(job_id, current_user.user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )

    try:
        result = ai_parse_job(job["description"])
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    return result


@router.put("/{job_id}/requirements")
async def save_requirements(
    job_id: str,
    request: SaveRequirementsRequest,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Saves the recruiter-confirmed requirements to the database.
    Replaces any existing requirements for this job.
    """
    # Ownership check
    job = job_service.get_job_by_id(job_id, current_user.user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )

    if not request.requirements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one requirement must be provided.",
        )

    # Convert Pydantic models to plain dicts for the service
    requirements_data = [req.model_dump() for req in request.requirements]

    saved = job_service.save_job_requirements(job_id, requirements_data)

    return {
        "message": f"Saved {len(saved)} requirements successfully.",
        "requirements": saved,
    }