from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import require_recruiter, get_current_user, CurrentUser
from app.services import job_service, company_service
from app.schemas.job import CreateJobRequest, JobResponse, SaveRequirementsRequest
from app.ai.job_parser import parse_job_description as ai_parse_job

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