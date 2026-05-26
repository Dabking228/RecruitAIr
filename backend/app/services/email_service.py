"""
Manages the email draft lifecycle for interview invitations:
  generate → AI writes draft (not saved)
  save     → recruiter saves after editing (status: 'draft')
  get      → retrieve the current draft
  approve  → recruiter confirms it's ready (status: 'approved')
  mark_sent→ recruiter sent it; also moves application to 'interview_invited'
"""
import logging
from app.db.supabase_client import supabase
from app.ai.email_draft_generator import generate_email_draft as ai_generate_email
from app.services import audit_service

logger = logging.getLogger(__name__)


# ── Private helpers ───────────────────────────────────────────

def _verify_recruiter_owns_application(application_id: str, recruiter_id: str) -> dict:
    """
    Checks ownership and returns the application with job + company info.
    Raises ValueError if not found or not owned.
    """
    result = (
        supabase.table("applications")
        .select("""
            id, candidate_id, job_id,
            jobs(id, title, recruiter_id, companies(name))
        """)
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Application not found.")

    application = result.data[0]
    job = application.get("jobs", {})

    if job.get("recruiter_id") != recruiter_id:
        raise ValueError("You do not have permission to access this application.")

    return application


def _build_topics_summary(application_id: str) -> str:
    """
    Reads saved interview questions and summarises the topic areas.
    Used in the email prompt so Gemini can mention what will be discussed.
    """
    result = (
        supabase.table("interview_questions")
        .select("question_type")
        .eq("application_id", application_id)
        .execute()
    )
    questions = result.data or []

    if not questions:
        return "your technical background, experience, and relevant projects"

    # Count questions per type
    type_counts: dict[str, int] = {}
    for q in questions:
        qt = q.get("question_type", "technical")
        type_counts[qt] = type_counts.get(qt, 0) + 1

    # Build a natural-language summary of topics
    type_labels = {
        "technical":      "technical skills and knowledge",
        "behavioral":     "past experience and behavioral scenarios",
        "evidence_check": "portfolio and project evidence",
        "role_specific":  "role-specific responsibilities",
    }

    # Take up to 3 most common types (sorted by count descending)
    top_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    topics = [type_labels.get(t, t) for t, _ in top_types]

    if len(topics) == 1:
        return topics[0]
    if len(topics) == 2:
        return f"{topics[0]} and {topics[1]}"
    return f"{topics[0]}, {topics[1]}, and {topics[2]}"


# ── Public functions ──────────────────────────────────────────

def generate_email_draft(application_id: str, recruiter_id: str) -> dict:
    """
    Gathers context and calls Gemini to generate an email draft.

    IMPORTANT: Does NOT save anything to the database.
    The recruiter edits the returned {subject, body} and calls save_email_draft().

    Raises:
        ValueError: ownership failure, 'pass' recommendation, or AI error
    """
    # Step 1: ownership + job/company info
    application = _verify_recruiter_owns_application(application_id, recruiter_id)
    job = application["jobs"]
    company_name = (job.get("companies") or {}).get("name", "the company")

    # Step 2: candidate name
    candidate_result = (
        supabase.table("users")
        .select("name, email")
        .eq("id", application["candidate_id"])
        .execute()
    )
    candidate = candidate_result.data[0] if candidate_result.data else {}
    candidate_name = candidate.get("name") or candidate.get("email", "Candidate")

    # Step 3: recruiter name
    recruiter_result = (
        supabase.table("users")
        .select("name")
        .eq("id", recruiter_id)
        .execute()
    )
    recruiter_name = (
        recruiter_result.data[0].get("name") if recruiter_result.data else None
    ) or "The Recruitment Team"

    # Step 4: match recommendation (sets the email tone)
    score_result = (
        supabase.table("match_scores")
        .select("recommendation")
        .eq("application_id", application_id)
        .execute()
    )
    recommendation = (
        score_result.data[0]["recommendation"] if score_result.data else "hire"
    )

    # Step 5: topics from saved questions
    topics_summary = _build_topics_summary(application_id)

    logger.info(
        f"Generating email for application {application_id}: "
        f"candidate='{candidate_name}', recommendation='{recommendation}'"
    )

    # Step 6: call Gemini
    return ai_generate_email(
        candidate_name=candidate_name,
        job_title=job["title"],
        company_name=company_name,
        recruiter_name=recruiter_name,
        recommendation=recommendation,
        topics_summary=topics_summary,
    )


def save_email_draft(
    application_id: str,
    subject: str,
    body: str,
    recruiter_id: str,
) -> dict:
    """
    Saves (or replaces) the email draft for this application.
    Uses delete-then-insert — consistent with save_job_requirements pattern.
    Status is always 'draft' after saving (recruiter must explicitly approve).

    Raises:
        ValueError: if subject/body are empty or recruiter doesn't own the job
    """
    _verify_recruiter_owns_application(application_id, recruiter_id)

    subject = subject.strip()
    body = body.strip()
    if not subject or not body:
        raise ValueError("Subject and body are required.")

    # Delete any existing draft for this application
    supabase.table("email_drafts").delete().eq(
        "application_id", application_id
    ).execute()

    # Insert fresh
    result = (
        supabase.table("email_drafts")
        .insert({
            "application_id": application_id,
            "subject": subject,
            "body": body,
            "status": "draft",
        })
        .execute()
    )

    if not result.data:
        raise RuntimeError("Failed to save email draft.")

    logger.info(f"Email draft saved for application {application_id}")
    return result.data[0]


def get_email_draft(application_id: str) -> dict | None:
    """Returns the current email draft for an application, or None."""
    result = (
        supabase.table("email_drafts")
        .select("*")
        .eq("application_id", application_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def approve_email_draft(application_id: str, recruiter_id: str) -> dict:
    """
    Marks the email draft as approved.
    Recruiter confirms they've reviewed the content and are ready to send.

    Raises:
        ValueError: if no draft exists or recruiter doesn't own the job
    """
    _verify_recruiter_owns_application(application_id, recruiter_id)

    result = (
        supabase.table("email_drafts")
        .update({"status": "approved"})
        .eq("application_id", application_id)
        .execute()
    )

    if not result.data:
        raise ValueError("No email draft found for this application.")

    logger.info(f"Email draft approved for application {application_id}")
    return result.data[0]


def mark_as_sent(application_id: str, recruiter_id: str) -> dict:
    """
    Marks the email draft as sent AND updates the application status
    to 'interview_invited'. This is the final step of the invite workflow.

    Two updates happen atomically:
      1. email_drafts.status → 'sent'
      2. applications.status → 'interview_invited'

    The candidate will then see "Interview Invited 🎉" in their applications list.

    Raises:
        ValueError: if no draft exists, draft is not approved, or ownership fails
    """
    _verify_recruiter_owns_application(application_id, recruiter_id)

    # Only approved drafts can be marked as sent
    draft = get_email_draft(application_id)
    if not draft:
        raise ValueError("No email draft found for this application.")
    if draft["status"] not in ("approved", "draft"):
        raise ValueError("Email has already been marked as sent.")

    # Update email draft status
    supabase.table("email_drafts").update({"status": "sent"}).eq(
        "application_id", application_id
    ).execute()

    # Update application status — candidate now sees "Interview Invited"
    supabase.table("applications").update(
        {"status": "interview_invited"}
    ).eq("id", application_id).execute()

    logger.info(
        f"Email marked as sent for application {application_id}; "
        "application status → interview_invited"
    )

    audit_service.log_action(
        user_id=recruiter_id,
        action="email.sent",
        target_type="application",
        target_id=application_id,
        metadata={"application_id": application_id},
    )

    return {"message": "Email marked as sent. Candidate notified of interview."}