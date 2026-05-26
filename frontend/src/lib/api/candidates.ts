import { apiGet, apiPut } from '@/lib/api/client'

export interface CandidateProfile {
  id: string
  user_id: string
  full_name: string
  summary: string | null
  education: string | null
  portfolio_url: string | null
  github_url: string | null
  linkedin_url: string | null
  created_at: string
}

export interface SaveProfileData {
  full_name: string
  summary?: string
  education?: string
  portfolio_url?: string
  github_url?: string
  linkedin_url?: string
}

export const getCandidateProfile = () =>
  apiGet<CandidateProfile>('/api/candidate/profile')

export const saveProfile = (data: SaveProfileData) =>
  apiPut<CandidateProfile>('/api/candidate/profile', data)