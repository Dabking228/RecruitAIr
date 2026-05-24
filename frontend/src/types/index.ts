// ── User & Auth ──────────────────────────────────────────────
export type UserRole = 'recruiter' | 'candidate'

export interface AppUser {
  id: string
  email: string
  role: UserRole
  name: string | null
  created_at: string
}

// ── Company ──────────────────────────────────────────────────
export interface Company {
  id: string
  name: string
  industry: string | null
  website: string | null
  created_by: string
  created_at: string
}

// ── Job ──────────────────────────────────────────────────────
export type JobStatus = 'draft' | 'open' | 'closed'
export type WorkMode = 'onsite' | 'hybrid' | 'remote'
export type EmploymentType = 'internship' | 'full-time' | 'part-time' | 'contract'

export interface Job {
  id: string
  company_id: string
  recruiter_id: string
  title: string
  description: string
  location: string | null
  work_mode: WorkMode | null
  employment_type: EmploymentType | null
  verification_threshold: number
  status: JobStatus
  created_at: string
}

// ── Job Requirements ─────────────────────────────────────────
export type RequirementType = 'required_skill' | 'preferred_skill' | 'responsibility' | 'certification'
export type ImportanceLevel = 'must_have' | 'nice_to_have'

export interface JobRequirement {
  id: string
  job_id: string
  requirement_type: RequirementType
  name: string
  description: string | null
  importance: ImportanceLevel
  weight: number
  evidence_expected: boolean
}

// ── Application ──────────────────────────────────────────────
export type ApplicationStatus = 'submitted' | 'shortlisted' | 'rejected' | 'interview_invited'

export interface Application {
  id: string
  job_id: string
  candidate_id: string
  status: ApplicationStatus
  submitted_at: string
}

// ── Claims & Verification ────────────────────────────────────
export type ClaimType = 'skill' | 'project' | 'certification' | 'experience' | 'leadership' | 'achievement'
export type VerificationStatus = 'verified' | 'user_confirmed' | 'ai_inferred' | 'needs_evidence'

export interface Claim {
  id: string
  candidate_id: string
  application_id: string
  claim_text: string
  claim_type: ClaimType
  source_document_id: string | null
  created_at: string
}

export interface ClaimVerification {
  id: string
  claim_id: string
  status: VerificationStatus
  confidence_score: number
  ai_reason: string | null
  candidate_confirmed: boolean
  updated_at: string
}

// ── Match Scores ─────────────────────────────────────────────
export type Recommendation = 'strong_hire' | 'hire' | 'maybe' | 'pass'

export interface MatchScore {
  id: string
  application_id: string
  job_fit_score: number
  evidence_confidence_score: number
  required_skill_match: number
  preferred_skill_match: number
  experience_relevance_score: number
  recommendation: Recommendation
  created_at: string
}

// ── Documents ────────────────────────────────────────────────
export type DocumentType = 'resume' | 'certificate' | 'screenshot' | 'portfolio_image' | 'project_document'

export interface Document {
  id: string
  candidate_id: string
  application_id: string | null
  file_url: string
  file_type: DocumentType
  extracted_text: string | null
  uploaded_at: string
}