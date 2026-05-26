'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  extractClaims,
  getClaims,
  deleteClaim,
  confirmClaim,
  type Claim,
} from '@/lib/api/claims'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Display helpers ───────────────────────────────────────────

const CLAIM_TYPE_CONFIG: Record<string, { label: string; colour: string; emoji: string }> = {
  skill:          { label: 'Skill',          colour: 'bg-blue-100 text-blue-800',   emoji: '⚡' },
  project:        { label: 'Project',        colour: 'bg-purple-100 text-purple-800', emoji: '🛠️' },
  certification:  { label: 'Certification',  colour: 'bg-yellow-100 text-yellow-800', emoji: '🎓' },
  experience:     { label: 'Experience',     colour: 'bg-green-100 text-green-800',  emoji: '💼' },
  leadership:     { label: 'Leadership',     colour: 'bg-orange-100 text-orange-800', emoji: '👥' },
  achievement:    { label: 'Achievement',    colour: 'bg-pink-100 text-pink-800',    emoji: '🏆' },
}

const VERIFICATION_CONFIG: Record<string, { label: string; colour: string; description: string }> = {
  ai_inferred:    {
    label: 'AI Extracted',
    colour: 'bg-gray-100 text-gray-700',
    description: 'Extracted by AI — confirm if this is accurate',
  },
  user_confirmed: {
    label: 'You Confirmed',
    colour: 'bg-green-100 text-green-800',
    description: 'You confirmed this claim is true',
  },
  verified:       {
    label: 'Evidence-Supported',
    colour: 'bg-blue-100 text-blue-800',
    description: 'Supported by evidence you uploaded',
  },
  needs_evidence: {
    label: 'Needs Evidence',
    colour: 'bg-orange-100 text-orange-700',
    description: 'This claim needs supporting evidence',
  },
}

function ClaimCard({
  claim,
  onDelete,
  onConfirm,
  isDeleting,
  isConfirming,
}: {
  claim: Claim
  onDelete: () => void
  onConfirm: () => void
  isDeleting: boolean
  isConfirming: boolean
}) {
  const typeConfig = CLAIM_TYPE_CONFIG[claim.claim_type] ?? CLAIM_TYPE_CONFIG.skill
  const verification = claim.claim_verifications?.[0]
  const verConfig = verification
    ? VERIFICATION_CONFIG[verification.status]
    : VERIFICATION_CONFIG.ai_inferred

  const isConfirmed = verification?.candidate_confirmed ?? false
  const confidencePercent = verification
    ? Math.round(verification.confidence_score)
    : 0

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">

      {/* Header row */}
      <div className="flex items-start gap-2 flex-wrap">
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${typeConfig.colour}`}
        >
          {typeConfig.emoji} {typeConfig.label}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium ${verConfig.colour}`}
        >
          {verConfig.label}
        </span>
        {confidencePercent > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            AI confidence: {confidencePercent}%
          </span>
        )}
      </div>

      {/* Claim text */}
      <p className="text-gray-900 text-sm leading-relaxed">{claim.claim_text}</p>

      {/* AI reason */}
      {verification?.ai_reason && (
        <p className="text-xs text-gray-400 italic">{verification.ai_reason}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {!isConfirmed && (
          <Button
            size="sm"
            variant="outline"
            onClick={onConfirm}
            disabled={isConfirming || isDeleting}
            className="text-green-700 border-green-300 hover:bg-green-50"
          >
            {isConfirming ? '...' : '✓ This is accurate'}
          </Button>
        )}
        {isConfirmed && (
          <span className="text-xs text-green-600 font-medium self-center">
            ✅ Confirmed by you
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={isDeleting || isConfirming}
          className="text-red-400 hover:text-red-600 hover:bg-red-50 ml-auto"
        >
          {isDeleting ? '...' : 'Not accurate'}
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    getClaims()
      .then((res) => setClaims(res.claims))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── Extract claims ─────────────────────────────────────────

  const handleExtract = async () => {
    setExtracting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await extractClaims()
      setClaims(result.claims)
      setSuccessMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.')
    } finally {
      setExtracting(false)
    }
  }

  // ── Delete a claim ─────────────────────────────────────────

  const handleDelete = async (claim: Claim) => {
    if (!confirm('Remove this claim? This cannot be undone.')) return
    setDeletingId(claim.id)
    try {
      await deleteClaim(claim.id)
      setClaims((prev) => prev.filter((c) => c.id !== claim.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove claim.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Confirm a claim ────────────────────────────────────────

  const handleConfirm = async (claim: Claim) => {
    setConfirmingId(claim.id)
    try {
      const result = await confirmClaim(claim.id)
      // Update the claim's verification status in local state
      setClaims((prev) =>
        prev.map((c) => {
          if (c.id !== claim.id) return c
          return {
            ...c,
            claim_verifications: [result.verification],
          }
        }),
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm claim.')
    } finally {
      setConfirmingId(null)
    }
  }

  // ── Stats ──────────────────────────────────────────────────

  const confirmedCount = claims.filter(
    (c) => c.claim_verifications?.[0]?.candidate_confirmed,
  ).length

  const byType = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.claim_type] = (acc[c.claim_type] ?? 0) + 1
    return acc
  }, {})

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">My Claims</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Intro card */}
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-blue-800 text-sm font-medium mb-1">
              What are claims?
            </p>
            <p className="text-blue-700 text-sm">
              Claims are specific things the AI extracted from your resume and profile —
              skills you have, projects you built, certifications you hold.
              Confirm the ones that are accurate, and remove any that are wrong.
              You will add evidence to each claim in the next step.
            </p>
          </CardContent>
        </Card>

        {/* Error/success messages */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {successMessage && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              ✅ {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Extract button */}
        <div className="flex items-center gap-4">
          <Button onClick={handleExtract} disabled={extracting}>
            {extracting
              ? 'AI is reading your documents... (10–20s)'
              : claims.length > 0
              ? '🔄 Re-extract claims'
              : '✨ Extract my claims with AI'}
          </Button>
          {claims.length > 0 && (
            <Link href="/candidate/documents">
              <Button variant="outline">Manage documents</Button>
            </Link>
          )}
        </div>

        {/* Loading */}
        {loading && <p className="text-gray-400 text-sm">Loading claims...</p>}

        {/* Stats bar */}
        {!loading && claims.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{claims.length}</div>
              <div className="text-xs text-gray-500">Total claims</div>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{confirmedCount}</div>
              <div className="text-xs text-gray-500">Confirmed</div>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {byType.skill ?? 0}
              </div>
              <div className="text-xs text-gray-500">Skills</div>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">
                {byType.project ?? 0}
              </div>
              <div className="text-xs text-gray-500">Projects</div>
            </div>
          </div>
        )}

        {/* Claims list */}
        {!loading && claims.length === 0 && !extracting && (
          <div className="text-center py-16 bg-white border border-dashed rounded-lg">
            <p className="text-gray-400 text-lg mb-2">No claims yet</p>
            <p className="text-gray-400 text-sm">
              Complete your profile and upload your resume, then click
              &quot;Extract my claims with AI&quot; above.
            </p>
          </div>
        )}

        {!loading && claims.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900">
              {claims.length} extracted claims
            </h2>
            {claims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                onDelete={() => handleDelete(claim)}
                onConfirm={() => handleConfirm(claim)}
                isDeleting={deletingId === claim.id}
                isConfirming={confirmingId === claim.id}
              />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}