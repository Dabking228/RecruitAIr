import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api/client'

export type ApplicationStatus =
  | 'submitted'
  | 'shortlisted'
  | 'rejected'
  | 'interview_invited'

export interface JobSummary {
  id: string
  title: string
  location: string | null
  work_mode: string | null
  employment_type: string | null
  verification_threshold: number
  companies: { name: string; industry: string | null; website: string | null }
}

export interface MatchScoreSummary {
  job_fit_score: number
  evidence_confidence_score: number
  recommendation: string
}

export interface CandidateApplication {
  id: string
  job_id: string
  candidate_id: string
  status: ApplicationStatus
  submitted_at: string
  jobs: JobSummary
  match_scores: MatchScoreSummary[] | null
}

export interface JobRequirement {
  id: string
  requirement_type: string
  name: string
  description: string | null
  importance: string
  weight: number
  evidence_expected: boolean
}

export interface OpenJob {
  id: string
  title: string
  description: string
  location: string | null
  work_mode: string | null
  employment_type: string | null
  verification_threshold: number
  created_at: string
  companies: { name: string; industry: string | null }
  job_requirements?: JobRequirement[]
}

export interface ReadinessResult {
  checks: {
    has_profile: boolean
    has_resume: boolean
    has_claims: boolean
    has_evidence: boolean
  }
  passed: number
  total: number
  level: 'excellent' | 'good' | 'fair' | 'low'
  already_applied: boolean
  existing_application: CandidateApplication | null
}

export type Recommendation = 'strong_hire' | 'hire' | 'maybe' | 'pass'

export interface FullMatchScore {
  job_fit_score: number
  evidence_confidence_score: number
  required_skill_match: number
  preferred_skill_match: number
  experience_relevance_score: number
  recommendation: Recommendation
  created_at: string
}

export interface RecruiterApplication {
  id: string
  status: ApplicationStatus
  submitted_at: string
  candidate_id: string
  candidate: { name: string | null; email: string }
  match_scores: FullMatchScore[] | null
}

export type QuestionType = 'technical' | 'behavioral' | 'evidence_check' | 'role_specific'

export interface InterviewQuestion {
  id: string
  application_id: string
  question: string
  question_type: QuestionType
  reason: string | null
  created_at: string
}

// Shape returned by /generate (not yet saved — no id/created_at)
export interface PendingQuestion {
  question: string
  question_type: QuestionType
  reason: string | null
}

export interface RecruiterApplicationDetail {
  id: string
  candidate_id: string
  status: ApplicationStatus
  submitted_at: string
  candidate: { id: string; name: string | null; email: string }
  jobs: { id: string; title: string }
  match_scores: FullMatchScore[] | null
}

/** List all open jobs (for candidate browsing) */
export const getOpenJobs = () =>
  apiGet<{ jobs: OpenJob[]; total: number }>('/api/jobs/open')

/** Get a single open job with requirements (for candidate view) */
export const getJobPublic = (jobId: string) =>
  apiGet<OpenJob>(`/api/jobs/${jobId}/public`)

/** Check profile readiness and whether already applied */
export const getApplyReadiness = (jobId: string) =>
  apiGet<ReadinessResult>(`/api/jobs/${jobId}/readiness`)

/** Submit an application */
export const applyToJob = (jobId: string) =>
  apiPost<{ message: string; application: CandidateApplication }>(
    `/api/jobs/${jobId}/apply`,
    {},
  )

/** Get all of the current candidate's applications */
export const getMyApplications = () =>
  apiGet<{ applications: CandidateApplication[]; total: number }>(
    '/api/applications/my',
  )

/** Recruiter: list all applications for a job with scores */
export const getJobApplications = (jobId: string) =>
  apiGet<{ applications: RecruiterApplication[]; total: number }>(
    `/api/jobs/${jobId}/applications`,
  )

/** Recruiter: manually trigger (re-)scoring for an application */
export const scoreApplication = (applicationId: string) =>
  apiPost<{ message: string; score: FullMatchScore }>(
    `/api/applications/${applicationId}/score`,
    {},
  )

/** Recruiter: get full application detail with candidate info and scores */
export const getApplicationDetail = (applicationId: string) =>
  apiGet<RecruiterApplicationDetail>(`/api/applications/${applicationId}/detail`)

/** Recruiter: ask Gemini to suggest questions — does NOT save */
export const generateQuestions = (applicationId: string) =>
  apiPost<{ questions: PendingQuestion[]; total: number }>(
    `/api/applications/${applicationId}/questions/generate`,
    {},
  )

/** Recruiter: save the confirmed questions */
export const saveQuestions = (applicationId: string, questions: PendingQuestion[]) =>
  apiPost<{ message: string; questions: InterviewQuestion[] }>(
    `/api/applications/${applicationId}/questions`,
    { questions },
  )

/** Recruiter: get saved questions */
export const getInterviewQuestions = (applicationId: string) =>
  apiGet<{ questions: InterviewQuestion[]; total: number }>(
    `/api/applications/${applicationId}/questions`,
  )

/** Recruiter: delete one saved question */
export const deleteInterviewQuestion = (applicationId: string, questionId: string) =>
  apiDelete<{ message: string }>(
    `/api/applications/${applicationId}/questions/${questionId}`,
  )