# RecruitAIr

**Evidence-Aware AI Recruitment Assistant** — AIC Hackathon 2026

RecruitAIr goes beyond a simple job-fit score. It extracts verifiable claims from candidate documents, evaluates how well those claims are backed by evidence, and presents recruiters with a transparent, explainable assessment — not just a number.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [System Requirements](#system-requirements)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [1 — Supabase Setup](#1--supabase-setup)
- [2 — Backend Setup](#2--backend-setup)
- [3 — Frontend Setup](#3--frontend-setup)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Schema](#database-schema)
- [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [AI Workflows](#ai-workflows)
- [Agent System](#agent-system)
- [Deployment](#deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                      │
│              Next.js 16 + React 19 + Tailwind CSS            │
│                   Vercel (Production)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / Bearer JWT
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend                           │
│              Python 3.11 · Google Cloud Run                  │
│                                                              │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────────────┐ │
│  │   Routers   │  │  Services  │  │      AI Services      │ │
│  │  (9 groups) │  │ (13 files) │  │  Gemini 2.5 Flash     │ │
│  └─────────────┘  └────────────┘  │  · Job Parser         │ │
│                                   │  · Claim Extractor    │ │
│  ┌──────────────────────────────┐ │  · Candidate Matcher  │ │
│  │         Agent System         │ │  · Question Generator │ │
│  │  Function-calling loop       │ │  · Email Drafter      │ │
│  │  Recruiter & Candidate tools │ │  · Report Generator   │ │
│  └──────────────────────────────┘ └───────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ Service Role Key (bypasses RLS)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        Supabase                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ PostgreSQL   │  │   Storage    │  │    Auth (JWT)      │ │
│  │  + pgvector  │  │  (documents) │  │  ES256 / JWKS      │ │
│  │  16 tables   │  │              │  │                    │ │
│  │  RLS enabled │  │              │  │                    │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## System Requirements

| Component | Minimum Version | Notes |
|-----------|----------------|-------|
| Node.js | 18.17+ | Required for Next.js 16 |
| npm | 9+ | Comes with Node.js |
| Python | 3.11+ | Backend runtime |
| pip | 23+ | Python package manager |
| Git | 2.x | Version control |
| Docker | 24+ | Required for Cloud Run deployment only |

> **Windows users:** Python and Node.js must be added to PATH during installation.

---

## Tech Stack

### Frontend
| Library | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.2.6 | React framework (App Router) |
| React | 19.2.4 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first styling |
| shadcn/ui | 4.8.0 | Accessible component library |
| Radix UI | 1.4.3 | Headless primitives |
| Lucide React | 1.16.0 | Icon set |
| @supabase/ssr | 0.10.3 | Server-side auth helpers |
| @supabase/supabase-js | 2.106.1 | Supabase client |

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| FastAPI | ≥0.115.0 | Web framework |
| Uvicorn | ≥0.30.0 | ASGI server |
| Pydantic | ≥2.9.0 | Data validation & schemas |
| pydantic-settings | ≥2.4.0 | Environment config |
| supabase | ≥2.9.0 | Database & auth client |
| PyJWT | ≥2.9.0 | JWT verification |
| cryptography | ≥43.0.0 | ES256 key handling |
| python-multipart | ≥0.0.12 | File upload parsing |
| pypdf | ≥5.0.0 | PDF text extraction |
| httpx | ≥0.27.0 | Async HTTP client |
| google-generativeai | ≥0.8.0 | Gemini AI SDK |
| python-dotenv | ≥1.0.0 | .env file loading |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL DB + Auth + Storage |
| Google Gemini 2.5 Flash | All AI functions |
| Vercel | Frontend hosting |
| Google Cloud Run | Backend hosting |

---

## Project Structure

```
RecruitAIr/
├── README.md                         ← You are here
│
├── frontend/                         ← Next.js 16 web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/               ← Login & Register pages
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── auth/callback/        ← OAuth callback handler
│   │   │   ├── candidate/            ← Candidate-role pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── jobs/
│   │   │   │   ├── jobs/[jobId]/
│   │   │   │   ├── applications/
│   │   │   │   ├── documents/
│   │   │   │   ├── claims/
│   │   │   │   ├── profile/
│   │   │   │   └── layout.tsx
│   │   │   ├── recruiter/            ← Recruiter-role pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── jobs/
│   │   │   │   ├── jobs/new/
│   │   │   │   ├── jobs/[jobId]/
│   │   │   │   ├── jobs/[jobId]/candidates/
│   │   │   │   ├── applications/
│   │   │   │   ├── applications/[applicationId]/
│   │   │   │   ├── applications/[applicationId]/report/
│   │   │   │   ├── company/
│   │   │   │   ├── audit-logs/
│   │   │   │   └── layout.tsx
│   │   │   ├── layout.tsx            ← Root layout
│   │   │   └── page.tsx              ← Role-based redirect
│   │   ├── components/
│   │   │   ├── agent/
│   │   │   │   ├── AgentDrawer.tsx   ← Sliding chat panel
│   │   │   │   └── AgentMessage.tsx  ← Chat bubble
│   │   │   ├── ui/                   ← shadcn components
│   │   │   └── LogoutButton.tsx
│   │   ├── lib/
│   │   │   ├── api/                  ← Typed API client functions
│   │   │   │   ├── client.ts         ← Base fetch with auth
│   │   │   │   ├── agent.ts
│   │   │   │   ├── applications.ts
│   │   │   │   ├── candidates.ts
│   │   │   │   ├── claims.ts
│   │   │   │   ├── companies.ts
│   │   │   │   ├── documents.ts
│   │   │   │   └── jobs.ts
│   │   │   └── supabase/
│   │   │       ├── client.ts         ← Browser Supabase client
│   │   │       └── server.ts         ← SSR Supabase client
│   │   └── types/index.ts            ← 35+ TypeScript interfaces
│   ├── .env.local.example
│   ├── components.json               ← shadcn config
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                          ← FastAPI Python application
│   ├── app/
│   │   ├── main.py                   ← App entry point, CORS, routers
│   │   ├── config.py                 ← Settings from environment
│   │   ├── auth/
│   │   │   └── dependencies.py       ← JWT verify, role guards
│   │   ├── db/
│   │   │   ├── supabase_client.py    ← Service role client
│   │   │   └── queries.py            ← Reusable query helpers
│   │   ├── routers/                  ← HTTP endpoint definitions
│   │   │   ├── agent.py
│   │   │   ├── ai.py
│   │   │   ├── applications.py
│   │   │   ├── audit.py
│   │   │   ├── candidates.py
│   │   │   ├── claims.py
│   │   │   ├── companies.py
│   │   │   ├── documents.py
│   │   │   └── jobs.py
│   │   ├── services/                 ← Business logic layer
│   │   │   ├── agent_session_service.py
│   │   │   ├── application_service.py
│   │   │   ├── audit_service.py
│   │   │   ├── candidate_service.py
│   │   │   ├── claim_service.py
│   │   │   ├── company_service.py
│   │   │   ├── document_service.py
│   │   │   ├── email_service.py
│   │   │   ├── evidence_service.py
│   │   │   ├── interview_service.py
│   │   │   ├── job_service.py
│   │   │   ├── match_service.py
│   │   │   └── report_service.py
│   │   ├── schemas/                  ← Pydantic request/response models
│   │   │   ├── application.py
│   │   │   ├── candidate.py
│   │   │   ├── claim.py
│   │   │   ├── company.py
│   │   │   └── job.py
│   │   ├── ai/                       ← Gemini AI service clients
│   │   │   ├── gemini_client.py
│   │   │   ├── agent_gemini_client.py
│   │   │   ├── job_parser.py
│   │   │   ├── claim_extractor.py
│   │   │   ├── candidate_matcher.py
│   │   │   ├── interview_question_generator.py
│   │   │   ├── email_draft_generator.py
│   │   │   └── report_generator.py
│   │   └── agent/                    ← Function-calling agent system
│   │       ├── agent_loop.py
│   │       └── tools/
│   │           ├── recruiter_tools.py
│   │           └── candidate_tools.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .dockerignore
│   └── .env.example
│
├── database/
│   └── schema.sql                    ← Full PostgreSQL schema (run in Supabase)
│
└── docs/
    ├── requirements.md
    ├── api-design.md
    └── ai-workflows.md
```

---

## Prerequisites

Before starting, obtain accounts and API keys for:

1. **Supabase** — [supabase.com](https://supabase.com) (free tier)
   - Create a new project
   - Note your **Project URL**, **Anon Key**, and **Service Role Key**

2. **Google AI Studio** — [aistudio.google.com](https://aistudio.google.com) (free tier)
   - Generate a **Gemini API Key**

3. **Vercel** — [vercel.com](https://vercel.com) (free tier, for deployment only)

4. **Google Cloud** — [console.cloud.google.com](https://console.cloud.google.com) (for deployment only)

---

## 1 — Supabase Setup

### 1.1 Enable Extensions

In your Supabase project, go to **Database → Extensions** and enable:

- `uuid-ossp` — UUID generation
- `vector` — Vector similarity search (used for embeddings)

### 1.2 Run the Schema

Go to **SQL Editor** in your Supabase dashboard and run the entire contents of [`database/schema.sql`](database/schema.sql).

This creates all 16 tables, Row Level Security policies, and the `handle_new_user` trigger that automatically creates a `public.users` record when someone signs up.

### 1.3 Configure Auth

In **Authentication → Settings**:

- **Site URL:** `http://localhost:3000` (development)
- **Redirect URLs:** Add `http://localhost:3000/auth/callback`

In **Authentication → Providers**, enable **Email** provider (enabled by default).

### 1.4 Configure Storage

In **Storage**, create a bucket named `documents`:
- Set it to **private** (not public)
- This stores candidate uploaded files (resumes, certificates, etc.)

---

## 2 — Backend Setup

### 2.1 Create virtual environment

```bash
cd backend
python -m venv venv
```

Activate it:
- **Windows:** `venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

### 2.2 Install dependencies

```bash
pip install -r requirements.txt
```

### 2.3 Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
GEMINI_API_KEY=your-gemini-api-key-here

APP_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
```

> **Where to find these:**
> - `SUPABASE_URL` — Supabase Dashboard → Settings → API → Project URL
> - `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Settings → API → `service_role` key (keep this secret)
> - `GEMINI_API_KEY` — Google AI Studio → Get API key

### 2.4 Run the backend

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to see the interactive API documentation (Swagger UI).

---

## 3 — Frontend Setup

### 3.1 Install dependencies

```bash
cd frontend
npm install
```

### 3.2 Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Where to find these:**
> - `NEXT_PUBLIC_SUPABASE_URL` — Same Project URL as backend
> - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Dashboard → Settings → API → `anon` / `public` key (safe to expose in browser)
> - `NEXT_PUBLIC_API_URL` — URL where your backend is running

### 3.3 Run the frontend

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — bypasses RLS, **never expose to browser** |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for all AI features |
| `APP_ENV` | Yes | `development` or `production` — controls Swagger docs visibility |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |

> **Note on JWT:** No `SUPABASE_JWT_SECRET` is needed. New Supabase projects use ES256 (asymmetric signing). The backend automatically fetches Supabase's public key from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` and uses it to verify tokens.

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key — safe for browser, enforces RLS |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |

---

## Database Schema

The full schema is in [`database/schema.sql`](database/schema.sql). Below is a summary of all 16 tables.

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | Extends Supabase auth; stores `role` (recruiter \| candidate) |
| `companies` | Company profiles created by recruiters |
| `jobs` | Job postings with status (draft \| open \| closed) |
| `job_requirements` | AI-extracted requirements from job descriptions |
| `candidate_profiles` | One profile per candidate user |
| `applications` | Links candidates to jobs |
| `documents` | Candidate-uploaded files (resume, certificate, etc.) |
| `claims` | AI-extracted verifiable statements from documents |
| `evidence` | Supporting proof linked to each claim |
| `claim_verifications` | AI verification status per claim |
| `match_scores` | Final AI scoring per application |
| `interview_questions` | AI-generated interview questions per application |
| `email_drafts` | AI-drafted interview invite emails |
| `audit_logs` | Complete action audit trail |
| `agent_sessions` | AI chat session metadata |
| `agent_messages` | Individual chat messages |

### Row Level Security (RLS)

Every table has RLS enabled. Key policies:

- **Candidates** see only their own profiles, applications, documents, and claims
- **Recruiters** see all applications and documents for jobs they own
- **Users** can only read/write their own `users` row
- The **backend** uses the service role key, which bypasses RLS — authorization is enforced programmatically in `auth/dependencies.py`

### Key Database Trigger

```sql
-- Automatically creates a public.users row after Supabase auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

The trigger reads `name` and `role` from `user_metadata` set during registration.

---

## Running Locally

Run both servers simultaneously in two terminal windows:

**Terminal 1 — Backend:**
```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health Check | http://localhost:8000/health |

---

## API Reference

All endpoints require a `Authorization: Bearer <supabase-jwt>` header unless noted.

### Jobs

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/jobs/` | Recruiter | List recruiter's jobs |
| `POST` | `/api/jobs/` | Recruiter | Create job (draft status) |
| `GET` | `/api/jobs/open` | Candidate | List open jobs |
| `GET` | `/api/jobs/{job_id}/public` | Any | Public job detail |
| `PUT` | `/api/jobs/{job_id}` | Recruiter | Update job |
| `PUT` | `/api/jobs/{job_id}/status` | Recruiter | Change job status |
| `POST` | `/api/jobs/{job_id}/parse` | Recruiter | AI-parse job description |
| `PUT` | `/api/jobs/{job_id}/requirements` | Recruiter | Save parsed requirements |
| `POST` | `/api/jobs/{job_id}/apply` | Candidate | Submit application |

### Applications

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/applications/my` | Candidate | My applications |
| `GET` | `/api/applications/{id}/detail` | Recruiter | Full application view |
| `GET` | `/api/applications/{id}/score` | Recruiter | Get match score |
| `POST` | `/api/applications/{id}/score` | Recruiter | Trigger AI scoring |
| `PUT` | `/api/applications/{id}/status` | Recruiter | Update status |
| `POST` | `/api/applications/{id}/questions/generate` | Recruiter | Generate interview questions |
| `POST` | `/api/applications/{id}/questions` | Recruiter | Save questions |
| `POST` | `/api/applications/{id}/email-draft` | Recruiter | Generate email draft |

### Agent Chat

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/agent/session` | Any | Get or create active session |
| `GET` | `/api/agent/sessions` | Any | List past sessions |
| `GET` | `/api/agent/session/{id}` | Any | Load specific session |
| `POST` | `/api/agent/session/new` | Any | Archive current & start new |
| `POST` | `/api/agent/recruiter/chat` | Recruiter | Send message to recruiter agent |
| `POST` | `/api/agent/candidate/chat` | Candidate | Send message to candidate agent |

### Other Routers

| Prefix | Description |
|--------|-------------|
| `/api/candidate` | Candidate profile CRUD |
| `/api/documents` | File upload & extraction |
| `/api/claims` | Claim management & verification |
| `/api/companies` | Company CRUD |
| `/api/audit-logs` | Audit trail (recruiters only) |

---

## AI Workflows

All AI features use **Gemini 2.5 Flash** with temperature `0.1` (deterministic output) and JSON-forced responses.

### 1. Job Parsing

**Trigger:** Recruiter clicks "Parse with AI" after entering job description.

**Input:** Raw job description text

**Output:** Structured list of 5–15 requirements, each with:
- `requirement_type`: `required_skill | preferred_skill | responsibility | certification`
- `name`, `description`
- `importance`: `must_have | nice_to_have`
- `weight`: `0.5 – 3.0` (used in scoring)
- `evidence_expected`: `bool`

### 2. Claim Extraction

**Trigger:** Candidate uploads documents; recruiter or candidate triggers extraction.

**Input:** Candidate profile summary + extracted text from uploaded documents

**Output:** 5–20 verifiable first-person claims:
- `claim_text`: e.g. "I built a real-time dashboard using React and WebSockets"
- `claim_type`: `skill | project | certification | experience | leadership | achievement`
- `confidence`: `0.5 – 1.0` (how explicit the claim is in the source)

> **Rule:** Only extracts claims explicitly stated by the candidate — no invented traits.

### 3. Candidate Matching & Scoring

**Trigger:** Application submission (auto) or recruiter-triggered rescore.

**Input:** Job requirements + candidate claims + evidence counts per claim

**Output:** Five numeric scores (0–100) + recommendation:

| Score | Description |
|-------|-------------|
| `job_fit_score` | Overall candidate-to-job match |
| `evidence_confidence_score` | How well claims are backed by evidence |
| `required_skill_match` | % of must-have requirements addressed |
| `preferred_skill_match` | % of nice-to-have requirements addressed |
| `experience_relevance_score` | Role-specific experience fit |
| `recommendation` | `strong_hire | hire | maybe | pass` |

### 4. Interview Question Generation

**Trigger:** Recruiter clicks "Generate Questions" on an application.

**Output:** Targeted questions per application with type: `technical | behavioral | evidence_check | role_specific`

### 5. Email Draft Generation

**Trigger:** Recruiter clicks "Draft Email" for an interview invite.

**Output:** Subject line + body draft, saved with status `draft`. Recruiter reviews and approves before sending.

---

## Agent System

The AI chat panel (accessible via the slide-out drawer) uses a **function-calling agent loop** backed by Gemini.

### How It Works

1. User sends a message (with optional page context)
2. Message history is loaded from the database
3. Gemini decides whether to call a tool or respond directly
4. If a tool is called → execute → send result back to Gemini → repeat (max 10 iterations)
5. Final text response is returned and saved to the database

### Recruiter Agent Tools

| Tool | Description |
|------|-------------|
| `get_recruiter_jobs()` | List all jobs with application counts |
| `get_applications_for_job(job_id)` | Ranked candidates with scores |
| `get_application_details(application_id)` | Full candidate view |
| `shortlist_candidate(application_id)` | Update status to shortlisted |
| `reject_candidate(application_id)` | Update status to rejected |
| `generate_interview_questions(application_id)` | AI-generated questions |
| `draft_interview_email(application_id)` | AI-drafted email |

### Candidate Agent Tools

| Tool | Description |
|------|-------------|
| `get_my_profile()` | Current profile |
| `update_my_profile(...)` | Edit profile fields |
| `get_my_applications()` | All applications with statuses |
| `get_application_details(application_id)` | Application detail |
| `upload_document(...)` | Upload a document |
| `extract_claims(application_id)` | Trigger claim extraction |

> **Security:** `recruiter_id` / `candidate_id` are injected via closure — not passed by the AI. This prevents prompt injection from escalating privileges.

---

## Deployment

### Backend — Google Cloud Run

**1. Build and push Docker image:**

```bash
cd backend
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/recruitair-api
```

**2. Deploy to Cloud Run:**

```bash
gcloud run deploy recruitair-api \
  --image gcr.io/YOUR_PROJECT_ID/recruitair-api \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,GEMINI_API_KEY=...,APP_ENV=production,ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
```

**3. Note the Cloud Run service URL** — you will need it for the frontend's `NEXT_PUBLIC_API_URL`.

### Frontend — Vercel

**1. Push your code to GitHub.**

**2. Import the repository in Vercel:**
- Set the **Root Directory** to `frontend`
- Framework: **Next.js** (auto-detected)

**3. Add environment variables in Vercel project settings:**

```
NEXT_PUBLIC_SUPABASE_URL        = https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = your-anon-key
NEXT_PUBLIC_API_URL             = https://your-cloud-run-url.run.app
```

**4. Update Supabase Auth settings:**
- Site URL: `https://your-vercel-domain.vercel.app`
- Redirect URLs: Add `https://your-vercel-domain.vercel.app/auth/callback`

**5. Update backend `ALLOWED_ORIGINS`** to include your Vercel domain.

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| ES256 JWT (no shared secret) | New Supabase projects default to asymmetric signing; backend fetches the public key via JWKS |
| Service role key on backend only | Bypasses RLS for admin operations; never sent to browser |
| Anon key on frontend only | Enforces RLS; safe to expose |
| Gemini 2.5 Flash | Fast, free-tier friendly, JSON output mode |
| BackgroundTasks (no Celery) | MVP simplicity — scoring runs async without extra infrastructure |
| Human-in-the-loop AI | AI extracts/suggests → human reviews → human confirms |
| Tool closures (agent security) | Prevents prompt injection from escalating user identity |
| Vector columns (768-dim) | Prepared for similarity search — not yet active in MVP |
