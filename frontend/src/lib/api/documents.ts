import { apiPost, apiGet, apiDelete } from '@/lib/api/client'

export type DocumentType =
  | 'resume'
  | 'certificate'
  | 'screenshot'
  | 'portfolio_image'
  | 'project_document'

export interface CandidateDocument {
  id: string
  candidate_id: string
  application_id: string | null
  file_url: string          // path in Supabase Storage (not a full URL)
  file_type: DocumentType
  extracted_text: string | null
  uploaded_at: string
}

export const saveDocumentRecord = (data: {
  file_url: string
  file_type: DocumentType
  application_id?: string
}) => apiPost<CandidateDocument>('/api/documents/', data)

export const getDocuments = () =>
  apiGet<{ documents: CandidateDocument[] }>('/api/documents/')

export const deleteDocumentRecord = (documentId: string) =>
  apiDelete<{ message: string }>(`/api/documents/${documentId}`)