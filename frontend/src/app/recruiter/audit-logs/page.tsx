'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAuditLogs, type AuditLog } from '@/lib/api/applications'

// ── Action display config ─────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'application.submitted':    { label: 'Application Submitted', icon: '📋', color: 'bg-blue-100 text-blue-800'   },
  'application.status_changed': { label: 'Status Changed',     icon: '🔄', color: 'bg-yellow-100 text-yellow-800' },
  'score.generated':          { label: 'AI Score Generated',   icon: '🤖', color: 'bg-purple-100 text-purple-800' },
  'questions.saved':          { label: 'Questions Saved',      icon: '❓', color: 'bg-indigo-100 text-indigo-800' },
  'email.sent':               { label: 'Interview Email Sent', icon: '✉️', color: 'bg-green-100 text-green-800'   },
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, icon: '📝', color: 'bg-gray-100 text-gray-800' }
}

// ── Relative time helper ──────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours   = Math.floor(diff / 3_600_000)
  const days    = Math.floor(diff / 86_400_000)

  if (minutes < 1)  return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24)   return `${hours}h ago`
  if (days < 7)     return `${days}d ago`
  return new Date(isoString).toLocaleDateString()
}

// ── Metadata renderer ─────────────────────────────────────────

function MetadataPills({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null
  const entries = Object.entries(metadata)
  if (entries.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
        >
          <span className="font-medium">{key.replace(/_/g, ' ')}:</span>
          <span>{String(value)}</span>
        </span>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    getAuditLogs(100)
      .then((res) => setLogs(res.logs))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/recruiter/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-1">Activity Log</h1>
        <p className="text-gray-500 mb-8">Recent actions across all your job applications</p>

        {/* ── States ── */}
        {loading && (
          <p className="text-gray-500 text-sm">Loading activity…</p>
        )}

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        {!loading && !error && logs.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-gray-500">
              No activity recorded yet. Actions like submitting applications,
              running AI scoring, and sending emails will appear here.
            </CardContent>
          </Card>
        )}

        {/* ── Timeline ── */}
        {!loading && logs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                {logs.length} recent event{logs.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {logs.map((log) => {
                  const config = getActionConfig(log.action)
                  return (
                    <li key={log.id} className="flex gap-3 px-6 py-4 hover:bg-gray-50">
                      {/* Icon */}
                      <span className="text-xl mt-0.5 shrink-0">{config.icon}</span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs ${config.color} border-0`}>
                            {config.label}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {relativeTime(log.created_at)}
                          </span>
                        </div>

                        {/* Metadata pills */}
                        <MetadataPills metadata={log.metadata} />

                        {/* Link to application */}
                        {log.target_id && (
                          <Link
                            href={`/recruiter/applications/${log.target_id}`}
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                          >
                            View application →
                          </Link>
                        )}
                      </div>

                      {/* Timestamp (full) */}
                      <span className="text-xs text-gray-400 shrink-0 self-start pt-0.5">
                        {new Date(log.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
