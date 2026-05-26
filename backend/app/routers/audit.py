import logging
from fastapi import APIRouter, Depends, Query
from app.auth.dependencies import require_recruiter, CurrentUser
from app.services import audit_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def get_audit_logs(
    current_user: CurrentUser = Depends(require_recruiter),
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Returns the most recent audit log entries scoped to this recruiter's
    applications. The 'limit' query param controls how many to return
    (default 50, max 200).
    """
    logs = audit_service.get_recruiter_audit_logs(
        recruiter_id=current_user.user_id,
        limit=limit,
    )
    return {"logs": logs, "total": len(logs)}