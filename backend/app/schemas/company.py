from pydantic import BaseModel
from typing import Optional


class CreateCompanyRequest(BaseModel):
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None


class CompanyResponse(BaseModel):
    id: str
    name: str
    industry: Optional[str]
    website: Optional[str]
    created_by: str
    created_at: str