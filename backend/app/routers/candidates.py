from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import require_candidate, CurrentUser
from app.schemas.candidate import CreateCandidateProfileRequest, CandidateProfileResponse
from app.services import candidate_service, document_service, claim_service
from app.ai.claim_extractor import extract_claims_from_profile
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/profile")
async def get_profile(
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Returns the candidate's profile.
    Returns 404 if the candidate has not created a profile yet.
    The frontend uses this to decide whether to show a blank form
    (first time) or a pre-filled form (returning user).
    """
    profile = candidate_service.get_candidate_profile(current_user.user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. Please create your profile.",
        )
    return profile


@router.put("/profile")
async def save_profile(
    request: CreateCandidateProfileRequest,
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Creates or updates the candidate profile (upsert).
    Always safe to call — will not create duplicates.
    """
    profile_data = request.model_dump(exclude_none=True)

    profile = candidate_service.upsert_candidate_profile(
        user_id=current_user.user_id,
        profile_data=profile_data,
    )
    return profile


@router.post("/extract-claims")
async def extract_claims(
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Full pipeline — one endpoint, three steps:

    Step 1: Load the candidate's profile and all their documents
    Step 2: For any PDF documents without extracted text, download and extract it now
    Step 3: Send everything to Gemini → get back structured claims
            → save claims + verification records to DB

    Returns the full list of saved claims with their verification records.

    This does NOT save to a specific application — claims are extracted
    at the profile level first. They are linked to an application when
    the candidate applies to a job (Phase 11).
    """
    user_id = current_user.user_id

    # ── Step 1: Load data ──────────────────────────────────────
    profile = candidate_service.get_candidate_profile(user_id)
    documents = candidate_service.get_candidate_documents(user_id)

    if not documents and not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please complete your profile and upload at least one document first.",
        )

    # ── Step 2: Extract text from any PDFs that don't have it yet ──
    extractable_types = {"resume", "certificate", "project_document"}

    for doc in documents:
        if doc.get("extracted_text"):
            continue  # already extracted — skip
        if doc.get("file_type") not in extractable_types:
            continue  # image file — skip

        logger.info(f"Extracting text from document: {doc['id']}")
        try:
            doc["extracted_text"] = document_service.extract_and_store_text(
                document_id=doc["id"],
                file_url=doc["file_url"],
                file_type=doc["file_type"],
            )
        except ValueError as e:
            # Log but don't fail the whole extraction if one doc fails
            logger.warning(f"Text extraction failed for doc {doc['id']}: {e}")

    # ── Step 3: Build source_document_map for claim linking ────
    # Maps file_type → document_id so the claim service can try to
    # link each claim to its source document
    source_document_map = {
        doc["file_type"]: doc["id"]
        for doc in documents
        if doc.get("extracted_text")
    }

    # ── Step 4: Call Gemini for claim extraction ───────────────
    try:
        extracted = extract_claims_from_profile(profile, documents)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    # ── Step 5: Save claims + verification records ─────────────
    saved_claims = claim_service.save_extracted_claims(
        candidate_id=user_id,
        claims=extracted,
        source_document_map=source_document_map,
        application_id=None,  # profile-level extraction, not application-specific
    )

    return {
        "message": f"Successfully extracted {len(saved_claims)} claims.",
        "claims": saved_claims,
    }