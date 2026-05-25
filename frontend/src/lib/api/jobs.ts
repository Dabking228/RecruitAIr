import { apiGet, apiPost, apiPut } from './client'
import { Job } from '@/types'

export interface CreateJobInput {
  title: string
  description: string
  location?: string
  work_mode?: 'onsite' | 'hybrid' | 'remote'
  employment_type?: 'internship' | 'full-time' | 'part-time' | 'contract'
  verification_threshold?: number
}

export interface JobsListResponse {
  jobs: Job[]
}

/** Get all jobs created by the current recruiter */
export const getMyJobs = () =>
  apiGet<JobsListResponse>('/api/jobs')

/** Get a single job by ID */
export const getJob = (jobId: string) =>
  apiGet<Job>(`/api/jobs/${jobId}`)

/** Create a new job */
export const createJob = (data: CreateJobInput) =>
  apiPost<Job>('/api/jobs', data)

/** Update a job's status (draft → open → closed) */
export const updateJobStatus = (jobId: string, status: 'draft' | 'open' | 'closed') =>
  apiPut<Job>(`/api/jobs/${jobId}/status`, { status })