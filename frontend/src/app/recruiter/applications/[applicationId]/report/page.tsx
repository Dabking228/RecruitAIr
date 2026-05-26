'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { generateCandidateReport, type CandidateReport, type Recommendation } from '@/lib/api/applications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

// ── Helpers ──────────────────────────────────────────────────

const RECOMMENDATION_CONFIG: Record<Recommendation, { label: string; className: string }> = {
  strong_hire: { label: 'Strong Hire ⭐', className: 'bg-green-600 text-white' },
  hire:        { label: 'Hire ✓',         className: 'bg-blue-600 text-white' },
  maybe:       { label: 'Maybe ~',        className: 'bg-yellow-500 text-white' },
  pass:        { label: 'Pass ✗',         className: 'bg-red-600 text-white' },
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  const colour =
    value >= 75 ? 'bg-green-100 text-green-800' :
    value >= 50 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-700'
  return (
    <div className={`text-center px-3 py-2 rounded-lg ${colour}`}>
      <p className="text-lg font-bold">{Math.round(value)}%</p>
      <p className="text-xs">{label}</p>
    </div>
  )
}

function BulletList({
  items,
  icon,
  emptyText,
}: {
  items: string[]
  icon: string
  emptyText: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 italic">{emptyText}</p>
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-700">
          <span className="flex-shrink-0">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function CandidateReportPage() {
  const { applicationId } = useParams<{ applicationId: string }>()

  const [report, setReport] = useState<CandidateReport | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateCandidateReport(applicationId)
      setReport(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const recConfig = report
    ? RECOMMENDATION_CONFIG[report.scores.recommendation as Recommendation]
    : null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/recruiter/applications/${applicationId}`}
            className="text-blue-600 hover:underline text-sm"
          >
            ← Back to Application
          </Link>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">
                {report ? `${report.candidate_name} — Assessment Report` : 'Candidate Assessment Report'}
              </h1>
              {report && (
                <p className="text-sm text-gray-500">{report.job_title}</p>
              )}
            </div>
            {recConfig && (
              <span className={`text-sm px-3 py-1 rounded-full font-semibold ${recConfig.className}`}>
                {recConfig.label}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 space-y-6">

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Generate button — shown before first generation */}
        {!report && !isGenerating && (
          <div className="text-center py-16 bg-white border border-dashed rounded-xl">
            <p className="text-gray-500 mb-2 text-lg font-medium">
              AI Candidate Assessment
            </p>
            <p className="text-gray-400 text-sm mb-6 max-w-sm mx-auto">
              Gemini reads the candidate&apos;s claims, evidence quality, and match scores
              to write a structured recruiter report.
            </p>
            <Button size="lg" onClick={handleGenerate}>
              ✨ Generate Assessment Report
            </Button>
            <p className="text-xs text-gray-400 mt-3">Requires scoring to have run first</p>
          </div>
        )}

        {/* Generating state */}
        {isGenerating && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-12 text-center">
              <p className="text-blue-700 font-medium text-lg mb-2">
                Analysing candidate profile...
              </p>
              <p className="text-blue-600 text-sm mb-6">
                Gemini is reading all claims, evidence, and job requirements.
                This takes 10–20 seconds.
              </p>
              <div className="flex justify-center">
                <div className="h-2 w-48 bg-blue-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Report content ─────────────────────────────────── */}
        {report && !isGenerating && (
          <>
            {/* Regenerate button */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleGenerate}>
                🔄 Regenerate Report
              </Button>
            </div>

            {/* Score chips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Match Scores</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-3 flex-wrap">
                <ScoreChip label="Job Fit"    value={report.scores.job_fit_score} />
                <ScoreChip label="Evidence"   value={report.scores.evidence_confidence_score} />
                <ScoreChip label="Required"   value={report.scores.required_skill_match} />
                <ScoreChip label="Preferred"  value={report.scores.preferred_skill_match} />
                <ScoreChip label="Experience" value={report.scores.experience_relevance_score} />
              </CardContent>
            </Card>

            {/* Executive summary — full width, prominent */}
            <Card className="border-gray-300 bg-white">
              <CardHeader>
                <CardTitle className="text-base text-gray-700 uppercase tracking-wide text-xs font-semibold">
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 leading-relaxed">{report.executive_summary}</p>
              </CardContent>
            </Card>

            {/* Two-column: green left, red/yellow right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Left column — positive signals */}
              <div className="space-y-4">
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-green-800">
                      Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BulletList
                      items={report.strengths}
                      icon="✓"
                      emptyText="No notable strengths identified."
                    />
                  </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-emerald-800">
                      Evidence Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BulletList
                      items={report.evidence_highlights}
                      icon="📎"
                      emptyText="No verified evidence found."
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Right column — concerns */}
              <div className="space-y-4">
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-yellow-800">
                      Evidence Gaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BulletList
                      items={report.evidence_gaps}
                      icon="⚠"
                      emptyText="All key claims are supported by evidence."
                    />
                  </CardContent>
                </Card>

                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-red-800">
                      Concerns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BulletList
                      items={report.concerns}
                      icon="✗"
                      emptyText="No significant concerns identified."
                    />
                  </CardContent>
                </Card>
              </div>

            </div>

            {/* Recommended next step — full width, action-oriented */}
            <Card className="border-blue-300 bg-blue-50">
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">
                  Recommended Next Step
                </p>
                <p className="text-blue-900 font-medium">{report.recommended_next_step}</p>
              </CardContent>
            </Card>

          </>
        )}

      </main>
    </div>
  )
}