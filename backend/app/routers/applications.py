import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_user, require_candidate, require_recruiter, CurrentUser
from app.services import application_service
from app.db.supabase_client import supabase as db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/my")
async def get_my_applications(
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Returns all of the candidate's applications with job details.
    Includes match_scores if AI scoring has run.
    """
    applications = application_service.get_candidate_applications(current_user.user_id)
    return {"applications": applications, "total": len(applications)}


@router.get("/{application_id}")
async def get_application(
    application_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns a single application.
    Accessible to the candidate who owns it OR the recruiter who posted the job.
    """
    result = (
        db.table("applications")
        .select("*, jobs(*, companies(name)), match_scores(*)")
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Application not found.")

    app = result.data[0]

    # Access control: only the candidate or the job's recruiter
    is_candidate = app["candidate_id"] == current_user.user_id
    is_recruiter = (
        current_user.role == "recruiter"
        and app["jobs"]["recruiter_id"] == current_user.user_id
    )
    if not is_candidate and not is_recruiter:
        raise HTTPException(status_code=403, detail="Access denied.")

    return app


@router.put("/{application_id}/status")
async def update_status(
    application_id: str,
    request: dict,  # simple dict for now: {"status": "shortlisted"}
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Recruiter updates an application status."""
    new_status = request.get("status")
    try:
        updated = application_service.update_application_status(
            application_id=application_id,
            recruiter_id=current_user.user_id,
            new_status=new_status,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="Application not found.")

    return {"message": f"Application status updated to '{new_status}'.", "application": updated}