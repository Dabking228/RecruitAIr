import { apiGet, apiPost } from './client'
import { Company } from '@/types'

export interface CreateCompanyInput {
  name: string
  industry?: string
  website?: string
}

export interface MyCompanyResponse {
  company: Company | null
}

/** Get the recruiter's own company (null if not yet created) */
export const getMyCompany = () =>
  apiGet<MyCompanyResponse>('/api/companies/my-company')

/** Create the recruiter's company profile */
export const createCompany = (data: CreateCompanyInput) =>
  apiPost<Company>('/api/companies', data)