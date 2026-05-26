'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getMyCompany, createCompany, type CreateCompanyInput } from '@/lib/api/companies'
import { Company } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function CompanyPage() {
  const router = useRouter()

  // Page state
  const [company, setCompany] = useState<Company | null>(null)
  const [pageLoading, setPageLoading] = useState(true)

  // Form state
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Load existing company on mount
  useEffect(() => {
    getMyCompany()
      .then(({ company }) => {
        setCompany(company)
      })
      .catch(console.error)
      .finally(() => setPageLoading(false))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Company name is required.')
      return
    }

    setFormLoading(true)
    setFormError(null)

    try {
      const newCompany = await createCompany({
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
      })
      setCompany(newCompany)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create company.')
    } finally {
      setFormLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // ── Already has a company — show it ──────────────────────
  if (company) {
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
          <h1 className="text-2xl font-bold mb-1">Company Profile</h1>
          <p className="text-gray-500 mb-8">Your organisation details</p>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Company Name
                </p>
                <p className="text-lg font-semibold mt-1">{company.name}</p>
              </div>

              {company.industry && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                    Industry
                  </p>
                  <p className="mt-1">{company.industry}</p>
                </div>
              )}

              {company.website && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                    Website
                  </p>
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline mt-1 block"
                  >
                    {company.website}
                  </a>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Company ID
                </p>
                <p className="text-xs text-gray-400 font-mono mt-1">{company.id}</p>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            <Button onClick={() => router.push('/recruiter/jobs')}>
              Go to My Jobs →
            </Button>
          </div>
        </main>
      </div>
    )
  }

  // ── No company yet — show creation form ──────────────────
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
        <h1 className="text-2xl font-bold mb-1">Create Company Profile</h1>
        <p className="text-gray-500 mb-8">
          You need a company profile before you can post jobs.
        </p>

        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>
              This information will appear on your job listings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1">
                <Label htmlFor="name">Company name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Technologies Sdn Bhd"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Software, Finance, Healthcare"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                />
              </div>

              <Button type="submit" disabled={formLoading} className="w-full">
                {formLoading ? 'Creating...' : 'Create company profile'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}