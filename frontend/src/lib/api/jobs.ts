import { apiGet, apiPost, apiPut } from "./client";
import { Job } from "@/types";

export interface CreateJobInput {
  title: string;
  description: string;
  location?: string;
  work_mode?: "onsite" | "hybrid" | "remote";
  employment_type?: "internship" | "full-time" | "part-time" | "contract";
  verification_threshold?: number;
}

export interface JobsListResponse {
  jobs: Job[];
}

// ── AI Parsing Types ─────────────────────────────────────────

export interface ParsedRequirement {
  requirement_type:
    | "required_skill"
    | "preferred_skill"
    | "responsibility"
    | "certification";
  name: string;
  description: string;
  importance: "must_have" | "nice_to_have";
  weight: number;
  evidence_expected: boolean;
}

export interface ParseJobResponse {
  job_summary: string;
  requirements: ParsedRequirement[];
}

export interface SavedRequirement extends ParsedRequirement {
  id: string;
  job_id: string;
}

/** Get all jobs created by the current recruiter */
export const getMyJobs = () => apiGet<JobsListResponse>("/api/jobs");

/** Get a single job by ID */
export const getJob = (jobId: string) => apiGet<Job>(`/api/jobs/${jobId}`);

/** Create a new job */
export const createJob = (data: CreateJobInput) =>
  apiPost<Job>("/api/jobs", data);

/** Update a job's status (draft → open → closed) */
export const updateJobStatus = (
  jobId: string,
  status: "draft" | "open" | "closed",
) => apiPut<Job>(`/api/jobs/${jobId}/status`, { status });

/**
 * Triggers AI parsing of the job description.
 * Returns suggestions — does NOT save to the database.
 */
export const parseJobDescription = (jobId: string) =>
  apiPost<ParseJobResponse>(`/api/jobs/${jobId}/parse`, {});

/**
 * Saves the recruiter-confirmed requirements to the database.
 * This is the human-in-the-loop confirmation step.
 */
export const saveJobRequirements = (
  jobId: string,
  requirements: ParsedRequirement[],
) =>
  apiPut<{ message: string; requirements: SavedRequirement[] }>(
    `/api/jobs/${jobId}/requirements`,
    { requirements },
  );