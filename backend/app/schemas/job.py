from pydantic import BaseModel, Field
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

# ── Job Requirements ─────────────────────────────────────────

class RequirementType(str, Enum):
    required_skill = "required_skill"
    preferred_skill = "preferred_skill"
    responsibility = "responsibility"
    certification = "certification"


class ImportanceLevel(str, Enum):
    must_have = "must_have"
    nice_to_have = "nice_to_have"


class JobRequirementInput(BaseModel):
    """One requirement as sent from the frontend after recruiter review."""
    requirement_type: RequirementType
    name: str
    description: Optional[str] = None
    importance: ImportanceLevel
    weight: float = Field(default=1.0, ge=0.5, le=3.0)
    evidence_expected: bool = True


class SaveRequirementsRequest(BaseModel):
    """Request body for PUT /api/jobs/{job_id}/requirements"""
    requirements: list[JobRequirementInput]


class JobRequirementResponse(BaseModel):
    """One saved requirement returned from the database."""
    id: str
    job_id: str
    requirement_type: str
    name: str
    description: Optional[str]
    importance: str
    weight: float
    evidence_expected: bool