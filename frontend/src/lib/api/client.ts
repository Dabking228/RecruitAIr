import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/**
 * Gets the current user's JWT and returns the auth headers
 * needed for every backend API call.
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('No active session. Please log in again.')
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parses a failed response into a readable error message.
 * FastAPI returns errors as: { "detail": "error message" }
 */
async function handleErrorResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => null)
  const message =
    body?.detail ??
    `Request failed with status ${response.status}`
  throw new Error(message)
}

// ── Public API functions ─────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_URL}${path}`, { headers })
  if (!response.ok) await handleErrorResponse(response)
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) await handleErrorResponse(response)
  return response.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) await handleErrorResponse(response)
  return response.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) await handleErrorResponse(response)
  return response.json() as Promise<T>
}