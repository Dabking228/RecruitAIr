from fastapi import APIRouter, Depends
from app.auth.dependencies import require_candidate, CurrentUser

router = APIRouter()


@router.post("/upload")
async def upload_document(current_user: CurrentUser = Depends(require_candidate)):
    return {"message": "Document upload — coming in Phase 14"}