# app/routers/candidates.py
from fastapi import APIRouter, Depends
from app.auth.dependencies import require_candidate, CurrentUser

router = APIRouter()


@router.get("/profile")
async def get_profile(current_user: CurrentUser = Depends(require_candidate)):
    return {"message": "Candidate profile — coming in Phase 12"}


@router.post("/profile")
async def create_profile(current_user: CurrentUser = Depends(require_candidate)):
    return {"message": "Create profile — coming in Phase 12"}