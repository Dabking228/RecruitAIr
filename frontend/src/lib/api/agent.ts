import { apiGet, apiPost } from '@/lib/api/client'

// ── Types ────────────────────────────────────────────────────

/** The page context sent alongside every message. */
export interface AgentContext {
  page: string
  job_id?: string
  application_id?: string
  candidate_id?: string
}

/** A single message in a session — mirrors agent_messages table. */
export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  context: AgentContext | null
  created_at: string
}

/**
 * A session returned by getActiveSession or loadSession.
 * Contains the full message history.
 */
export interface AgentSession {
  session_id: string
  messages: AgentMessage[]
  status?: 'active' | 'archived'
}

/**
 * A past session entry shown in the history sidebar.
 * Contains only metadata + a short preview — not the full messages.
 */
export interface PastSession {
  session_id: string
  started_at: string
  last_active_at: string
  preview: string
}

/** Response from both chat endpoints. */
export interface ChatResponse {
  response: string
}

/** Response from createNewSession. */
export interface NewSessionResponse {
  session_id: string
}

// ── Session endpoints ─────────────────────────────────────────

/**
 * Called when the agent drawer opens.
 * Returns the active session and its full message history.
 * Creates a new session automatically if none exists.
 */
export const getActiveSession = () =>
  apiGet<AgentSession>('/api/agent/session')

/**
 * Returns the user's past archived sessions for the history sidebar.
 * Each entry has a short preview of the first message.
 */
export const getPastSessions = () =>
  apiGet<{ sessions: PastSession[] }>('/api/agent/sessions')

/**
 * Loads the full message history for a specific session.
 * Used when the user clicks a past session in the history sidebar.
 */
export const loadSession = (sessionId: string) =>
  apiGet<AgentSession>(`/api/agent/session/${sessionId}`)

/**
 * Archives the current session and creates a fresh one.
 * Called when the user clicks '+ New Session'.
 */
export const createNewSession = () =>
  apiPost<NewSessionResponse>('/api/agent/session/new', {})

// ── Chat endpoints ────────────────────────────────────────────

/**
 * Sends a message to the recruiter agent.
 * The agent may call tools, then returns a natural-language response.
 * Only callable by users with role = 'recruiter'.
 */
export const sendRecruiterMessage = (
  sessionId: string,
  message: string,
  context?: AgentContext,
) =>
  apiPost<ChatResponse>('/api/agent/recruiter/chat', {
    session_id: sessionId,
    message,
    context: context ?? null,
  })

/**
 * Sends a message to the candidate agent.
 * The agent may call tools, then returns a natural-language response.
 * Only callable by users with role = 'candidate'.
 */
export const sendCandidateMessage = (
  sessionId: string,
  message: string,
  context?: AgentContext,
) =>
  apiPost<ChatResponse>('/api/agent/candidate/chat', {
    session_id: sessionId,
    message,
    context: context ?? null,
  })