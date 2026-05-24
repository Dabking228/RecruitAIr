from pydantic import BaseModel
from typing import Optional


class CreateCandidateProfileRequest(BaseModel):
    full_name: str
    summary: Optional[str] = None
    education: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class CandidateProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: str
    summary: Optional[str]
    education: Optional[str]
    portfolio_url: Optional[str]
    github_url: Optional[str]
    linkedin_url: Optional[str]
    created_at: str