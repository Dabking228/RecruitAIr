"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJob } from "@/lib/api/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function NewJobPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<string>("");
  const [employmentType, setEmploymentType] = useState<string>("");
  const [verificationThreshold, setVerificationThreshold] = useState(60);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (description.trim().length < 50) {
      setError(
        "Please enter a more detailed job description (at least 50 characters). The AI needs enough detail to extract requirements.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const job = await createJob({
        title: title.trim(),
        description: description.trim(),
        location: location.trim() || undefined,
        work_mode: (workMode as "onsite" | "hybrid" | "remote") || undefined,
        employment_type:
          (employmentType as
            | "internship"
            | "full-time"
            | "part-time"
            | "contract") || undefined,
        verification_threshold: verificationThreshold,
      });

      // Redirect to the job detail page
      // (Phase 7 will add the AI parser button there)
      router.push(`/recruiter/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/recruiter/jobs"
            className="text-blue-600 hover:underline text-sm"
          >
            ← Back to jobs
          </Link>
          <h1 className="text-xl font-bold mt-1">Post a New Job</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Basic details */}
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
              <CardDescription>
                Basic information about the position
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="title">Job title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Kuala Lumpur"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Work mode</Label>
                  <Select value={workMode} onValueChange={setWorkMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onsite">Onsite</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Employment type</Label>
                <Select
                  value={employmentType}
                  onValueChange={setEmploymentType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Job description — the key field */}
          <Card>
            <CardHeader>
              <CardTitle>Job Description *</CardTitle>
              <CardDescription>
                Paste the full job description here. The more detail you
                provide, the better the AI can extract requirements and evaluate
                candidates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  "Paste or write your full job description here...\n\nExample:\nWe are looking for a Senior Backend Engineer to join our team...\n\nResponsibilities:\n- Design and implement scalable REST APIs\n- Manage PostgreSQL databases\n....\n\nRequirements:\n- 3+ years of Python experience\n- Experience with FastAPI or Django\n...."
                }
                className="min-h-[280px] font-mono text-sm"
                required
              />
              <p className="text-xs text-gray-400 mt-2">
                {description.length} characters
                {description.length < 50 && description.length > 0 && (
                  <span className="text-orange-500 ml-2">
                    — add more detail for better AI extraction
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* AI settings */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence Threshold</CardTitle>
              <CardDescription>
                Minimum percentage of a candidate&apos;s claims that must be
                evidence-supported for them to be recommended. Default is 60%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={verificationThreshold}
                  onChange={(e) =>
                    setVerificationThreshold(Number(e.target.value))
                  }
                  className="w-24"
                />
                <span className="text-gray-500 text-sm">%</span>
                <p className="text-sm text-gray-400">
                  {verificationThreshold < 40 &&
                    "Low — will accept candidates with few verified claims"}
                  {verificationThreshold >= 40 &&
                    verificationThreshold < 70 &&
                    "Moderate — balanced evidence requirement"}
                  {verificationThreshold >= 70 &&
                    "High — only candidates with strong evidence are recommended"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating job..." : "Create job (save as draft)"}
            </Button>
            <Link href="/recruiter/jobs">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
          </div>

          <p className="text-sm text-gray-400">
            The job is saved as a draft. In the next step, AI will extract the
            requirements from your description for you to confirm.
          </p>
        </form>
      </main>
    </div>
  );
}
