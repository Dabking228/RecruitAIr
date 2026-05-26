'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getApplicationDetail,
  generateQuestions,
  saveQuestions,
  getInterviewQuestions,
  deleteInterviewQuestion,
  type RecruiterApplicationDetail,
  type PendingQuestion,
  type InterviewQuestion,
  type QuestionType,
} from '@/lib/api/applications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Helpers ──────────────────────────────────────────────────

const QUESTION_TYPE_CONFIG: Record<QuestionType, { label: string; colour: string }> = {
  technical:      { label: 'Technical',      colour: 'bg-blue-100 text-blue-800' },
  behavioral:     { label: 'Behavioral',     colour: 'bg-green-100 text-green-800' },
  evidence_check: { label: 'Evidence Check', colour: 'bg-red-100 text-red-800' },
  role_specific:  { label: 'Role Specific',  colour: 'bg-purple-100 text-purple-800' },
}

function QuestionTypeBadge({ type }: { type: QuestionType }) {
  const { label, colour } = QUESTION_TYPE_CONFIG[type] ?? QUESTION_TYPE_CONFIG.technical
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colour}`}>
      {label}
    </span>
  )
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

// ── Main page ─────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>()

  const [application, setApplication] = useState<RecruiterApplicationDetail | null>(null)
  const [savedQuestions, setSavedQuestions] = useState<InterviewQuestion[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[] | null>(null)

  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load application detail + any existing questions on mount
  useEffect(() => {
    Promise.all([
      getApplicationDetail(applicationId),
      getInterviewQuestions(applicationId),
    ])
      .then(([appData, questionsData]) => {
        setApplication(appData)
        setSavedQuestions(questionsData.questions)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [applicationId])

  // ── Handlers ─────────────────────────────────────────────────

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    setSaveSuccess(false)
    setPendingQuestions(null)

    try {
      const result = await generateQuestions(applicationId)
      setPendingQuestions(result.questions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleDeletePending(index: number) {
    setPendingQuestions((prev) => prev ? prev.filter((_, i) => i !== index) : prev)
  }

  async function handleConfirm() {
    if (!pendingQuestions || pendingQuestions.length === 0) return
    setIsSaving(true)
    try {
      const result = await saveQuestions(applicationId, pendingQuestions)
      setSavedQuestions(result.questions)
      setPendingQuestions(null)
      setSaveSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteSaved(questionId: string) {
    try {
      await deleteInterviewQuestion(applicationId, questionId)
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading candidate...</p>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Application not found.</p>
      </div>
    )
  }

  const score = application.match_scores?.[0]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href={`/recruiter/jobs/${application.jobs.id}/candidates`}
            className="text-blue-600 hover:underline text-sm"
          >
            ← Back to Candidates
          </Link>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">
                {application.candidate.name || application.candidate.email}
              </h1>
              <p className="text-sm text-gray-500">
                {application.candidate.email} · {application.jobs.title}
              </p>
            </div>
            <Badge variant="outline" className="capitalize">
              {application.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Score summary */}
        {score && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Match Scores</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <ScoreChip label="Job Fit"    value={score.job_fit_score} />
              <ScoreChip label="Evidence"   value={score.evidence_confidence_score} />
              <ScoreChip label="Required"   value={score.required_skill_match} />
              <ScoreChip label="Preferred"  value={score.preferred_skill_match} />
              <ScoreChip label="Experience" value={score.experience_relevance_score} />
            </CardContent>
          </Card>
        )}

        {/* Errors and success */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saveSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              ✅ Interview questions saved. You can regenerate at any time.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Interview Questions Section ─────────────────────── */}
        <div>
          <h2 className="text-lg font-bold mb-1">Interview Questions</h2>
          <p className="text-sm text-gray-500 mb-4">
            AI generates questions targeting this candidate&apos;s evidence gaps and key claims.
            Review and remove any before confirming.
          </p>

          {/* Generate button — shown when not generating and no pending list */}
          {!isGenerating && pendingQuestions === null && (
            <Button onClick={handleGenerate}>
              {savedQuestions.length > 0 ? '🔄 Regenerate Questions' : '✨ Generate Questions'}
            </Button>
          )}

          {/* Generating state */}
          {isGenerating && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-8 text-center">
                <p className="text-blue-700 font-medium mb-1">
                  AI is reading the candidate profile...
                </p>
                <p className="text-blue-600 text-sm">
                  Gemini is targeting evidence gaps and key requirements. Takes 5–15 seconds.
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="h-2 w-32 bg-blue-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Pending (review) state ─────────────────────────── */}
          {pendingQuestions !== null && !isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    {pendingQuestions.length} questions suggested
                  </h3>
                  <p className="text-sm text-gray-500">
                    Remove any that don&apos;t apply, then confirm to save.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleGenerate}>
                  Re-generate
                </Button>
              </div>

              <div className="space-y-3">
                {pendingQuestions.map((q, i) => (
                  <div key={i} className="bg-white border rounded-lg p-4 flex gap-3 items-start">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <QuestionTypeBadge type={q.question_type} />
                      </div>
                      <p className="text-sm font-medium text-gray-900">{q.question}</p>
                      {q.reason && (
                        <p className="text-xs text-gray-400 italic">Why: {q.reason}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeletePending(i)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg flex-shrink-0"
                      title="Remove this question"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {pendingQuestions.length === 0 && (
                <p className="text-center text-gray-400 py-6">
                  All removed. Click Re-generate to start again.
                </p>
              )}

              {pendingQuestions.length > 0 && (
                <div className="flex gap-3 pt-2">
                  <Button onClick={handleConfirm} disabled={isSaving}>
                    {isSaving ? 'Saving...' : `Confirm ${pendingQuestions.length} Questions`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPendingQuestions(null)}
                    disabled={isSaving}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Saved questions ────────────────────────────────── */}
          {savedQuestions.length > 0 && pendingQuestions === null && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  ✅ {savedQuestions.length} confirmed questions
                </h3>
                <Button variant="outline" size="sm" onClick={handleGenerate}>
                  Re-generate
                </Button>
              </div>
              {savedQuestions.map((q) => (
                <div key={q.id} className="bg-white border rounded-lg p-4 flex gap-3 items-start">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <QuestionTypeBadge type={q.question_type} />
                    </div>
                    <p className="text-sm font-medium text-gray-900">{q.question}</p>
                    {q.reason && (
                      <p className="text-xs text-gray-400 italic">Why: {q.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteSaved(q.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg flex-shrink-0"
                    title="Delete this question"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}