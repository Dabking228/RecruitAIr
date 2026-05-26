import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_user, require_candidate, CurrentUser
from app.services import claim_service, evidence_service
from pydantic import BaseModel, HttpUrl

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


# ── Evidence schemas (small enough to define here) ────────────

VALID_EVIDENCE_TYPES = {"github", "link", "certificate", "screenshot", "file"}


class AddEvidenceRequest(BaseModel):
    evidence_type: str
    evidence_url: str
    description: str | None = None


# ── Evidence routes ───────────────────────────────────────────

@router.get("/{claim_id}/evidence")
async def list_claim_evidence(
    claim_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """Returns all evidence linked to a specific claim."""
    evidence = evidence_service.get_claim_evidence(claim_id)
    return {"evidence": evidence}


@router.post("/{claim_id}/evidence")
async def add_claim_evidence(
    claim_id: str,
    request: AddEvidenceRequest,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Adds a piece of evidence to a claim.
    Automatically moves the claim's status to 'verified'.

    evidence_url can be:
      - A web URL: "https://github.com/username/project"
      - A Supabase Storage path: "user-id/certificate/cert.pdf"
    """
    if request.evidence_type not in VALID_EVIDENCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid evidence type. Allowed: {', '.join(sorted(VALID_EVIDENCE_TYPES))}",
        )

    if not request.evidence_url.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="evidence_url cannot be empty.",
        )

    try:
        new_evidence = evidence_service.add_evidence(
            candidate_id=current_user.user_id,
            claim_id=claim_id,
            evidence_type=request.evidence_type,
            evidence_url=request.evidence_url,
            description=request.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return new_evidence


@router.delete("/{claim_id}/evidence/{evidence_id}")
async def remove_claim_evidence(
    claim_id: str,
    evidence_id: str,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Removes a piece of evidence.
    If this was the last evidence for the claim, reverts status
    to 'user_confirmed' or 'ai_inferred' as appropriate.
    """
    removed = evidence_service.remove_evidence(
        evidence_id=evidence_id,
        candidate_id=current_user.user_id,
    )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found or you do not have permission to remove it.",
        )
    return {"message": "Evidence removed."}