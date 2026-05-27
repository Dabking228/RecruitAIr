"""
Recruiter agent tools — functions Gemini can call during a conversation.

Security pattern: recruiter_id is bound via closure inside make_recruiter_tools().
Gemini never receives or passes recruiter_id — it only sees job/application IDs.
"""
import logging
from app.db.supabase_client import supabase
from app.services import match_service, interview_service, email_service

logger = logging.getLogger(__name__)


def make_recruiter_tools(recruiter_id: str) -> list:
    """
    Returns a list of tool functions with recruiter_id locked in.
    Pass the returned list directly to get_agent_model(tools=...).
    """

    # ── Tool 1 ────────────────────────────────────────────────────
    def get_recruiter_jobs() -> dict:
        """
        Get all jobs posted by this recruiter.
        Returns a list of jobs with their id, title, status, and
        the number of applications received.
        Call this first when the recruiter asks about their jobs or
        wants to know which job to review.
        """
        try:
            result = (
                supabase.table("jobs")
                .select("id, title, status, location, employment_type")
                .eq("recruiter_id", recruiter_id)
                .order("created_at", desc=True)
                .execute()
            )
            jobs = result.data or []

            # Attach application count for each job
            for job in jobs:
                count_result = (
                    supabase.table("applications")
                    .select("id", count="exact")
                    .eq("job_id", job["id"])
                    .execute()
                )
                job["application_count"] = count_result.count or 0

            return {"jobs": jobs, "total": len(jobs)}
        except Exception as e:
            logger.error(f"get_recruiter_jobs failed: {e}")
            return {"error": str(e)}

    # ── Tool 2 ────────────────────────────────────────────────────
    def get_applications_for_job(job_id: str) -> dict:
        """
        Get all applications submitted for a specific job.
        Returns candidate names, application status, and match scores
        (if scoring has been run). Use this to see who applied for a role
        or to compare candidates side by side.

        Args:
            job_id: The UUID of the job to retrieve applications for.
        """
        try:
            # Verify recruiter owns this job
            job_result = (
                supabase.table("jobs")
                .select("id, title")
                .eq("id", job_id)
                .eq("recruiter_id", recruiter_id)
                .execute()
            )
            if not job_result.data:
                return {"error": "Job not found or you do not own this job."}

            job_title = job_result.data[0]["title"]

            # Fetch applications with candidate user info
            apps_result = (
                supabase.table("applications")
                .select("id, status, submitted_at, candidate_id")
                .eq("job_id", job_id)
                .order("submitted_at", desc=True)
                .execute()
            )
            applications = apps_result.data or []

            if not applications:
                return {"job_title": job_title, "applications": [], "total": 0}

            # Enrich each application with candidate name and match score
            enriched = []
            for app in applications:
                # Candidate name
                user_result = (
                    supabase.table("users")
                    .select("name, email")
                    .eq("id", app["candidate_id"])
                    .execute()
                )
                user = user_result.data[0] if user_result.data else {}
                candidate_name = user.get("name") or user.get("email", "Unknown")

                # Match score (if scored)
                score_result = (
                    supabase.table("match_scores")
                    .select("job_fit_score, recommendation")
                    .eq("application_id", app["id"])
                    .execute()
                )
                score = score_result.data[0] if score_result.data else None

                enriched.append({
                    "application_id": app["id"],
                    "candidate_name": candidate_name,
                    "status": app["status"],
                    "submitted_at": app["submitted_at"],
                    "job_fit_score": score["job_fit_score"] if score else None,
                    "recommendation": score["recommendation"] if score else "not_scored",
                })

            # Sort by job_fit_score descending (unscored go last)
            enriched.sort(
                key=lambda x: x["job_fit_score"] or 0,
                reverse=True,
            )

            return {
                "job_title": job_title,
                "applications": enriched,
                "total": len(enriched),
            }
        except Exception as e:
            logger.error(f"get_applications_for_job failed: {e}")
            return {"error": str(e)}

    # ── Tool 3 ────────────────────────────────────────────────────
    def get_application_details(application_id: str) -> dict:
        """
        Get full details for a single application: candidate name, job title,
        application status, and submission date.
        Use this before discussing a specific candidate.

        Args:
            application_id: The UUID of the application to look up.
        """
        try:
            result = (
                supabase.table("applications")
                .select("id, status, submitted_at, candidate_id, job_id, jobs(title, recruiter_id)")
                .eq("id", application_id)
                .execute()
            )
            if not result.data:
                return {"error": "Application not found."}

            app = result.data[0]
            job = app.get("jobs", {})

            if job.get("recruiter_id") != recruiter_id:
                return {"error": "You do not have access to this application."}

            user_result = (
                supabase.table("users")
                .select("name, email")
                .eq("id", app["candidate_id"])
                .execute()
            )
            user = user_result.data[0] if user_result.data else {}

            return {
                "application_id": app["id"],
                "candidate_name": user.get("name") or user.get("email", "Unknown"),
                "candidate_id": app["candidate_id"],
                "job_title": job.get("title"),
                "status": app["status"],
                "submitted_at": app["submitted_at"],
            }
        except Exception as e:
            logger.error(f"get_application_details failed: {e}")
            return {"error": str(e)}

    # ── Tool 4 ────────────────────────────────────────────────────
    def get_match_scores(application_id: str) -> dict:
        """
        Get the AI-generated match scores for a candidate's application.
        Returns five scores and a hiring recommendation.
        If the application has not been scored yet, triggers scoring automatically.

        Scores returned:
        - job_fit_score: overall fit (0-100)
        - evidence_confidence_score: how well claims are backed by evidence (0-100)
        - required_skill_match: must-have skills coverage (0-100)
        - preferred_skill_match: nice-to-have skills coverage (0-100)
        - experience_relevance_score: relevance of past experience (0-100)
        - recommendation: strong_hire | hire | maybe | pass

        Args:
            application_id: The UUID of the application to score.
        """
        try:
            score_result = (
                supabase.table("match_scores")
                .select("*")
                .eq("application_id", application_id)
                .execute()
            )

            if not score_result.data:
                # Auto-trigger scoring if not done yet
                logger.info(f"No score found for {application_id}, triggering scoring.")
                return match_service.run_match_scoring(
                    application_id=application_id,
                    user_id=recruiter_id,
                )

            return score_result.data[0]
        except Exception as e:
            logger.error(f"get_match_scores failed: {e}")
            return {"error": str(e)}

    # ── Tool 5 ────────────────────────────────────────────────────
    def get_candidate_claims(application_id: str) -> dict:
        """
        Get all professional claims made by a candidate, including
        their verification status and evidence count.
        Use this to understand what a candidate claims about themselves
        and which claims lack supporting evidence.

        Verification statuses:
        - verified: confirmed by uploaded evidence
        - user_confirmed: candidate confirmed but no file uploaded
        - ai_inferred: AI extracted it but not yet confirmed
        - needs_evidence: flagged as requiring proof

        Args:
            application_id: The UUID of the application to inspect.
        """
        try:
            # Get candidate_id from the application
            app_result = (
                supabase.table("applications")
                .select("candidate_id, jobs(recruiter_id)")
                .eq("id", application_id)
                .execute()
            )
            if not app_result.data:
                return {"error": "Application not found."}

            app = app_result.data[0]
            if app["jobs"]["recruiter_id"] != recruiter_id:
                return {"error": "You do not have access to this application."}

            candidate_id = app["candidate_id"]

            # Fetch claims
            claims_result = (
                supabase.table("claims")
                .select("id, claim_text, claim_type")
                .eq("candidate_id", candidate_id)
                .execute()
            )
            claims = claims_result.data or []

            if not claims:
                return {"claims": [], "total": 0, "note": "No claims found for this candidate."}

            # Enrich with verification and evidence count
            claim_ids = [c["id"] for c in claims]
            verif_result = (
                supabase.table("claim_verifications")
                .select("claim_id, status, confidence_score")
                .in_("claim_id", claim_ids)
                .execute()
            )
            verif_by_id = {v["claim_id"]: v for v in (verif_result.data or [])}

            enriched = []
            for claim in claims:
                verif = verif_by_id.get(claim["id"], {})
                ev_result = (
                    supabase.table("evidence")
                    .select("id", count="exact")
                    .eq("claim_id", claim["id"])
                    .execute()
                )
                enriched.append({
                    "claim_text": claim["claim_text"],
                    "claim_type": claim["claim_type"],
                    "verification_status": verif.get("status", "ai_inferred"),
                    "confidence_score": verif.get("confidence_score"),
                    "evidence_count": ev_result.count or 0,
                })

            verified_count = sum(
                1 for c in enriched
                if c["verification_status"] in ("verified", "user_confirmed")
            )

            return {
                "claims": enriched,
                "total": len(enriched),
                "verified_count": verified_count,
                "unverified_count": len(enriched) - verified_count,
            }
        except Exception as e:
            logger.error(f"get_candidate_claims failed: {e}")
            return {"error": str(e)}

    # ── Tool 6 ────────────────────────────────────────────────────
    def generate_and_save_interview_questions(application_id: str) -> dict:
        """
        Generate AI interview questions for a candidate and save them.
        Questions are tailored to the candidate's claims, evidence gaps,
        and job requirements. Replaces any previously saved questions.
        Use this when the recruiter wants to prepare for an interview.

        Args:
            application_id: The UUID of the application to generate questions for.
        """
        try:
            questions = interview_service.generate_questions(
                application_id=application_id,
                recruiter_id=recruiter_id,
            )
            saved = interview_service.save_questions(
                application_id=application_id,
                questions=questions,
                recruiter_id=recruiter_id,
            )
            # Return a preview (first 3) and total count to keep response concise
            preview = [
                {"question": q["question"], "type": q["question_type"]}
                for q in questions[:3]
            ]
            return {
                "total_generated": len(saved),
                "preview": preview,
                "message": f"Generated and saved {len(saved)} interview questions.",
            }
        except Exception as e:
            logger.error(f"generate_and_save_interview_questions failed: {e}")
            return {"error": str(e)}

    # ── Tool 7 ────────────────────────────────────────────────────
    def generate_and_save_email_draft(application_id: str) -> dict:
        """
        Generate an AI interview invitation email for a candidate and save it as a draft.
        The tone adapts to the hiring recommendation (warm for strong_hire, etc.).
        Includes placeholder tokens for interview date, time, and meeting link.
        Use this when the recruiter is ready to invite a candidate for an interview.

        Args:
            application_id: The UUID of the application to draft an email for.
        """
        try:
            draft = email_service.generate_email_draft(
                application_id=application_id,
                recruiter_id=recruiter_id,
            )
            saved = email_service.save_email_draft(
                application_id=application_id,
                subject=draft["subject"],
                body=draft["body"],
                recruiter_id=recruiter_id,
            )
            return {
                "subject": saved["subject"],
                "body_preview": saved["body"][:300] + "..." if len(saved["body"]) > 300 else saved["body"],
                "status": saved["status"],
                "message": "Email draft generated and saved. Review and approve it on the application page.",
            }
        except Exception as e:
            logger.error(f"generate_and_save_email_draft failed: {e}")
            return {"error": str(e)}

    # ── Tool 8 ────────────────────────────────────────────────────
    def get_email_draft(application_id: str) -> dict:
        """
        Retrieve the current saved email draft for a candidate application.
        Returns the subject, body, and approval status.
        Use this when the recruiter asks to review the current email draft.

        Args:
            application_id: The UUID of the application whose draft to retrieve.
        """
        try:
            draft = email_service.get_email_draft(application_id=application_id)
            if not draft:
                return {"error": "No email draft found. Generate one first."}
            return {
                "subject": draft["subject"],
                "body": draft["body"],
                "status": draft["status"],
            }
        except Exception as e:
            logger.error(f"get_email_draft failed: {e}")
            return {"error": str(e)}

    # Return all tools as a list
    return [
        get_recruiter_jobs,
        get_applications_for_job,
        get_application_details,
        get_match_scores,
        get_candidate_claims,
        generate_and_save_interview_questions,
        generate_and_save_email_draft,
        get_email_draft,
    ]