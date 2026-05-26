from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.auth.dependencies import require_candidate, CurrentUser
from app.services import candidate_service

router = APIRouter()

# ── Schemas (document-specific, small enough to define here) ──

VALID_FILE_TYPES = {
    "resume",
    "certificate",
    "screenshot",
    "portfolio_image",
    "project_document",
}


class SaveDocumentRequest(BaseModel):
    """
    The frontend sends this after uploading the file to Supabase Storage.
    We receive the path, not the file bytes.
    """
    file_url: str           # e.g. "user-id/resume/1748123456_cv.pdf"
    file_type: str          # must be one of VALID_FILE_TYPES
    application_id: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────

@router.post("/")
async def save_document(
    request: SaveDocumentRequest,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Saves a document record after the file has been uploaded to Supabase Storage.
    The frontend is responsible for the upload — this endpoint only stores
    the reference and metadata.
    """
    if request.file_type not in VALID_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{request.file_type}'. "
                   f"Allowed: {', '.join(sorted(VALID_FILE_TYPES))}",
        )

    if not request.file_url.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_url cannot be empty.",
        )

    document = candidate_service.save_document_record(
        candidate_id=current_user.user_id,
        file_url=request.file_url,
        file_type=request.file_type,
        application_id=request.application_id,
    )
    return document


@router.get("/")
async def list_documents(
    current_user: CurrentUser = Depends(require_candidate),
):
    """Returns all documents uploaded by this candidate."""
    documents = candidate_service.get_candidate_documents(current_user.user_id)
    return {"documents": documents}


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Deletes a document record from the database.
    Note: the file in Supabase Storage is deleted from the frontend
    (the frontend has the storage path and uses the browser client).
    """
    deleted = candidate_service.delete_document(
        document_id=document_id,
        candidate_id=current_user.user_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or you do not have permission to delete it.",
        )
    return {"message": "Document deleted successfully."}