-- Enable UUID generation function
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector storage and similarity search
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- TABLE: users
-- Extends Supabase Auth with role and name
-- id matches auth.users(id) exactly
-- ============================================================
CREATE TABLE public.users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL CHECK (role IN ('recruiter', 'candidate')),
    name        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: companies
-- Created by a recruiter. One recruiter, one company for MVP.
-- ============================================================
CREATE TABLE public.companies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    industry    TEXT,
    website     TEXT,
    created_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: jobs
-- A job position posted by a recruiter under a company.
-- ============================================================
CREATE TABLE public.jobs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    recruiter_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL,
    location                TEXT,
    work_mode               TEXT CHECK (work_mode IN ('onsite', 'hybrid', 'remote')),
    employment_type         TEXT CHECK (employment_type IN ('internship', 'full-time', 'part-time', 'contract')),
    verification_threshold  INTEGER DEFAULT 60 CHECK (verification_threshold BETWEEN 0 AND 100),
    status                  TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: job_requirements
-- AI-extracted requirements from the job description.
-- One row per requirement (skill, responsibility, etc.)
-- ============================================================
CREATE TABLE public.job_requirements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    requirement_type    TEXT NOT NULL CHECK (requirement_type IN (
                            'required_skill', 'preferred_skill',
                            'responsibility', 'certification'
                        )),
    name                TEXT NOT NULL,
    description         TEXT,
    importance          TEXT NOT NULL CHECK (importance IN ('must_have', 'nice_to_have')),
    weight              NUMERIC(5,2) DEFAULT 1.0,
    evidence_expected   BOOLEAN DEFAULT TRUE,
    embedding           vector(768),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: candidate_profiles
-- One profile per candidate user.
-- ============================================================
CREATE TABLE public.candidate_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    full_name       TEXT,
    summary         TEXT,
    education       TEXT,
    portfolio_url   TEXT,
    github_url      TEXT,
    linkedin_url    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: applications
-- The link between a candidate and a job they applied to.
-- ============================================================
CREATE TABLE public.applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status          TEXT DEFAULT 'submitted' CHECK (status IN (
                        'submitted', 'shortlisted', 'rejected', 'interview_invited'
                    )),
    submitted_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, candidate_id)
);

-- ============================================================
-- TABLE: documents
-- Files uploaded by a candidate for an application.
-- ============================================================
CREATE TABLE public.documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    application_id  UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    file_url        TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN (
                        'resume', 'certificate', 'screenshot',
                        'portfolio_image', 'project_document'
                    )),
    extracted_text  TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: claims
-- AI-extracted statements from a candidate's documents.
-- Each claim is a specific thing the candidate asserts.
-- ============================================================
CREATE TABLE public.claims (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    application_id      UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    claim_text          TEXT NOT NULL,
    claim_type          TEXT NOT NULL CHECK (claim_type IN (
                            'skill', 'project', 'certification',
                            'experience', 'leadership', 'achievement'
                        )),
    source_document_id  UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    embedding           vector(768),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: evidence
-- Files or links provided by a candidate to support a claim.
-- ============================================================
CREATE TABLE public.evidence (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claim_id        UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    evidence_type   TEXT NOT NULL CHECK (evidence_type IN (
                        'file', 'link', 'github', 'certificate', 'screenshot'
                    )),
    evidence_url    TEXT NOT NULL,
    description     TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: claim_verifications
-- The AI's assessment of whether a claim is supported by evidence.
-- ============================================================
CREATE TABLE public.claim_verifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id            UUID NOT NULL UNIQUE REFERENCES public.claims(id) ON DELETE CASCADE,
    status              TEXT NOT NULL CHECK (status IN (
                            'verified', 'user_confirmed',
                            'ai_inferred', 'needs_evidence'
                        )),
    confidence_score    NUMERIC(5,2) CHECK (confidence_score BETWEEN 0 AND 100),
    ai_reason           TEXT,
    candidate_confirmed BOOLEAN DEFAULT FALSE,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: match_scores
-- Final computed scores for a candidate's application.
-- Calculated after all claims are verified.
-- ============================================================
CREATE TABLE public.match_scores (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id              UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
    job_fit_score               NUMERIC(5,2) CHECK (job_fit_score BETWEEN 0 AND 100),
    evidence_confidence_score   NUMERIC(5,2) CHECK (evidence_confidence_score BETWEEN 0 AND 100),
    required_skill_match        NUMERIC(5,2) CHECK (required_skill_match BETWEEN 0 AND 100),
    preferred_skill_match       NUMERIC(5,2) CHECK (preferred_skill_match BETWEEN 0 AND 100),
    experience_relevance_score  NUMERIC(5,2) CHECK (experience_relevance_score BETWEEN 0 AND 100),
    recommendation              TEXT CHECK (recommendation IN (
                                    'strong_hire', 'hire', 'maybe', 'pass'
                                )),
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: interview_questions
-- AI-generated questions for a specific application.
-- ============================================================
CREATE TABLE public.interview_questions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    question        TEXT NOT NULL,
    question_type   TEXT NOT NULL CHECK (question_type IN (
                        'technical', 'behavioral',
                        'evidence_check', 'role_specific'
                    )),
    reason          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: email_drafts
-- AI-generated interview invitation email drafts.
-- ============================================================
CREATE TABLE public.email_drafts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs
-- Records all significant actions taken by users.
-- ============================================================
CREATE TABLE public.audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    target_type     TEXT,
    target_id       UUID,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS: Users can read and update their own row
-- ============================================================
CREATE POLICY "users_select_own"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- ============================================================
-- JOBS: Anyone logged in can read open jobs
-- Only the recruiter who created the job can modify it
-- ============================================================
CREATE POLICY "jobs_select_open"
    ON public.jobs FOR SELECT
    USING (status = 'open' OR recruiter_id = auth.uid());

CREATE POLICY "jobs_insert_own"
    ON public.jobs FOR INSERT
    WITH CHECK (recruiter_id = auth.uid());

CREATE POLICY "jobs_update_own"
    ON public.jobs FOR UPDATE
    USING (recruiter_id = auth.uid());

-- ============================================================
-- JOB REQUIREMENTS: Readable if the job is readable
-- ============================================================
CREATE POLICY "job_requirements_select"
    ON public.job_requirements FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs
            WHERE jobs.id = job_requirements.job_id
            AND (jobs.status = 'open' OR jobs.recruiter_id = auth.uid())
        )
    );

-- ============================================================
-- CANDIDATE PROFILES: Candidates see their own
-- Recruiters can see all (needed for reviewing applications)
-- ============================================================
CREATE POLICY "candidate_profiles_select"
    ON public.candidate_profiles FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'recruiter'
        )
    );

CREATE POLICY "candidate_profiles_insert_own"
    ON public.candidate_profiles FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "candidate_profiles_update_own"
    ON public.candidate_profiles FOR UPDATE
    USING (user_id = auth.uid());

-- ============================================================
-- APPLICATIONS: Candidate sees their own, recruiter sees all
-- for their jobs
-- ============================================================
CREATE POLICY "applications_select"
    ON public.applications FOR SELECT
    USING (
        candidate_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.jobs
            WHERE jobs.id = applications.job_id
            AND jobs.recruiter_id = auth.uid()
        )
    );

CREATE POLICY "applications_insert_own"
    ON public.applications FOR INSERT
    WITH CHECK (candidate_id = auth.uid());

-- ============================================================
-- DOCUMENTS: Candidates see their own, recruiters see all
-- ============================================================
CREATE POLICY "documents_select"
    ON public.documents FOR SELECT
    USING (
        candidate_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'recruiter'
        )
    );

CREATE POLICY "documents_insert_own"
    ON public.documents FOR INSERT
    WITH CHECK (candidate_id = auth.uid());

-- ============================================================
-- CLAIMS: Same as documents
-- ============================================================
CREATE POLICY "claims_select"
    ON public.claims FOR SELECT
    USING (
        candidate_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'recruiter'
        )
    );

-- ============================================================
-- COMPANIES: Recruiter sees their own
-- ============================================================
CREATE POLICY "companies_select_own"
    ON public.companies FOR SELECT
    USING (created_by = auth.uid());

CREATE POLICY "companies_insert_own"
    ON public.companies FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- ============================================================
-- FUNCTION: Creates a public.users row after signup
-- Reads the role from the user's metadata (set during signup)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, role, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'candidate'),
        COALESCE(NEW.raw_user_meta_data->>'name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER: Fires the function after every new signup
-- ============================================================
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();