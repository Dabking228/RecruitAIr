import { apiGet, apiPost, apiPut } from '@/lib/api/client'

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