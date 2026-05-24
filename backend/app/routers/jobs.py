from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, require_recruiter, CurrentUser

router = APIRouter()


@router.get("/")
async def list_jobs(current_user: CurrentUser = Depends(get_current_user)):
    """List all open jobs. Available to all logged-in users."""
    return {"message": "Jobs list — coming in Phase 9", "user": current_user.user_id}


@router.post("/")
async def create_job(current_user: CurrentUser = Depends(require_recruiter)):
    """Create a new job. Recruiters only."""
    return {"message": "Create job — coming in Phase 9"}