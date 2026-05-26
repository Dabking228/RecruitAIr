'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  getJobPublic, getApplyReadiness, applyToJob,
  type OpenJob, type ReadinessResult,
} from '@/lib/api/applications'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

// ── Readiness panel ───────────────────────────────────────────

function ReadinessPanel({ readiness }: { readiness: ReadinessResult }) {
  const { checks, passed, total, level } = readiness

  const items = [
    { key: 'has_profile',  label: 'Profile completed',       href: '/candidate/profile' },
    { key: 'has_resume',   label: 'Resume uploaded',         href: '/candidate/documents' },
    { key: 'has_claims',   label: 'Claims extracted by AI',  href: '/candidate/claims' },
    { key: 'has_evidence', label: 'Evidence added to claims', href: '/candidate/claims' },
  ] as const

  const levelConfig = {
    excellent: { colour: 'border-green-200 bg-green-50', text: 'text-green-800', label: 'Excellent — your profile is fully ready' },
    good:      { colour: 'border-blue-200 bg-blue-50',   text: 'text-blue-800',  label: 'Good — one more step will strengthen your application' },
    fair:      { colour: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-800', label: 'Fair — complete more steps to improve your score' },
    low:       { colour: 'border-red-200 bg-red-50',     text: 'text-red-800',   label: 'Low — your application may receive a very low score' },
  }[level]

  return (
    <Card className={`border ${levelConfig.colour}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm ${levelConfig.text}`}>
          Application Readiness — {passed}/{total} steps complete
        </CardTitle>
        <p className={`text-xs ${levelConfig.text}`}>{levelConfig.label}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const done = checks[item.key]
          return (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              <span>{done ? '✅' : '⬜'}</span>
              {done ? (
                <span className="text-gray-700">{item.label}</span>
              ) : (
                <Link href={item.href} className="text-blue-600 hover:underline">
                  {item.label}
                </Link>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ── Requirements list ─────────────────────────────────────────

function RequirementsList({ job }: { job: OpenJob }) {
  const requirements = job.job_requirements ?? []

  if (requirements.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        The recruiter has not published requirements yet.
      </p>
    )
  }

  const mustHave  = requirements.filter((r) => r.importance === 'must_have')
  const niceToHave = requirements.filter((r) => r.importance === 'nice_to_have')

  const typeColour: Record<string, string> = {
    required_skill:  'bg-blue-100 text-blue-800',
    preferred_skill: 'bg-green-100 text-green-800',
    responsibility:  'bg-orange-100 text-orange-800',
    certification:   'bg-purple-100 text-purple-800',
  }

  const ReqRow = ({ req }: { req: typeof requirements[0] }) => (
    <div className="flex items-start gap-2 py-2">
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${typeColour[req.requirement_type] ?? 'bg-gray-100 text-gray-700'}`}>
        {req.requirement_type.replace('_', ' ')}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{req.name}</p>
        {req.description && (
          <p className="text-xs text-gray-500">{req.description}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">
        {req.evidence_expected ? '📎 Evidence' : ''}
      </span>
    </div>
  )

  return (
    <div className="space-y-4">
      {mustHave.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Must Have ({mustHave.length})
          </p>
          <div className="divide-y">
            {mustHave.map((r) => <ReqRow key={r.id} req={r} />)}
          </div>
        </div>
      )}
      {niceToHave.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Nice to Have ({niceToHave.length})
          </p>
          <div className="divide-y">
            {niceToHave.map((r) => <ReqRow key={r.id} req={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function CandidateJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const router = useRouter()

  const [job, setJob] = useState<OpenJob | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  useEffect(() => {
    if (!jobId) return
    Promise.all([
      getJobPublic(jobId),
      getApplyReadiness(jobId),
    ]).then(([jobData, readinessData]) => {
      setJob(jobData)
      setReadiness(readinessData)
    }).catch(console.error)
     .finally(() => setLoading(false))
  }, [jobId])

  const handleApply = async () => {
    if (!confirm(`Apply to "${job?.title}" at ${job?.companies?.name}? You cannot undo this.`)) {
      return
    }

    setApplying(true)
    setApplyError(null)

    try {
      await applyToJob(jobId)
      setApplySuccess(true)
      // Redirect to My Applications after a short pause
      setTimeout(() => router.push('/candidate/applications'), 1500)
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Application failed.')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Job not found or no longer open.</p>
          <Link href="/candidate/jobs" className="text-blue-600 hover:underline text-sm mt-2 block">
            ← Browse other jobs
          </Link>
        </div>
      </div>
    )
  }

  const alreadyApplied = readiness?.already_applied ?? false
  const existingApp    = readiness?.existing_application

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/candidate/jobs" className="text-blue-600 hover:underline text-sm">
            ← Browse jobs
          </Link>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">{job.title}</h1>
              <p className="text-sm text-gray-500">
                {job.companies.name}
                {job.companies.industry && ` · ${job.companies.industry}`}
              </p>
            </div>

            {/* Apply / Applied button */}
            <div className="flex-shrink-0">
              {applySuccess ? (
                <div className="text-green-700 font-medium text-sm">
                  ✅ Applied — redirecting...
                </div>
              ) : alreadyApplied ? (
                <div className="text-right">
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    ✓ Applied
                  </Badge>
                  {existingApp && (
                    <p className="text-xs text-gray-400 mt-1 capitalize">
                      Status: {existingApp.status.replace('_', ' ')}
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  onClick={handleApply}
                  disabled={applying}
                  size="lg"
                >
                  {applying ? 'Submitting...' : 'Apply Now'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column — job details */}
          <div className="lg:col-span-2 space-y-6">

            {applyError && (
              <Alert variant="destructive">
                <AlertDescription>{applyError}</AlertDescription>
              </Alert>
            )}

            {/* Quick facts */}
            <Card>
              <CardContent className="pt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Work mode</p>
                  <p className="capitalize mt-0.5">{job.work_mode ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Type</p>
                  <p className="capitalize mt-0.5">{job.employment_type ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Location</p>
                  <p className="mt-0.5">{job.location ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Evidence threshold</p>
                  <p className="mt-0.5">{job.verification_threshold}% of claims must be evidence-supported</p>
                </div>
              </CardContent>
            </Card>

            {/* Job description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job Description</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed max-h-80 overflow-y-auto">
                  {job.description}
                </pre>
              </CardContent>
            </Card>

            <Separator />

            {/* Requirements */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  What You Will Be Evaluated On
                </CardTitle>
                <p className="text-sm text-gray-500">
                  The AI will match your claims and evidence against these
                  requirements when scoring your application.
                </p>
              </CardHeader>
              <CardContent>
                <RequirementsList job={job} />
              </CardContent>
            </Card>

          </div>

          {/* Right column — readiness + apply */}
          <div className="space-y-4">

            {readiness && <ReadinessPanel readiness={readiness} />}

            {!alreadyApplied && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    Your claims and evidence will be automatically evaluated
                    against this job&apos;s requirements by the AI.
                  </p>
                  <Button
                    className="w-full"
                    onClick={handleApply}
                    disabled={applying || applySuccess}
                  >
                    {applying ? 'Submitting...' : 'Apply Now'}
                  </Button>
                  <p className="text-xs text-gray-400 text-center">
                    Applications cannot be withdrawn after submission.
                  </p>
                </CardContent>
              </Card>
            )}

            {alreadyApplied && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-0">
                  <p className="text-green-800 font-medium text-sm mb-1">
                    ✅ Application submitted
                  </p>
                  <p className="text-green-700 text-xs">
                    Status: <span className="capitalize font-medium">
                      {existingApp?.status?.replace('_', ' ') ?? 'Submitted'}
                    </span>
                  </p>
                  <Link href="/candidate/applications" className="text-blue-600 text-xs hover:underline block mt-2">
                    View all my applications →
                  </Link>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}