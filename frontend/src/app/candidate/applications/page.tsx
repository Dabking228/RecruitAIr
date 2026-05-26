'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getMyApplications, type CandidateApplication } from '@/lib/api/applications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const STATUS_CONFIG: Record<string, { label: string; colour: string }> = {
  submitted:        { label: 'Submitted',         colour: 'bg-gray-100 text-gray-700' },
  shortlisted:      { label: 'Shortlisted ⭐',    colour: 'bg-yellow-100 text-yellow-800' },
  interview_invited:{ label: 'Interview Invited 🎉', colour: 'bg-green-100 text-green-800' },
  rejected:         { label: 'Not Progressing',   colour: 'bg-red-100 text-red-700' },
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score)
  const colour =
    pct >= 75 ? 'bg-green-500' :
    pct >= 50 ? 'bg-yellow-500' :
    'bg-red-400'

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ApplicationCard({ application }: { application: CandidateApplication }) {
  const job = application.jobs
  const scores = application.match_scores?.[0]
  const statusConfig = STATUS_CONFIG[application.status] ?? STATUS_CONFIG.submitted

  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">{job.title}</h3>
          <p className="text-sm text-gray-500">{job.companies.name}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            {job.work_mode && (
              <span className="text-xs text-gray-400 capitalize">{job.work_mode}</span>
            )}
            {job.location && (
              <span className="text-xs text-gray-400">📍 {job.location}</span>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusConfig.colour}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* AI scores (only shown after scoring runs in Phase 12) */}
      {scores && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            AI Score
          </p>
          <ScoreBar score={scores.job_fit_score} label="Job Fit" />
          <ScoreBar score={scores.evidence_confidence_score} label="Evidence Confidence" />
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-gray-500">Recommendation:</span>
            <Badge variant="outline" className="capitalize text-xs">
              {scores.recommendation.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-400">
        <span>
          Applied {new Date(application.submitted_at).toLocaleDateString('en-MY', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </span>
        {!scores && (
          <span className="text-gray-400 italic">Awaiting AI scoring</span>
        )}
      </div>
    </div>
  )
}

export default function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyApplications()
      .then((res) => setApplications(res.applications))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-2xl mx-auto">
          <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">My Applications</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-8 space-y-4">

        {loading && <p className="text-gray-400">Loading applications...</p>}

        {!loading && applications.length === 0 && (
          <div className="text-center py-16 bg-white border border-dashed rounded-lg">
            <p className="text-gray-400 text-lg mb-2">No applications yet</p>
            <Link href="/candidate/jobs">
              <Button>Browse open jobs</Button>
            </Link>
          </div>
        )}

        {!loading && applications.length > 0 && (
          <>
            <p className="text-sm text-gray-500">
              {applications.length} application{applications.length !== 1 ? 's' : ''}
            </p>
            {applications.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </>
        )}

      </main>
    </div>
  )
}