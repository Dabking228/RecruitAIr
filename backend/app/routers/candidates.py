from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import require_candidate, CurrentUser
from app.schemas.candidate import CreateCandidateProfileRequest, CandidateProfileResponse
from app.services import candidate_service

router = APIRouter()


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