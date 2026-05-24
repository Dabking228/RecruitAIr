from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter()


@router.get("/")
async def list_claims(current_user: CurrentUser = Depends(get_current_user)):
    return {"message": "Claims list — coming in Phase 15"}