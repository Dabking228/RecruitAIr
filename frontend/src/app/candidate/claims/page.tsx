'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  extractClaims, getClaims, deleteClaim, confirmClaim,
  addEvidence, removeEvidence, getClaimEvidence,
  type Claim, type Evidence, type EvidenceType,
} from '@/lib/api/claims'
import { getDocuments, type CandidateDocument } from '@/lib/api/documents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Constants and helpers ─────────────────────────────────────

const CLAIM_TYPE_CONFIG: Record<string, { label: string; colour: string; emoji: string }> = {
  skill:         { label: 'Skill',         colour: 'bg-blue-100 text-blue-800',    emoji: '⚡' },
  project:       { label: 'Project',       colour: 'bg-purple-100 text-purple-800', emoji: '🛠️' },
  certification: { label: 'Certification', colour: 'bg-yellow-100 text-yellow-800', emoji: '🎓' },
  experience:    { label: 'Experience',    colour: 'bg-green-100 text-green-800',   emoji: '💼' },
  leadership:    { label: 'Leadership',    colour: 'bg-orange-100 text-orange-800', emoji: '👥' },
  achievement:   { label: 'Achievement',   colour: 'bg-pink-100 text-pink-800',     emoji: '🏆' },
}

const VERIFICATION_CONFIG: Record<string, { label: string; colour: string }> = {
  ai_inferred:    { label: 'AI Extracted',        colour: 'bg-gray-100 text-gray-600' },
  user_confirmed: { label: 'You Confirmed',        colour: 'bg-green-100 text-green-700' },
  verified:       { label: 'Evidence-Supported',   colour: 'bg-blue-100 text-blue-700' },
  needs_evidence: { label: 'Needs Evidence',       colour: 'bg-orange-100 text-orange-700' },
}

const EVIDENCE_TYPE_OPTIONS: { value: EvidenceType; label: string; placeholder: string; isUrl: boolean }[] = [
  { value: 'github',      label: '🐙 GitHub',         placeholder: 'https://github.com/username/repo', isUrl: true },
  { value: 'link',        label: '🔗 Web Link',        placeholder: 'https://yourportfolio.com/project', isUrl: true },
  { value: 'certificate', label: '🎓 Certificate',     placeholder: 'Pick from your uploaded documents', isUrl: false },
  { value: 'screenshot',  label: '🖼️  Screenshot',     placeholder: 'Pick from your uploaded documents', isUrl: false },
  { value: 'file',        label: '📄 Document',        placeholder: 'Pick from your uploaded documents', isUrl: false },
]

function isUrlEvidenceType(type: EvidenceType): boolean {
  return ['github', 'link'].includes(type)
}

function formatEvidenceUrl(url: string): string {
  // If it looks like a storage path (no protocol), format it nicely
  if (!url.startsWith('http')) {
    return url.split('/').pop() ?? url
  }
  try {
    return new URL(url).hostname + new URL(url).pathname
  } catch {
    return url
  }
}

// ── Evidence Panel ────────────────────────────────────────────

function EvidencePanel({
  claim,
  allDocuments,
  onStatusChange,
}: {
  claim: Claim
  allDocuments: CandidateDocument[]
  onStatusChange: (claimId: string, newStatus: string, confirmed: boolean) => void
}) {
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loadingEvidence, setLoadingEvidence] = useState(true)

  // Add form state
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('github')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    getClaimEvidence(claim.id)
      .then((res) => setEvidence(res.evidence))
      .catch(console.error)
      .finally(() => setLoadingEvidence(false))
  }, [claim.id])

  // When type changes, clear the input fields
  const handleTypeChange = (newType: EvidenceType) => {
    setEvidenceType(newType)
    setEvidenceUrl('')
    setSelectedDocId('')
    setAddError(null)
  }

  const handleAdd = async () => {
    setAddError(null)

    // Determine the URL to save
    let urlToSave = ''
    if (isUrlEvidenceType(evidenceType)) {
      urlToSave = evidenceUrl.trim()
      if (!urlToSave) {
        setAddError('Please enter a URL.')
        return
      }
      if (!urlToSave.startsWith('http')) {
        setAddError('Please enter a valid URL starting with https://')
        return
      }
    } else {
      // File reference — use the selected document's file_url
      if (!selectedDocId) {
        setAddError('Please select a document from your library.')
        return
      }
      const doc = allDocuments.find((d) => d.id === selectedDocId)
      if (!doc) {
        setAddError('Selected document not found.')
        return
      }
      urlToSave = doc.file_url
    }

    setAdding(true)
    try {
      const newEvidence = await addEvidence(claim.id, {
        evidence_type: evidenceType,
        evidence_url: urlToSave,
        description: description.trim() || undefined,
      })

      setEvidence((prev) => [...prev, newEvidence])

      // Reset the form
      setEvidenceUrl('')
      setSelectedDocId('')
      setDescription('')

      // Notify parent so the claim card updates its status badge.
      // Preserve the ORIGINAL candidate_confirmed value — adding evidence must never
      // set it to true. Only the explicit "Accurate" button (confirmClaim) may do that.
      const alreadyConfirmed = claim.claim_verifications?.[0]?.candidate_confirmed ?? false
      onStatusChange(claim.id, 'verified', alreadyConfirmed)

    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add evidence.')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (ev: Evidence) => {
    if (!confirm('Remove this evidence?')) return
    setRemovingId(ev.id)
    try {
      await removeEvidence(claim.id, ev.id)
      const remaining = evidence.filter((e) => e.id !== ev.id)
      setEvidence(remaining)

      // Recalculate status for the parent card
      const verification = claim.claim_verifications?.[0]
      const wasConfirmed = verification?.candidate_confirmed ?? false
      if (remaining.length === 0) {
        onStatusChange(claim.id, wasConfirmed ? 'user_confirmed' : 'ai_inferred', wasConfirmed)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove evidence.')
    } finally {
      setRemovingId(null)
    }
  }

  // Filter documents by relevant type for the file picker
  const relevantDocs = allDocuments.filter((doc) => {
    if (evidenceType === 'certificate') return doc.file_type === 'certificate'
    if (evidenceType === 'screenshot')  return doc.file_type === 'screenshot'
    return true // 'file' type shows all
  })

  const typeConfig = EVIDENCE_TYPE_OPTIONS.find((o) => o.value === evidenceType)!

  return (
    <div className="mt-3 pt-3 border-t space-y-4">

      {/* Existing evidence list */}
      {loadingEvidence && (
        <p className="text-xs text-gray-400">Loading evidence...</p>
      )}

      {!loadingEvidence && evidence.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Evidence ({evidence.length})
          </p>
          {evidence.map((ev) => (
            <div key={ev.id}
              className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-800 capitalize">
                  {ev.evidence_type}
                </p>
                <a
                  href={ev.evidence_url.startsWith('http') ? ev.evidence_url : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline truncate block"
                >
                  {formatEvidenceUrl(ev.evidence_url)}
                </a>
                {ev.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>
                )}
              </div>
              <button
                onClick={() => handleRemove(ev)}
                disabled={removingId === ev.id}
                className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0"
                title="Remove evidence"
              >
                {removingId === ev.id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add evidence form */}
      <div className="space-y-3 bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-600">Add evidence</p>

        {addError && (
          <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{addError}</p>
        )}

        {/* Evidence type */}
        <div className="space-y-1">
          <Label className="text-xs">Evidence type</Label>
          <Select value={evidenceType} onValueChange={(v) => handleTypeChange(v as EvidenceType)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVIDENCE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* URL input or document picker */}
        {isUrlEvidenceType(evidenceType) ? (
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input
              className="h-8 text-xs"
              placeholder={typeConfig.placeholder}
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">Select from your documents</Label>
            {relevantDocs.length === 0 ? (
              <p className="text-xs text-gray-400">
                No {evidenceType} files uploaded yet.{' '}
                <Link href="/candidate/documents" className="text-blue-600 underline">
                  Upload one
                </Link>
              </p>
            ) : (
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a document..." />
                </SelectTrigger>
                <SelectContent>
                  {relevantDocs.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id} className="text-xs">
                      {doc.file_url.split('/').pop()} ({doc.file_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">Note (optional)</Label>
          <Input
            className="h-8 text-xs"
            placeholder="e.g. This repo contains the FastAPI project I mentioned"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Button
          size="sm"
          onClick={handleAdd}
          disabled={adding}
          className="h-7 text-xs"
        >
          {adding ? 'Adding...' : '+ Add evidence'}
        </Button>
      </div>
    </div>
  )
}

// ── Claim Card ────────────────────────────────────────────────

function ClaimCard({
  claim,
  allDocuments,
  onDelete,
  onConfirm,
  onStatusChange,
  isDeleting,
  isConfirming,
}: {
  claim: Claim
  allDocuments: CandidateDocument[]
  onDelete: () => void
  onConfirm: () => void
  onStatusChange: (claimId: string, newStatus: string, confirmed: boolean) => void
  isDeleting: boolean
  isConfirming: boolean
}) {
  const [showEvidence, setShowEvidence] = useState(false)

  const typeConfig = CLAIM_TYPE_CONFIG[claim.claim_type] ?? CLAIM_TYPE_CONFIG.skill
  const verification = claim.claim_verifications?.[0]
  const verConfig = verification
    ? VERIFICATION_CONFIG[verification.status]
    : VERIFICATION_CONFIG.ai_inferred

  const isConfirmed = verification?.candidate_confirmed ?? false
  const isVerified  = verification?.status === 'verified'

  return (
    <div className={`bg-white border rounded-lg p-4 transition-all ${
      isVerified ? 'border-blue-200' : ''
    }`}>

      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${typeConfig.colour}`}>
          {typeConfig.emoji} {typeConfig.label}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${verConfig.colour}`}>
          {verConfig.label}
        </span>
        {verification?.confidence_score && (
          <span className="text-xs text-gray-400 ml-auto">
            {Math.round(verification.confidence_score)}% confidence
          </span>
        )}
      </div>

      {/* Claim text */}
      <p className="text-gray-900 text-sm mt-2 leading-relaxed">{claim.claim_text}</p>

      {/* AI reasoning */}
      {verification?.ai_reason && (
        <p className="text-xs text-gray-400 italic mt-1">{verification.ai_reason}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {!isConfirmed && (
          <Button
            size="sm" variant="outline"
            onClick={onConfirm}
            disabled={isConfirming || isDeleting}
            className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
          >
            {isConfirming ? '...' : '✓ Accurate'}
          </Button>
        )}
        {isConfirmed && !isVerified && (
          <span className="text-xs text-green-600">✅ Confirmed</span>
        )}
        {isVerified && (
          <span className="text-xs text-blue-600">🔵 Evidence-Supported</span>
        )}

        {/* Toggle evidence panel */}
        <Button
          size="sm" variant="ghost"
          onClick={() => setShowEvidence((v) => !v)}
          className="h-7 text-xs text-blue-600 hover:bg-blue-50"
        >
          {showEvidence ? 'Hide evidence ▲' : '+ Add evidence ▼'}
        </Button>

        <Button
          size="sm" variant="ghost"
          onClick={onDelete}
          disabled={isDeleting || isConfirming}
          className="h-7 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 ml-auto"
        >
          {isDeleting ? '...' : 'Not accurate'}
        </Button>
      </div>

      {/* Inline evidence panel */}
      {showEvidence && (
        <EvidencePanel
          claim={claim}
          allDocuments={allDocuments}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [allDocuments, setAllDocuments] = useState<CandidateDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // Load claims and documents in parallel on mount
  useEffect(() => {
    Promise.all([
      getClaims(),
      getDocuments(),
    ]).then(([claimsRes, docsRes]) => {
      setClaims(claimsRes.claims)
      setAllDocuments(docsRes.documents)
    }).catch(console.error)
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
    if (!confirm('Remove this claim?')) return
    setDeletingId(claim.id)
    try {
      await deleteClaim(claim.id)
      setClaims((prev) => prev.filter((c) => c.id !== claim.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove claim.')
    } finally { setDeletingId(null) }
  }

  // ── Confirm a claim ────────────────────────────────────────
  const handleConfirm = async (claim: Claim) => {
    setConfirmingId(claim.id)
    try {
      const result = await confirmClaim(claim.id)
      setClaims((prev) => prev.map((c) =>
        c.id !== claim.id ? c : { ...c, claim_verifications: [result.verification] }
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm claim.')
    } finally { setConfirmingId(null) }
  }

  // ── Update claim status in local state after evidence change ──
  const handleStatusChange = (
    claimId: string,
    newStatus: string,
    confirmed: boolean,
  ) => {
    setClaims((prev) => prev.map((c) => {
      if (c.id !== claimId) return c
      const existing = c.claim_verifications?.[0]
      return {
        ...c,
        claim_verifications: [{
          ...(existing ?? {}),
          status: newStatus,
          candidate_confirmed: confirmed,
        } as any],
      }
    }))
  }

  // ── Stats ──────────────────────────────────────────────────
  const confirmedCount = claims.filter(
    (c) => c.claim_verifications?.[0]?.candidate_confirmed
  ).length
  const verifiedCount = claims.filter(
    (c) => c.claim_verifications?.[0]?.status === 'verified'
  ).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">My Claims & Evidence</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Intro */}
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-blue-800 text-sm font-medium mb-1">How this works</p>
            <div className="text-blue-700 text-sm space-y-1">
              <p>1. <strong>Confirm</strong> claims that are accurate about you</p>
              <p>2. <strong>Add evidence</strong> to each claim — GitHub links, certificates, portfolio URLs</p>
              <p>3. Claims with evidence become <strong>Evidence-Supported</strong></p>
              <p>4. Recruiters see which of your claims are backed by real proof</p>
            </div>
          </CardContent>
        </Card>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {successMessage && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">✅ {successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          <Button onClick={handleExtract} disabled={extracting}>
            {extracting ? 'AI is reading your documents...' :
              claims.length > 0 ? '🔄 Re-extract claims' : '✨ Extract my claims'}
          </Button>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading...</p>}

        {/* Stats */}
        {!loading && claims.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{claims.length}</div>
              <div className="text-xs text-gray-500">Total claims</div>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{confirmedCount}</div>
              <div className="text-xs text-gray-500">Confirmed</div>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{verifiedCount}</div>
              <div className="text-xs text-gray-500">Evidence-Supported</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && claims.length === 0 && (
          <div className="text-center py-16 bg-white border border-dashed rounded-lg">
            <p className="text-gray-400">No claims yet — click Extract above</p>
          </div>
        )}

        {/* Claims list */}
        {!loading && claims.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900">
              {claims.length} claims
              <span className="ml-2 text-sm font-normal text-gray-400">
                — click &quot;+ Add evidence&quot; on any claim to attach proof
              </span>
            </h2>
            {claims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                allDocuments={allDocuments}
                onDelete={() => handleDelete(claim)}
                onConfirm={() => handleConfirm(claim)}
                onStatusChange={handleStatusChange}
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