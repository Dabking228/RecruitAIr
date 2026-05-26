'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getOpenJobs, type OpenJob } from '@/lib/api/applications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function workModeColour(mode: string | null): string {
  if (mode === 'remote')  return 'bg-green-100 text-green-700'
  if (mode === 'hybrid')  return 'bg-blue-100 text-blue-700'
  if (mode === 'onsite')  return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-600'
}

function JobCard({ job }: { job: OpenJob }) {
  const reqCount = job.job_requirements?.length ?? 0

  return (
    <div className="bg-white border rounded-lg p-5 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-base">{job.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{job.companies.name}</p>
          {job.companies.industry && (
            <p className="text-xs text-gray-400">{job.companies.industry}</p>
          )}
        </div>
        <Link href={`/candidate/jobs/${job.id}`}>
          <Button size="sm">View & Apply</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {job.work_mode && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${workModeColour(job.work_mode)}`}>
            {job.work_mode}
          </span>
        )}
        {job.employment_type && (
          <Badge variant="secondary" className="text-xs capitalize">
            {job.employment_type}
          </Badge>
        )}
        {job.location && (
          <span className="text-xs text-gray-500">📍 {job.location}</span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        {reqCount > 0 && (
          <span>🎯 {reqCount} requirements</span>
        )}
        <span>Evidence threshold: {job.verification_threshold}%</span>
        <span className="ml-auto">
          {new Date(job.created_at).toLocaleDateString('en-MY', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}

export default function CandidateJobsPage() {
  const [jobs, setJobs] = useState<OpenJob[]>([])
  const [filtered, setFiltered] = useState<OpenJob[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getOpenJobs()
      .then((res) => {
        setJobs(res.jobs)
        setFiltered(res.jobs)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.companies.name.toLowerCase().includes(q) ||
          (j.companies.industry ?? '').toLowerCase().includes(q),
      ),
    )
  }, [search, jobs])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">Browse Jobs</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Search */}
        <Input
          placeholder="Search by job title, company, or industry..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && <p className="text-gray-400">Loading jobs...</p>}

        {error && (
          <p className="text-red-500 text-sm">Failed to load jobs: {error}</p>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 bg-white border border-dashed rounded-lg">
            <p className="text-gray-400">
              {search ? 'No jobs match your search.' : 'No open jobs right now.'}
            </p>
          </div>
        )}

        {!loading && (
          <div className="space-y-3">
            {filtered.length > 0 && (
              <p className="text-sm text-gray-500">
                {filtered.length} open position{filtered.length !== 1 ? 's' : ''}
              </p>
            )}
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}