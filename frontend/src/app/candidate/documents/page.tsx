'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  getDocuments,
  saveDocumentRecord,
  deleteDocumentRecord,
  type CandidateDocument,
  type DocumentType,
} from '@/lib/api/documents'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

// ── Constants ─────────────────────────────────────────────────

const DOCUMENT_TYPES: { value: DocumentType; label: string; accept: string }[] = [
  { value: 'resume',           label: 'Resume / CV',          accept: '.pdf' },
  { value: 'certificate',      label: 'Certificate',          accept: '.pdf,.png,.jpg,.jpeg' },
  { value: 'screenshot',       label: 'Screenshot / Demo',    accept: '.png,.jpg,.jpeg' },
  { value: 'portfolio_image',  label: 'Portfolio Image',      accept: '.png,.jpg,.jpeg' },
  { value: 'project_document', label: 'Project Document',     accept: '.pdf' },
]

const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Main page ─────────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<CandidateDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // Upload form state
  const [selectedType, setSelectedType] = useState<DocumentType>('resume')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<
    'idle' | 'uploading' | 'saving' | 'done' | 'error'
  >('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load documents on mount
  useEffect(() => {
    getDocuments()
      .then((res) => setDocuments(res.documents))
      .catch(console.error)
      .finally(() => setLoadingDocs(false))
  }, [])

  // ── Upload handler ─────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file first.')
      return
    }

    // Client-side validation
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`)
      return
    }

    setUploadProgress('uploading')
    setUploadError(null)

    try {
      const supabase = createClient()

      // Get the current user's ID to build the storage path
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')

      // Build the storage path: userId/fileType/timestamp_filename
      const timestamp = Date.now()
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${user.id}/${selectedType}/${timestamp}_${safeName}`

      // Step 1: Upload the file directly to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        })

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`)
      }

      // Step 2: Tell the backend to save the document record
      setUploadProgress('saving')

      const newDoc = await saveDocumentRecord({
        file_url: filePath,       // the path in Storage — not a full URL
        file_type: selectedType,
      })

      // Step 3: Add to the local list without refetching
      setDocuments((prev) => [newDoc, ...prev])
      setUploadProgress('done')

      // Reset the form
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
      setUploadProgress('error')
    }
  }

  // ── Delete handler ─────────────────────────────────────────

  const handleDelete = async (doc: CandidateDocument) => {
    if (!confirm(`Delete "${getDocumentTypeLabel(doc.file_type)}"? This cannot be undone.`)) {
      return
    }

    setDeletingId(doc.id)

    try {
      const supabase = createClient()

      // Step 1: Delete the file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.file_url])

      if (storageError) {
        console.warn('Storage delete failed (continuing anyway):', storageError.message)
        // We continue even if storage delete fails — the DB record is more important
      }

      // Step 2: Delete the database record
      await deleteDocumentRecord(doc.id)

      // Step 3: Remove from local state
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))

    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Get a temporary download URL for a document ───────────

  const openDocument = async (doc: CandidateDocument) => {
    const supabase = createClient()
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_url, 3600)  // expires in 1 hour

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      alert('Could not generate a download link. Please try again.')
    }
  }

  // ── Render ─────────────────────────────────────────────────

  const currentTypeConfig = DOCUMENT_TYPES.find((t) => t.value === selectedType)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/candidate/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">My Documents</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8 space-y-8">

        {/* ── Upload Form ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Upload a Document</CardTitle>
            <CardDescription>
              Upload your resume, certificates, and any evidence files.
              The AI will extract claims from your resume and match them
              to evidence you provide here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            {uploadProgress === 'done' && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">
                  ✅ Document uploaded successfully!
                </AlertDescription>
              </Alert>
            )}

            {/* Document type selector */}
            <div className="space-y-1">
              <Label>Document type</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => {
                  setSelectedType(v as DocumentType)
                  // Reset file selection when type changes (accepted formats may differ)
                  setSelectedFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Accepted formats: {currentTypeConfig?.accept.split(',').join(', ')}
              </p>
            </div>

            {/* File picker */}
            <div className="space-y-1">
              <Label>File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={currentTypeConfig?.accept}
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null)
                  setUploadProgress('idle')
                  setUploadError(null)
                }}
                className="block w-full text-sm text-gray-700
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100 cursor-pointer"
              />
              {selectedFile && (
                <p className="text-xs text-gray-500">
                  Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
                </p>
              )}
              <p className="text-xs text-gray-400">Maximum file size: {MAX_FILE_SIZE_MB} MB</p>
            </div>

            {/* Upload button */}
            <Button
              onClick={handleUpload}
              disabled={
                !selectedFile ||
                uploadProgress === 'uploading' ||
                uploadProgress === 'saving'
              }
            >
              {uploadProgress === 'uploading' && 'Uploading to storage...'}
              {uploadProgress === 'saving'    && 'Saving record...'}
              {(uploadProgress === 'idle' || uploadProgress === 'done' || uploadProgress === 'error')
                && 'Upload document'}
            </Button>

          </CardContent>
        </Card>

        {/* ── Document Library ──────────────────────────────── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Uploaded Documents
            {documents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({documents.length})
              </span>
            )}
          </h2>

          {loadingDocs && (
            <p className="text-gray-400 text-sm">Loading documents...</p>
          )}

          {!loadingDocs && documents.length === 0 && (
            <div className="text-center py-12 bg-white border border-dashed rounded-lg">
              <p className="text-gray-400">No documents uploaded yet.</p>
              <p className="text-gray-400 text-sm mt-1">
                Start by uploading your resume above.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 bg-white border rounded-lg p-4"
              >
                {/* File icon */}
                <div className="text-2xl flex-shrink-0">
                  {doc.file_url.endsWith('.pdf') ? '📄' : '🖼️'}
                </div>

                {/* Document info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {getDocumentTypeLabel(doc.file_type)}
                    </Badge>
                    {doc.extracted_text && (
                      <Badge variant="outline" className="text-green-700 border-green-300">
                        ✓ Text extracted
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1 truncate">
                    {doc.file_url.split('/').pop()}
                  </p>
                  <p className="text-xs text-gray-400">
                    Uploaded {formatDate(doc.uploaded_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDocument(doc)}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingId === doc.id ? '...' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation hint */}
        {documents.some((d) => d.file_type === 'resume') && (
          <Card className="border-blue-100 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <p className="text-blue-800 text-sm font-medium">
                ✅ Resume uploaded — you&apos;re ready for the next step.
              </p>
              <p className="text-blue-700 text-sm mt-1">
                When you apply to a job, the AI will extract claims from your
                resume and documents. You can then review and add evidence for each claim.
              </p>
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  )
}