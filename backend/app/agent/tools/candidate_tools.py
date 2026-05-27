"""
Candidate agent tools — functions Gemini can call during a conversation.

Security pattern: candidate_id is bound via closure inside make_candidate_tools().
Gemini never receives or passes candidate_id directly.
"""
import logging
from app.db.supabase_client import supabase
from app.services import candidate_service, claim_service
from app.ai.claim_extractor import extract_claims_from_profile
from app.ai.candidate_matcher import score_candidate_against_job

logger = logging.getLogger(__name__)

# Evidence type suggestions per claim type.
# Used by get_evidence_suggestions — no AI call needed, just a lookup.
_EVIDENCE_GUIDE = {
    "skill": [
        "GitHub repository or code samples demonstrating the skill",
        "Portfolio project link where the skill was used",
        "Certificate or online course completion (e.g. Coursera, Udemy)",
    ],
    "project": [
        "GitHub repository URL for the project",
        "Live demo or deployed app link",
        "Project report or documentation PDF",
        "Screenshots of the working product",
    ],
    "certification": [
        "Certificate image or PDF (upload as a file)",
        "Credential verification URL (e.g. Credly badge link)",
        "LinkedIn certification section link",
    ],
    "experience": [
        "Employment letter or offer letter PDF",
        "LinkedIn profile URL showing the role",
        "Reference contact (name and email of manager)",
    ],
    "leadership": [
        "Reference from a team member or direct report",
        "Project outcome with measurable results (e.g. 'led 5-person team, delivered 2 weeks early')",
        "LinkedIn recommendation from someone you managed or led",
    ],
    "achievement": [
        "Award certificate or trophy image",
        "Metrics or numbers (e.g. 'increased sales by 30%')",
        "News article, announcement, or press release",
        "Screenshot of recognition (email, LinkedIn post, etc.)",
    ],
}


def make_candidate_tools(candidate_id: str) -> list:
    """
    Returns a list of tool functions with candidate_id locked in.
    Pass the returned list directly to get_agent_model(tools=...).
    """

    # ── Tool 1 ────────────────────────────────────────────────────
    def get_my_profile() -> dict:
        """
        Get the candidate's current profile information.
        Returns what is filled in and what is still empty.
        Call this to understand the candidate's profile completeness
        before extracting claims or suggesting improvements.
        """
        try:
            profile = candidate_service.get_candidate_profile(candidate_id)

            if not profile:
                return {
                    "has_profile": False,
                    "message": "No profile found. The candidate has not set up their profile yet.",
                }

            filled_fields = []
            missing_fields = []

            for field in ["full_name", "summary", "education", "portfolio_url", "github_url", "linkedin_url"]:
                if profile.get(field):
                    filled_fields.append(field)
                else:
                    missing_fields.append(field)

            return {
                "has_profile": True,
                "full_name": profile.get("full_name"),
                "has_summary": bool(profile.get("summary")),
                "has_education": bool(profile.get("education")),
                "github_url": profile.get("github_url"),
                "portfolio_url": profile.get("portfolio_url"),
                "linkedin_url": profile.get("linkedin_url"),
                "filled_fields": filled_fields,
                "missing_fields": missing_fields,
                "completeness_note": (
                    "Profile is well set up." if len(missing_fields) <= 1
                    else f"Missing {len(missing_fields)} fields: {', '.join(missing_fields)}."
                ),
            }
        except Exception as e:
            logger.error(f"get_my_profile failed: {e}")
            return {"error": str(e)}

    # ── Tool 2 ────────────────────────────────────────────────────
    def get_my_claims() -> dict:
        """
        Get all the candidate's current professional claims with their
        verification status and how much evidence is attached to each.
        Use this to show the candidate what claims they have, which ones
        are confirmed, and which ones still need evidence.

        Verification statuses:
        - verified: AI confirmed with strong evidence
        - user_confirmed: candidate confirmed it is true
        - ai_inferred: extracted by AI, awaiting candidate confirmation
        - needs_evidence: flagged as requiring proof
        """
        try:
            claims = claim_service.get_candidate_claims(candidate_id)

            if not claims:
                return {
                    "claims": [],
                    "total": 0,
                    "message": "No claims found. Extract claims from your documents first.",
                }

            summary = []
            for claim in claims:
                verifications = claim.get("claim_verifications", [])
                verif = verifications[0] if verifications else {}

                # Count evidence for this claim
                ev_result = (
                    supabase.table("evidence")
                    .select("id", count="exact")
                    .eq("claim_id", claim["id"])
                    .execute()
                )

                summary.append({
                    "claim_id": claim["id"],
                    "claim_text": claim["claim_text"],
                    "claim_type": claim["claim_type"],
                    "verification_status": verif.get("status", "ai_inferred"),
                    "candidate_confirmed": verif.get("candidate_confirmed", False),
                    "evidence_count": ev_result.count or 0,
                })

            needs_action = [
                c for c in summary
                if c["verification_status"] in ("ai_inferred", "needs_evidence")
                and c["evidence_count"] == 0
            ]

            return {
                "claims": summary,
                "total": len(summary),
                "needs_confirmation": len([c for c in summary if not c["candidate_confirmed"]]),
                "needs_evidence": len(needs_action),
                "action_note": (
                    f"{len(needs_action)} claim(s) need evidence to strengthen your profile."
                    if needs_action else "All claims have evidence or are confirmed."
                ),
            }
        except Exception as e:
            logger.error(f"get_my_claims failed: {e}")
            return {"error": str(e)}

    # ── Tool 3 ────────────────────────────────────────────────────
    def extract_claims_from_documents() -> dict:
        """
        Read all uploaded documents and the candidate profile, then use AI
        to automatically extract professional claims.
        Saves the extracted claims to the database — they will appear on
        the My Claims page for the candidate to confirm.
        Call this after the candidate has uploaded their resume or documents.
        If no documents have been uploaded yet, returns an instruction to upload first.
        """
        try:
            # Step 1: fetch profile
            profile = candidate_service.get_candidate_profile(candidate_id)

            # Step 2: fetch all documents with extracted text
            documents = candidate_service.get_candidate_documents(candidate_id)

            if not documents:
                return {
                    "success": False,
                    "message": (
                        "No documents found. Please upload your resume on the Documents page first, "
                        "then come back to extract claims."
                    ),
                }

            docs_with_text = [d for d in documents if d.get("extracted_text")]
            if not docs_with_text and not (profile and (profile.get("summary") or profile.get("education"))):
                return {
                    "success": False,
                    "message": (
                        "Your documents were uploaded but no text was extracted from them yet. "
                        "This can happen if the file is an image or scanned PDF. "
                        "Try uploading a text-based PDF resume."
                    ),
                }

            # Step 3: call the AI extractor
            logger.info(
                f"Extracting claims for candidate {candidate_id}: "
                f"{len(docs_with_text)} docs with text"
            )
            extracted = extract_claims_from_profile(
                profile=profile,
                documents=docs_with_text,
            )

            # Step 4: build source document map (file_type → doc_id, best-effort)
            source_document_map = {
                doc["file_type"]: doc["id"] for doc in documents
            }

            # Step 5: save extracted claims (clears previous and inserts fresh)
            saved = claim_service.save_extracted_claims(
                candidate_id=candidate_id,
                claims=extracted,
                source_document_map=source_document_map,
            )

            # Return a preview of the first 4 claims
            preview = [
                {
                    "claim_text": c["claim_text"],
                    "claim_type": c["claim_type"],
                }
                for c in extracted[:4]
            ]

            return {
                "success": True,
                "total_extracted": len(extracted),
                "preview": preview,
                "message": (
                    f"Extracted {len(extracted)} claims from your documents. "
                    f"Head to My Claims to confirm or remove any of them."
                ),
                "next_action": "Go to My Claims page to review and confirm your claims.",
            }
        except ValueError as e:
            # claim_extractor raises ValueError for no-content scenarios
            return {"success": False, "message": str(e)}
        except Exception as e:
            logger.error(f"extract_claims_from_documents failed: {e}")
            return {"error": str(e)}

    # ── Tool 4 ────────────────────────────────────────────────────
    def preview_job_match(job_id: str) -> dict:
        """
        Run a soft AI match score between the candidate's current profile
        and a specific job — without submitting an application or saving any scores.
        Use this when the candidate wants to know how strong their application
        would be before deciding to apply, or to understand what to improve.

        Returns match scores, which requirements are met or missing, and advice.

        Args:
            job_id: The UUID of the job to preview the match for.
        """
        try:
            # Step 1: fetch the job and its requirements
            job_result = (
                supabase.table("jobs")
                .select("id, title, description, status, job_requirements(*)")
                .eq("id", job_id)
                .execute()
            )
            if not job_result.data:
                return {"error": "Job not found."}

            job = job_result.data[0]
            if job["status"] != "open":
                return {"error": "This job is no longer accepting applications."}

            requirements = job.get("job_requirements", [])
            if not requirements:
                return {
                    "error": "This job has no structured requirements yet. "
                             "The recruiter hasn't parsed the job description."
                }

            # Step 2: get candidate claims with evidence
            claims = claim_service.get_candidate_claims(candidate_id)
            if not claims:
                return {
                    "match_possible": False,
                    "message": (
                        "You have no claims in your profile yet. "
                        "Upload your resume and extract claims first so the AI can assess your fit."
                    ),
                }

            # Format claims for the scorer (same shape match_service uses)
            formatted_claims = []
            for claim in claims:
                verifications = claim.get("claim_verifications", [])
                verif = verifications[0] if verifications else {}

                ev_result = (
                    supabase.table("evidence")
                    .select("id", count="exact")
                    .eq("claim_id", claim["id"])
                    .execute()
                )

                formatted_claims.append({
                    "claim_text": claim["claim_text"],
                    "claim_type": claim["claim_type"],
                    "verification_status": verif.get("status", "ai_inferred"),
                    "candidate_confirmed": verif.get("candidate_confirmed", False),
                    "evidence_count": ev_result.count or 0,
                })

            # Step 3: call the AI scorer — result is NOT saved to match_scores
            logger.info(f"Soft scoring candidate {candidate_id} against job {job_id}")
            scores = score_candidate_against_job(
                job_title=job["title"],
                job_summary=job.get("description") or "",
                requirements=requirements,
                claims=formatted_claims,
            )

            # Step 4: identify unmet must-have requirements
            must_haves = [r for r in requirements if r.get("importance") == "must_have"]
            claim_texts_lower = " ".join(c["claim_text"].lower() for c in formatted_claims)

            # Simple keyword check — tells candidate what's visibly missing
            likely_missing = [
                r["name"] for r in must_haves
                if r["name"].lower() not in claim_texts_lower
            ]

            return {
                "job_title": job["title"],
                "scores": {
                    "job_fit_score": scores["job_fit_score"],
                    "evidence_confidence_score": scores["evidence_confidence_score"],
                    "required_skill_match": scores["required_skill_match"],
                    "preferred_skill_match": scores["preferred_skill_match"],
                    "experience_relevance_score": scores["experience_relevance_score"],
                },
                "recommendation": scores["recommendation"],
                "likely_missing_requirements": likely_missing,
                "improvement_tip": (
                    "Add evidence to your existing claims to improve your evidence confidence score."
                    if scores["evidence_confidence_score"] < 60
                    else "Your evidence coverage looks good. Consider adding missing skills to your profile."
                ),
                "note": "This is a preview only — no application has been submitted.",
            }
        except Exception as e:
            logger.error(f"preview_job_match failed: {e}")
            return {"error": str(e)}

    # ── Tool 5 ────────────────────────────────────────────────────
    def get_evidence_suggestions(claim_type: str) -> dict:
        """
        Get suggestions for what type of evidence to attach to a claim,
        based on the claim type. Use this when the candidate asks what
        proof to provide for a specific kind of claim.

        Args:
            claim_type: One of: skill, project, certification, experience,
                        leadership, achievement
        """
        valid_types = list(_EVIDENCE_GUIDE.keys())
        if claim_type not in valid_types:
            return {
                "error": f"Unknown claim type '{claim_type}'.",
                "valid_types": valid_types,
            }

        suggestions = _EVIDENCE_GUIDE[claim_type]

        return {
            "claim_type": claim_type,
            "suggestions": suggestions,
            "tip": (
                "Recruiters value evidence they can verify independently — "
                "a live URL or downloadable file is stronger than a description."
            ),
        }

    # ── Tool 6 ────────────────────────────────────────────────────
    def get_my_applications() -> dict:
        """
        Get all job applications submitted by this candidate.
        Returns job title, application status, and submission date for each.
        Use this when the candidate asks about the status of their applications
        or wants an overview of where they have applied.

        Application statuses:
        - submitted: application received, under review
        - shortlisted: recruiter has shortlisted the candidate
        - interview_invited: recruiter has sent an interview invitation
        - rejected: application was not progressed
        """
        try:
            result = (
                supabase.table("applications")
                .select("id, status, submitted_at, job_id, jobs(title, companies(name))")
                .eq("candidate_id", candidate_id)
                .order("submitted_at", desc=True)
                .execute()
            )
            applications = result.data or []

            if not applications:
                return {
                    "applications": [],
                    "total": 0,
                    "message": "No applications submitted yet.",
                }

            formatted = []
            for app in applications:
                job = app.get("jobs", {})
                company = (job.get("companies") or {}).get("name", "Unknown company")
                formatted.append({
                    "application_id": app["id"],
                    "job_title": job.get("title", "Unknown"),
                    "company": company,
                    "status": app["status"],
                    "submitted_at": app["submitted_at"],
                })

            status_counts = {}
            for app in formatted:
                s = app["status"]
                status_counts[s] = status_counts.get(s, 0) + 1

            return {
                "applications": formatted,
                "total": len(formatted),
                "status_summary": status_counts,
            }
        except Exception as e:
            logger.error(f"get_my_applications failed: {e}")
            return {"error": str(e)}

    # Return all tools as a list
    return [
        get_my_profile,
        get_my_claims,
        extract_claims_from_documents,
        preview_job_match,
        get_evidence_suggestions,
        get_my_applications,
    ]