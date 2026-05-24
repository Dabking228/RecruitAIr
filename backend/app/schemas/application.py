from pydantic import BaseModel
from typing import Optional


class ApplicationResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    status: str
    submitted_at: str