import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_user, require_candidate, CurrentUser
from app.services import claim_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def list_claims(
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Returns all profile-level claims for the candidate,
    with their verification records included.
    """
    claims = claim_service.get_candidate_claims(
        candidate_id=current_user.user_id,
        application_id=None,
    )
    return {"claims": claims, "total": len(claims)}


@router.delete("/{claim_id}")
async def delete_claim(
    claim_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Candidate removes an incorrect claim.
    The claim_verifications row is deleted automatically (CASCADE).
    """
    deleted = claim_service.delete_claim(
        claim_id=claim_id,
        candidate_id=current_user.user_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim not found or you do not have permission to delete it.",
        )
    return {"message": "Claim removed."}


@router.put("/{claim_id}/confirm")
async def confirm_claim(
    claim_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Candidate confirms a claim is accurate.
    Moves verification status from 'ai_inferred' to 'user_confirmed'.
    """
    result = claim_service.confirm_claim(
        claim_id=claim_id,
        candidate_id=current_user.user_id,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim not found.",
        )
    return {"message": "Claim confirmed.", "verification": result}