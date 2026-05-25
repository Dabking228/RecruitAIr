from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import require_recruiter, CurrentUser
from app.services import company_service
from app.schemas.company import CreateCompanyRequest, CompanyResponse

router = APIRouter()


@router.get("/my-company")
async def get_my_company(
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Returns the recruiter's company profile.
    Returns { "company": null } if they haven't created one yet.
    This is intentionally not a 404 — the frontend checks the
    null value and shows a creation form.
    """
    company = company_service.get_company_by_recruiter(current_user.user_id)
    return {"company": company}


@router.post("/", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    request: CreateCompanyRequest,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Creates a company profile for the recruiter.
    A recruiter can only have one company in the MVP.
    """
    try:
        company = company_service.create_company(
            recruiter_id=current_user.user_id,
            name=request.name,
            industry=request.industry,
            website=request.website,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    return company