'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getMyJobs } from '@/lib/api/jobs'
import { Job } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

// Helper: gives each status a colour
function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'open') return 'default'
  if (status === 'closed') return 'secondary'
  return 'outline'   // draft
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function JobsListPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMyJobs()
      .then(({ jobs }) => setJobs(jobs))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/recruiter/dashboard" className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold mt-1">My Jobs</h1>
          </div>
          <Link href="/recruiter/jobs/new">
            <Button>+ Post New Job</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8">
        {loading && (
          <p className="text-gray-500 text-center py-12">Loading your jobs...</p>
        )}

        {error && (
          <p className="text-red-500 text-center py-12">{error}</p>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-2">No jobs yet</p>
            <p className="text-gray-400 mb-6">
              Post your first job to start receiving applications.
            </p>
            <Link href="/recruiter/jobs/new">
              <Button>Post your first job</Button>
            </Link>
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Link key={job.id} href={`/recruiter/jobs/${job.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer mb-4">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="font-semibold text-gray-900">{job.title}</h2>
                          <Badge variant={statusVariant(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                          {job.work_mode && (
                            <span className="mr-3 capitalize">{job.work_mode}</span>
                          )}
                          {job.employment_type && (
                            <span className="mr-3 capitalize">{job.employment_type}</span>
                          )}
                          {job.location && <span>{job.location}</span>}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 whitespace-nowrap ml-4">
                        {formatDate(job.created_at)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}