from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter()


@router.post("/parse-job")
async def parse_job(current_user: CurrentUser = Depends(get_current_user)):
    return {"message": "AI job parser — coming in Phase 10"}


@router.post("/extract-claims")
async def extract_claims(current_user: CurrentUser = Depends(get_current_user)):
    return {"message": "AI claim extractor — coming in Phase 15"}