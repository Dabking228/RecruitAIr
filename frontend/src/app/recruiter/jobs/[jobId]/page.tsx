'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  getJob,
  parseJobDescription,
  saveJobRequirements,
  type ParsedRequirement,
  type SavedRequirement,
} from '@/lib/api/jobs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

// ── Helper: colour-coded badges ──────────────────────────────

function requirementTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    required_skill: 'Required Skill',
    preferred_skill: 'Preferred Skill',
    responsibility: 'Responsibility',
    certification: 'Certification',
  }
  return labels[type] ?? type
}

function requirementTypeColour(type: string): string {
  const colours: Record<string, string> = {
    required_skill: 'bg-blue-100 text-blue-800',
    preferred_skill: 'bg-green-100 text-green-800',
    responsibility: 'bg-orange-100 text-orange-800',
    certification: 'bg-purple-100 text-purple-800',
  }
  return colours[type] ?? 'bg-gray-100 text-gray-800'
}

// ── Requirement card ─────────────────────────────────────────

function RequirementCard({
  req,
  onDelete,
  showDelete,
}: {
  req: ParsedRequirement | SavedRequirement
  onDelete?: () => void
  showDelete: boolean
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white border rounded-lg">
      <div className="flex-1 min-w-0">

        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-semibold text-gray-900 text-sm">{req.name}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${requirementTypeColour(req.requirement_type)}`}
          >
            {requirementTypeLabel(req.requirement_type)}
          </span>
          <Badge variant={req.importance === 'must_have' ? 'default' : 'secondary'}>
            {req.importance === 'must_have' ? 'Must have' : 'Nice to have'}
          </Badge>
        </div>

        {req.description && (
          <p className="text-sm text-gray-600">{req.description}</p>
        )}

        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span>Weight: {req.weight}</span>
          <span>{req.evidence_expected ? '📎 Evidence expected' : 'No evidence needed'}</span>
        </div>

      </div>

      {showDelete && onDelete && (
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none mt-0.5 flex-shrink-0"
          title="Remove this requirement"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const router = useRouter()

  // Job data
  const [job, setJob] = useState<any>(null)
  const [jobLoading, setJobLoading] = useState(true)

  // AI parsing state
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [jobSummary, setJobSummary] = useState<string>('')

  // Requirements — two separate lists:
  // pendingRequirements: AI suggestions being reviewed (not saved yet)
  // savedRequirements: already in the database
  const [pendingRequirements, setPendingRequirements] = useState<ParsedRequirement[] | null>(null)
  const [savedRequirements, setSavedRequirements] = useState<SavedRequirement[]>([])

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load job on mount
  useEffect(() => {
    if (!jobId) return
    getJob(jobId)
      .then((data: any) => {
        setJob(data)
        // If requirements already exist in the DB, show them as saved
        if (data.job_requirements?.length > 0) {
          setSavedRequirements(data.job_requirements)
        }
      })
      .catch(console.error)
      .finally(() => setJobLoading(false))
  }, [jobId])

  // ── Handlers ────────────────────────────────────────────────

  const handleParse = async () => {
    setIsParsing(true)
    setParseError(null)
    setSaveSuccess(false)
    // Clear any pending requirements from a previous parse
    setPendingRequirements(null)

    try {
      const result = await parseJobDescription(jobId)
      setJobSummary(result.job_summary)
      setPendingRequirements(result.requirements)
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'An unexpected error occurred.',
      )
    } finally {
      setIsParsing(false)
    }
  }

  const handleDeletePending = (index: number) => {
    setPendingRequirements((prev) =>
      prev ? prev.filter((_, i) => i !== index) : prev,
    )
  }

  const handleConfirmRequirements = async () => {
    if (!pendingRequirements || pendingRequirements.length === 0) return

    setIsSaving(true)
    try {
      const result = await saveJobRequirements(jobId, pendingRequirements)
      setSavedRequirements(result.requirements)
      setPendingRequirements(null)
      setSaveSuccess(true)
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to save requirements.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  if (jobLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Job not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/recruiter/jobs" className="text-blue-600 hover:underline text-sm">
              ← My Jobs
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-xl font-bold">{job.title}</h1>
              <Badge variant={job.status === 'open' ? 'default' : 'outline'}>
                {job.status}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/recruiter/jobs/${jobId}/candidates`)}
              >
                View Candidates
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 space-y-6">

        {/* Job metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Job Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Location</p>
              <p>{job.location || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Work Mode</p>
              <p className="capitalize">{job.work_mode || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Employment Type</p>
              <p className="capitalize">{job.employment_type || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Evidence Threshold</p>
              <p>{job.verification_threshold}%</p>
            </div>
          </CardContent>
        </Card>

        {/* Job description */}
        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
            <CardDescription>
              {job.description.length} characters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed max-h-64 overflow-y-auto">
              {job.description}
            </pre>
          </CardContent>
        </Card>

        <Separator />

        {/* ── AI Parsing Section ────────────────────────────── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Step 2: Extract Requirements with AI
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Click the button below to have Gemini read your job description and
            extract structured requirements. You will review and confirm them
            before anything is saved.
          </p>

          {/* Error alert */}
          {parseError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Success alert */}
          {saveSuccess && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <AlertDescription className="text-green-800">
                ✅ Requirements saved successfully. Candidates will be evaluated against these.
              </AlertDescription>
            </Alert>
          )}

          {/* Parse button */}
          {!isParsing && pendingRequirements === null && (
            <Button onClick={handleParse} disabled={isParsing}>
              {savedRequirements.length > 0
                ? '🔄 Re-parse with AI'
                : '✨ Parse with AI'}
            </Button>
          )}

          {/* Loading state */}
          {isParsing && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6 text-center py-8">
                <div className="text-blue-700 font-medium mb-2">
                  AI is reading your job description...
                </div>
                <p className="text-blue-600 text-sm">
                  Gemini is extracting requirements, assigning types and weights.
                  This takes 5–15 seconds.
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="h-2 w-32 bg-blue-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Pending requirements — review state ──────── */}
          {pendingRequirements !== null && !isParsing && (
            <div className="space-y-4">

              {jobSummary && (
                <Card className="border-blue-100 bg-blue-50">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">
                      AI Summary
                    </p>
                    <p className="text-blue-900 text-sm">{jobSummary}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {pendingRequirements.length} requirements extracted
                  </h3>
                  <p className="text-sm text-gray-500">
                    Review and remove any that don&apos;t apply, then confirm.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleParse}
                  className="text-sm"
                >
                  Re-parse
                </Button>
              </div>

              {/* Requirements list */}
              <div className="space-y-2">
                {pendingRequirements.map((req, index) => (
                  <RequirementCard
                    key={index}
                    req={req}
                    onDelete={() => handleDeletePending(index)}
                    showDelete={true}
                  />
                ))}
              </div>

              {pendingRequirements.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  All requirements removed. Click Re-parse to start again.
                </div>
              )}

              {/* Confirm button */}
              {pendingRequirements.length > 0 && (
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleConfirmRequirements}
                    disabled={isSaving}
                  >
                    {isSaving
                      ? 'Saving...'
                      : `Confirm ${pendingRequirements.length} Requirements`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPendingRequirements(null)}
                    disabled={isSaving}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Saved requirements — confirmed state ──────── */}
          {savedRequirements.length > 0 && pendingRequirements === null && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  ✅ {savedRequirements.length} confirmed requirements
                </h3>
                <Button variant="outline" size="sm" onClick={handleParse}>
                  Re-parse
                </Button>
              </div>

              <div className="space-y-2">
                {savedRequirements.map((req) => (
                  <RequirementCard
                    key={req.id}
                    req={req}
                    showDelete={false}
                  />
                ))}
              </div>

              <p className="text-sm text-gray-400">
                Candidates who apply will be evaluated against these requirements.
                You can re-parse and re-confirm at any time before the job closes.
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}