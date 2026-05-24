from pydantic import BaseModel
from typing import Optional
from enum import Enum


class WorkMode(str, Enum):
    onsite = "onsite"
    hybrid = "hybrid"
    remote = "remote"


class EmploymentType(str, Enum):
    internship = "internship"
    full_time = "full-time"
    part_time = "part-time"
    contract = "contract"


class JobStatus(str, Enum):
    draft = "draft"
    open = "open"
    closed = "closed"


class CreateJobRequest(BaseModel):
    title: str
    description: str
    location: Optional[str] = None
    work_mode: Optional[WorkMode] = None
    employment_type: Optional[EmploymentType] = None
    verification_threshold: int = 60


class JobResponse(BaseModel):
    id: str
    company_id: str
    recruiter_id: str
    title: str
    description: str
    location: Optional[str]
    work_mode: Optional[str]
    employment_type: Optional[str]
    verification_threshold: int
    status: str
    created_at: str