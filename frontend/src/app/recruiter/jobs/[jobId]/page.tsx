'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getJob } from '@/lib/api/jobs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (jobId) {
      getJob(jobId)
        .then(setJob)
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [jobId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading job...</p>
    </div>
  )

  if (!job) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-500">Job not found.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/recruiter/jobs" className="text-blue-600 hover:underline text-sm">
              ← My Jobs
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-xl font-bold">{job.title}</h1>
              <Badge variant="outline">{job.status}</Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 space-y-6">

        {/* Job info */}
        <Card>
          <CardHeader>
            <CardTitle>Job Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p><span className="font-medium text-sm text-gray-500">Location:</span> {job.location || '—'}</p>
            <p><span className="font-medium text-sm text-gray-500">Work mode:</span> {job.work_mode || '—'}</p>
            <p><span className="font-medium text-sm text-gray-500">Employment type:</span> {job.employment_type || '—'}</p>
            <p><span className="font-medium text-sm text-gray-500">Evidence threshold:</span> {job.verification_threshold}%</p>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
              {job.description}
            </pre>
          </CardContent>
        </Card>

        {/* AI parser — placeholder for Phase 7 */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <p className="font-semibold text-blue-900 mb-1">
              Next step: Extract Requirements with AI
            </p>
            <p className="text-blue-700 text-sm mb-4">
              The AI will read your job description and extract structured
              requirements (skills, certifications, responsibilities) that
              candidates will be evaluated against.
            </p>
            <Button disabled variant="default">
              Parse with AI — coming in Phase 7
            </Button>
          </CardContent>
        </Card>

      </main>
    </div>
  )
}