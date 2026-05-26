import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_user, require_candidate, require_recruiter, CurrentUser
from app.services import application_service, interview_service, email_service, report_service
from app.services.match_service import run_match_scoring
from app.db.supabase_client import supabase as db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/my")
async def get_my_applications(
    current_user: CurrentUser = Depends(require_candidate),
):
    """
    Returns all of the candidate's applications with job details.
    Includes match_scores if AI scoring has run.
    """
    applications = application_service.get_candidate_applications(current_user.user_id)
    return {"applications": applications, "total": len(applications)}


# ── Scoring routes ────────────────────────────────────────────
# These must be defined before GET /{application_id} because FastAPI
# reads routes top-to-bottom and /{application_id}/score is more
# specific than /{application_id}.

@router.post("/{application_id}/score")
async def score_application(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Recruiter manually (re-)triggers AI scoring for an application.
    Safe to call multiple times — scoring always replaces the previous result.
    Useful after a candidate adds more evidence post-submission.
    """
    try:
        score = run_match_scoring(application_id, user_id=current_user.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Scoring complete.", "score": score}


@router.get("/{application_id}/score")
async def get_application_score(
    application_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the current match score for an application.
    Accessible to the candidate who owns it OR the recruiter who owns the job.
    Returns null score if not yet scored.
    """
    result = (
        db.table("match_scores")
        .select("*")
        .eq("application_id", application_id)
        .execute()
    )

    if not result.data:
        return {"score": None, "message": "Not yet scored."}

    return {"score": result.data[0]}


# ── Application detail (recruiter) ───────────────────────────

@router.get("/{application_id}/detail")
async def get_application_detail(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Returns full application detail for the recruiter's candidate view.
    Includes candidate name/email, job info, and match scores.
    """
    application = application_service.get_application_for_recruiter(
        application_id=application_id,
        recruiter_id=current_user.user_id,
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found.")
    return application


# ── Interview questions ───────────────────────────────────────
# POST .../generate → AI suggests (does NOT save) — recruiter reviews
# POST ...          → saves recruiter-confirmed list (delete-then-insert)
# GET  ...          → read saved questions
# DELETE .../id     → recruiter removes a single saved question

@router.post("/{application_id}/questions/generate")
async def generate_questions(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Calls Gemini and returns suggested interview questions.
    Does NOT save anything — recruiter reviews first.
    """
    try:
        questions = interview_service.generate_questions(
            application_id=application_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"questions": questions, "total": len(questions)}


@router.post("/{application_id}/questions")
async def save_questions(
    application_id: str,
    body: dict,   # {"questions": [{question, question_type, reason}, ...]}
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Saves the recruiter-confirmed interview questions.
    Replaces any previously saved questions for this application.
    """
    questions = body.get("questions", [])
    try:
        saved = interview_service.save_questions(
            application_id=application_id,
            questions=questions,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": f"Saved {len(saved)} questions.", "questions": saved}


@router.get("/{application_id}/questions")
async def get_questions(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Returns the saved interview questions for an application."""
    questions = interview_service.get_questions(application_id)
    return {"questions": questions, "total": len(questions)}


@router.delete("/{application_id}/questions/{question_id}")
async def delete_question(
    application_id: str,
    question_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Recruiter removes a single interview question."""
    try:
        deleted = interview_service.delete_question(
            question_id=question_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail="Question not found.")

    return {"message": "Question deleted."}


@router.put("/{application_id}/status")
async def update_status(
    application_id: str,
    request: dict,  # simple dict for now: {"status": "shortlisted"}
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Recruiter updates an application status."""
    new_status = request.get("status")
    try:
        updated = application_service.update_application_status(
            application_id=application_id,
            recruiter_id=current_user.user_id,
            new_status=new_status,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="Application not found.")

    return {"message": f"Application status updated to '{new_status}'.", "application": updated}


# ── Email draft routes ────────────────────────────────────────
# POST .../email/generate → AI writes draft (does NOT save)
# POST .../email          → recruiter saves edited draft
# GET  .../email          → read current draft
# PUT  .../email/approve  → recruiter approves
# PUT  .../email/send     → mark as sent, application → interview_invited

@router.post("/{application_id}/email/generate")
async def generate_email(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Calls Gemini and returns a draft email subject + body.
    Does NOT save anything — recruiter edits it in the browser first.
    """
    try:
        draft = email_service.generate_email_draft(
            application_id=application_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return draft   # {"subject": "...", "body": "..."}


@router.post("/{application_id}/email")
async def save_email(
    application_id: str,
    body: dict,   # {"subject": "...", "body": "..."}
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Saves (or replaces) the recruiter-edited email draft."""
    try:
        saved = email_service.save_email_draft(
            application_id=application_id,
            subject=body.get("subject", ""),
            body=body.get("body", ""),
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Email draft saved.", "draft": saved}


@router.get("/{application_id}/email")
async def get_email(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Returns the current email draft, or null if none exists."""
    draft = email_service.get_email_draft(application_id)
    return {"draft": draft}


@router.put("/{application_id}/email/approve")
async def approve_email(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """Recruiter marks the draft as approved and ready to send."""
    try:
        updated = email_service.approve_email_draft(
            application_id=application_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"message": "Email draft approved.", "draft": updated}


@router.put("/{application_id}/email/send")
async def mark_email_sent(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Marks the email as sent and updates the application status
    to 'interview_invited'. The candidate will see this in their list.
    """
    try:
        result = email_service.mark_as_sent(
            application_id=application_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


# ── Candidate report ──────────────────────────────────────────

@router.post("/{application_id}/report/generate")
async def generate_report(
    application_id: str,
    current_user: CurrentUser = Depends(require_recruiter),
):
    """
    Generates an AI candidate assessment report on demand.
    Requires scoring to have run first (match_scores must exist).
    Not saved to DB — regenerated fresh each call.
    """
    try:
        report = report_service.generate_candidate_report(
            application_id=application_id,
            recruiter_id=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return report


@router.get("/{application_id}")
async def get_application(
    application_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns a single application.
    Accessible to the candidate who owns it OR the recruiter who posted the job.
    """
    result = (
        db.table("applications")
        .select("*, jobs(*, companies(name)), match_scores(*)")
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Application not found.")

    app = result.data[0]

    # Access control: only the candidate or the job's recruiter
    is_candidate = app["candidate_id"] == current_user.user_id
    is_recruiter = (
        current_user.role == "recruiter"
        and app["jobs"]["recruiter_id"] == current_user.user_id
    )
    if not is_candidate and not is_recruiter:
        raise HTTPException(status_code=403, detail="Access denied.")

    return app


