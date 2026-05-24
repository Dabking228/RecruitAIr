from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter()


@router.get("/{application_id}")
async def get_application(
    application_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    return {"message": f"Application {application_id} — coming in Phase 11"}