'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getJobApplications,
  scoreApplication,
  type RecruiterApplication,
  type Recommendation,
} from '@/lib/api/applications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Helpers ──────────────────────────────────────────────────

const RECOMMENDATION_CONFIG: Record<Recommendation, { label: string; className: string }> = {
  strong_hire: { label: 'Strong Hire', className: 'bg-green-600 text-white' },
  hire:        { label: 'Hire',        className: 'bg-blue-600 text-white' },
  maybe:       { label: 'Maybe',       className: 'bg-yellow-500 text-white' },
  pass:        { label: 'Pass',        className: 'bg-red-600 text-white' },
}

function ScoreBar({ label, value, colour }: { label: string; value: number; colour: string }) {
  const pct = Math.round(value)
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

// ── Main page ─────────────────────────────────────────────────

export default function CandidatesPage() {
  const { jobId } = useParams<{ jobId: string }>()

  const [applications, setApplications] = useState<RecruiterApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scoringId, setScoringId] = useState<string | null>(null)

  useEffect(() => {
    getJobApplications(jobId)
      .then((res) => {
        // Sort by job_fit_score descending; unscored applications go to bottom
        const sorted = [...res.applications].sort((a, b) => {
          const scoreA = a.match_scores?.[0]?.job_fit_score ?? -1
          const scoreB = b.match_scores?.[0]?.job_fit_score ?? -1
          return scoreB - scoreA
        })
        setApplications(sorted)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [jobId])

  async function handleScoreNow(applicationId: string) {
    setScoringId(applicationId)
    try {
      await scoreApplication(applicationId)
      // Reload the full list so the new score appears in rank order
      const res = await getJobApplications(jobId)
      const sorted = [...res.applications].sort((a, b) => {
        const scoreA = a.match_scores?.[0]?.job_fit_score ?? -1
        const scoreB = b.match_scores?.[0]?.job_fit_score ?? -1
        return scoreB - scoreA
      })
      setApplications(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed.')
    } finally {
      setScoringId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading candidates...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <Link href={`/recruiter/jobs/${jobId}`} className="text-blue-600 hover:underline text-sm">
            ← Back to Job
          </Link>
          <h1 className="text-xl font-bold mt-1">Candidate Rankings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {applications.length} application{applications.length !== 1 ? 's' : ''} — ranked by AI job fit score
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 space-y-4">

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && applications.length === 0 && (
          <div className="text-center py-16 bg-white border border-dashed rounded-lg">
            <p className="text-gray-400 text-lg">No applications yet</p>
          </div>
        )}

        {applications.map((app, index) => {
          const score = app.match_scores?.[0]
          const recConfig = score
            ? RECOMMENDATION_CONFIG[score.recommendation as Recommendation]
            : null
          const isScoring = scoringId === app.id

          return (
            <div key={app.id} className="bg-white border rounded-lg p-5">
              <div className="flex items-start gap-4">

                {/* Rank number */}
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 flex-shrink-0">
                  {index + 1}
                </div>

                {/* Candidate info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {app.candidate.name || 'Unknown candidate'}
                    </span>
                    {recConfig && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${recConfig.className}`}>
                        {recConfig.label}
                      </span>
                    )}
                    <Badge variant="outline" className="capitalize text-xs">
                      {app.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">{app.candidate.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Applied {new Date(app.submitted_at).toLocaleDateString('en-MY', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>

                {/* Scores or Score Now button */}
                <div className="w-52 flex-shrink-0">
                  {score ? (
                    <div className="space-y-1.5">
                      <ScoreBar label="Job Fit"    value={score.job_fit_score}              colour="bg-blue-500" />
                      <ScoreBar label="Evidence"   value={score.evidence_confidence_score}  colour="bg-emerald-500" />
                      <ScoreBar label="Experience" value={score.experience_relevance_score} colour="bg-purple-500" />
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <div className="text-center bg-gray-50 rounded p-1.5">
                          <p className="text-xs text-gray-400">Required</p>
                          <p className="text-sm font-semibold">{score.required_skill_match}%</p>
                        </div>
                        <div className="text-center bg-gray-50 rounded p-1.5">
                          <p className="text-xs text-gray-400">Preferred</p>
                          <p className="text-sm font-semibold">{score.preferred_skill_match}%</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right space-y-2">
                      <p className="text-xs text-gray-400">Not yet scored</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleScoreNow(app.id)}
                        disabled={isScoring}
                      >
                        {isScoring ? 'Scoring...' : 'Score Now'}
                      </Button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )
        })}

      </main>
    </div>
  )
}