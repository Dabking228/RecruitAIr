import { apiPost, apiGet, apiDelete, apiPut } from '@/lib/api/client'
import type { VerificationStatus, ClaimType } from '@/types'

export interface ClaimVerification {
  id: string
  claim_id: string
  status: VerificationStatus
  confidence_score: number
  ai_reason: string | null
  candidate_confirmed: boolean
  updated_at: string
}

export interface Claim {
  id: string
  candidate_id: string
  application_id: string | null
  claim_text: string
  claim_type: ClaimType
  source_document_id: string | null
  created_at: string
  claim_verifications: ClaimVerification[] // joined from DB
}

export interface ExtractClaimsResponse {
  message: string
  claims: Claim[]
}

/** Triggers the full extraction pipeline (text extraction + AI claim extraction) */
export const extractClaims = () =>
  apiPost<ExtractClaimsResponse>('/api/candidate/extract-claims', {})

/** Returns all profile-level claims with verification records */
export const getClaims = () =>
  apiGet<{ claims: Claim[]; total: number }>('/api/claims/')

/** Candidate removes an incorrect claim */
export const deleteClaim = (claimId: string) =>
  apiDelete<{ message: string }>(`/api/claims/${claimId}`)

/** Candidate confirms a claim is true */
export const confirmClaim = (claimId: string) =>
  apiPut<{ message: string; verification: ClaimVerification }>(
    `/api/claims/${claimId}/confirm`,
    {},
  )