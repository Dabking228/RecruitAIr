'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getCandidateProfile, saveProfile, type SaveProfileData } from '@/lib/api/candidates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function CandidateProfilePage() {
  // Form fields
  const [fullName, setFullName] = useState('')
  const [summary, setSummary] = useState('')
  const [education, setEducation] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isExisting, setIsExisting] = useState(false) // true if profile already exists

  // Load existing profile on mount
  useEffect(() => {
    getCandidateProfile()
      .then((profile) => {
        // Profile exists — pre-fill the form
        setFullName(profile.full_name ?? '')
        setSummary(profile.summary ?? '')
        setEducation(profile.education ?? '')
        setPortfolioUrl(profile.portfolio_url ?? '')
        setGithubUrl(profile.github_url ?? '')
        setLinkedinUrl(profile.linkedin_url ?? '')
        setIsExisting(true)
      })
      .catch(() => {
        // 404 = no profile yet — form stays blank, which is correct
        setIsExisting(false)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)

    const data: SaveProfileData = {
      full_name: fullName.trim(),
      summary: summary.trim() || undefined,
      education: education.trim() || undefined,
      portfolio_url: portfolioUrl.trim() || undefined,
      github_url: githubUrl.trim() || undefined,
      linkedin_url: linkedinUrl.trim() || undefined,
    }

    try {
      await saveProfile(data)
      setIsExisting(true)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold mt-1">My Profile</h1>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            {isExisting ? 'Editing existing profile' : 'Create your profile'}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-8">
        <form onSubmit={handleSave} className="space-y-6">

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800">
                ✅ Profile saved successfully!
              </AlertDescription>
            </Alert>
          )}

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                This is what recruiters see when they view your application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1">
                <Label htmlFor="full-name">Full name *</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmad Zafri bin Abdullah"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="summary">Professional summary</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="A brief paragraph about who you are, your key skills, and what you are looking for..."
                  rows={4}
                />
                <p className="text-xs text-gray-400">
                  The AI will also read this when extracting your claims.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="education">Education</Label>
                <Textarea
                  id="education"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="BSc Computer Science — Asia Pacific University (APU), 2022–2026..."
                  rows={3}
                />
              </div>

            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle>Professional Links</CardTitle>
              <CardDescription>
                These will be used by the AI to verify your claims.
                A GitHub link with active projects is strong evidence for technical skills.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1">
                <Label htmlFor="github">GitHub URL</Label>
                <Input
                  id="github"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/yourusername"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="portfolio">Portfolio URL</Label>
                <Input
                  id="portfolio"
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  placeholder="https://yourportfolio.com"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="linkedin">LinkedIn URL</Label>
                <Input
                  id="linkedin"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourusername"
                />
              </div>

            </CardContent>
          </Card>

          <div className="flex items-center gap-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isExisting ? 'Update profile' : 'Create profile'}
            </Button>
            <Link href="/candidate/documents">
              <Button type="button" variant="outline">
                Next: Upload documents →
              </Button>
            </Link>
          </div>

        </form>
      </main>
    </div>
  )
}