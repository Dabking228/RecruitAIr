from pydantic import BaseModel
from typing import Optional
from enum import Enum


class ClaimType(str, Enum):
    skill = "skill"
    project = "project"
    certification = "certification"
    experience = "experience"
    leadership = "leadership"
    achievement = "achievement"


class VerificationStatus(str, Enum):
    verified = "verified"
    user_confirmed = "user_confirmed"
    ai_inferred = "ai_inferred"
    needs_evidence = "needs_evidence"


class ClaimResponse(BaseModel):
    id: str
    candidate_id: str
    application_id: str
    claim_text: str
    claim_type: str
    source_document_id: Optional[str]
    created_at: str


class ClaimVerificationResponse(BaseModel):
    id: str
    claim_id: str
    status: str
    confidence_score: float
    ai_reason: Optional[str]
    candidate_confirmed: bool
    updated_at: str
