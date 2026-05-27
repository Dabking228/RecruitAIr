'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AgentMessage } from '@/components/agent/AgentMessage'
import {
  getActiveSession,
  getPastSessions,
  loadSession,
  createNewSession,
  sendRecruiterMessage,
  sendCandidateMessage,
  type AgentMessage as AgentMessageData,
  type AgentContext,
  type PastSession,
} from '@/lib/api/agent'

// ── Props ────────────────────────────────────────────────────

interface AgentDrawerProps {
  role: 'recruiter' | 'candidate'
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parses the current URL pathname into an AgentContext object.
 * This lets the agent know which page the user is on without
 * the user having to explain it in every message.
 *
 * Examples:
 *   /recruiter/jobs/abc-123/candidates → { page: 'recruiter_jobs_candidates', job_id: 'abc-123' }
 *   /recruiter/applications/def-456   → { page: 'recruiter_applications', application_id: 'def-456' }
 *   /candidate/jobs/abc-123           → { page: 'candidate_jobs', job_id: 'abc-123' }
 *   /candidate/dashboard              → { page: 'candidate_dashboard' }
 */
function buildContext(pathname: string): AgentContext {
  const segments = pathname.split('/').filter(Boolean)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Page name = all non-UUID segments joined with underscores
  const pageSegments = segments.filter((s) => !uuidPattern.test(s))
  const page = pageSegments.join('_') || 'home'

  // Extract job_id and application_id from path position
  const jobIdx = segments.indexOf('jobs')
  const appIdx = segments.indexOf('applications')

  const jobId =
    jobIdx >= 0 &&
    segments[jobIdx + 1] &&
    uuidPattern.test(segments[jobIdx + 1])
      ? segments[jobIdx + 1]
      : undefined

  const applicationId =
    appIdx >= 0 &&
    segments[appIdx + 1] &&
    uuidPattern.test(segments[appIdx + 1])
      ? segments[appIdx + 1]
      : undefined

  return {
    page,
    ...(jobId && { job_id: jobId }),
    ...(applicationId && { application_id: applicationId }),
  }
}

/** Formats a session's last_active_at timestamp for the history list. */
function formatSessionDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const diffMs = Date.now() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// ── Sub-components ────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-center">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center">
        <span className="text-white text-xs">✦</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}

function WelcomeMessage({ role }: { role: 'recruiter' | 'candidate' }) {
  const lines =
    role === 'recruiter'
      ? [
          'How can I help you today?',
          'Ask me about candidates, scores, interview questions, or anything related to your jobs.',
        ]
      : [
          'How can I help you today?',
          'I can extract claims from your documents, preview job matches, and help you strengthen your profile.',
        ]

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center mt-0.5">
        <span className="text-white text-xs">✦</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-700 max-w-[82%]">
        {lines.map((line, i) => (
          <p key={i} className={i > 0 ? 'mt-1 text-gray-500' : 'font-medium'}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function AgentDrawer({ role }: AgentDrawerProps) {
  const pathname = usePathname()

  // Drawer state
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'chat' | 'history'>('chat')

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessageData[]>([])
  const [isInitialising, setIsInitialising] = useState(false)

  // Chat state
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // History state
  const [pastSessions, setPastSessions] = useState<PastSession[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Auto-scroll anchor
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Load active session when drawer first opens ───────────
  useEffect(() => {
    if (!isOpen || sessionId) return

    setIsInitialising(true)
    getActiveSession()
      .then((session) => {
        setSessionId(session.session_id)
        setMessages(session.messages)
      })
      .catch(console.error)
      .finally(() => setIsInitialising(false))
  }, [isOpen, sessionId])

  // ── Auto-scroll to latest message ─────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // ── Focus input when switching to chat view ───────────────
  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen, view])

  // ── Determine context from current URL ────────────────────
  const context: AgentContext = buildContext(pathname)

  // ── Send message ──────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const msg = inputValue.trim()
    if (!msg || !sessionId || isLoading) return

    setInputValue('')
    setIsLoading(true)

    // Add user message to UI immediately (optimistic)
    const userMsg: AgentMessageData = {
      role: 'user',
      content: msg,
      context,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const sendFn =
        role === 'recruiter' ? sendRecruiterMessage : sendCandidateMessage

      const result = await sendFn(sessionId, msg, context)

      const assistantMsg: AgentMessageData = {
        role: 'assistant',
        content: result.response,
        context: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorText,
          context: null,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, sessionId, isLoading, role, context])

  // ── Keyboard: Enter sends, Shift+Enter inserts newline ────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── New session ───────────────────────────────────────────
  const handleNewSession = async () => {
    try {
      const result = await createNewSession()
      setSessionId(result.session_id)
      setMessages([])
      setView('chat')
    } catch (err) {
      console.error('Failed to create new session:', err)
    }
  }

  // ── Toggle history panel ──────────────────────────────────
  const handleShowHistory = async () => {
    setView('history')
    setIsLoadingHistory(true)
    try {
      const result = await getPastSessions()
      setPastSessions(result.sessions)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // ── Load a past session ───────────────────────────────────
  const handleLoadSession = async (id: string) => {
    try {
      const session = await loadSession(id)
      setSessionId(session.session_id)
      setMessages(session.messages)
      setView('chat')
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const drawerTitle = role === 'recruiter' ? 'RecruitAIr Copilot' : 'RecruitAIr Assistant'

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      {/* ── Trigger button ──────────────────────────────── */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open AI assistant"
        className={cn(
          'fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg',
          'hover:bg-gray-700 flex items-center justify-center text-lg transition-all duration-200',
          isOpen ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100',
        )}
      >
        ✦
      </button>

      {/* ── Drawer panel ────────────────────────────────── */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-[400px] bg-white border-l border-gray-200 z-40',
          'flex flex-col shadow-xl transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          {view === 'history' ? (
            <>
              <button
                onClick={() => setView('chat')}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                ← Back to Chat
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  ✦ {drawerTitle}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleShowHistory}
                  title="View past sessions"
                >
                  History
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNewSession}
                  title="Start a new chat"
                >
                  + New
                </Button>
              </div>
            </>
          )}

          {/* Close button — always visible */}
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close assistant"
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* ── CHAT VIEW ─────────────────────────────────── */}
        {view === 'chat' && (
          <>
            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {isInitialising ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-sm text-gray-400">Loading...</span>
                </div>
              ) : (
                <>
                  {messages.length === 0 && !isLoading && (
                    <WelcomeMessage role={role} />
                  )}

                  {messages.map((msg, i) => (
                    <AgentMessage
                      key={i}
                      role={msg.role}
                      content={msg.content}
                      createdAt={msg.created_at}
                    />
                  ))}

                  {isLoading && <TypingIndicator />}

                  {/* Scroll anchor */}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 flex flex-col gap-2">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading || !sessionId}
                  placeholder={
                    role === 'recruiter'
                      ? 'Ask about candidates, scores...'
                      : 'Ask about your profile, job match...'
                  }
                  rows={2}
                  className={cn(
                    'flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'placeholder:text-gray-400',
                  )}
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || !sessionId}
                  size="icon"
                  className="h-[68px] w-10 rounded-xl flex-shrink-0"
                  aria-label="Send message"
                >
                  ↑
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        )}

        {/* ── HISTORY VIEW ──────────────────────────────── */}
        {view === 'history' && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-32">
                <span className="text-sm text-gray-400">Loading history...</span>
              </div>
            ) : pastSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <span className="text-sm text-gray-500">No past sessions yet.</span>
                <span className="text-xs text-gray-400">
                  Start chatting and click + New to archive a session.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Past Sessions
                </p>
                {pastSessions.map((session) => (
                  <button
                    key={session.session_id}
                    onClick={() => handleLoadSession(session.session_id)}
                    className={cn(
                      'w-full text-left rounded-xl border border-gray-100 px-4 py-3',
                      'hover:bg-gray-50 hover:border-gray-200 transition-colors',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-500">
                        {formatSessionDate(session.last_active_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 truncate">{session.preview}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}