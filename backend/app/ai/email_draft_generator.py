"""
Email Draft Generator — uses Gemini to write a personalised
interview invitation email for a specific candidate.

The email contains [PLACEHOLDER] tokens for date, time, format,
and meeting link so the recruiter can fill them in before sending.

Called by email_service.generate_email_draft() only.
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

EMAIL_DRAFT_PROMPT = """\
You are an expert recruiter writing a professional interview invitation email.

CONTEXT:
- Candidate name: {candidate_name}
- Job title: {job_title}
- Company: {company_name}
- Recruiter name: {recruiter_name}
- AI recommendation: {recommendation}
- Interview topics that will be covered: {topics_summary}

TONE GUIDE based on recommendation:
- "strong_hire": warm and enthusiastic — candidate is a strong fit
- "hire": professional and positive — good fit, moving forward
- "maybe": professional and neutral — exploring further
- "pass": do not generate an invite email for this recommendation

RULES:
1. Write a complete, professional interview invitation email
2. Do NOT mention AI scoring or that the candidate was evaluated by software
3. Include exactly these placeholders (word-for-word, in square brackets):
   - [DATE] for the interview date
   - [TIME] for the interview time
   - [FORMAT] for the interview format (e.g. Online / In-person)
   - [MEETING LINK OR LOCATION] for the joining details
4. Mention 2-3 of the interview topic areas naturally (e.g., "we'll explore your technical background and walk through some projects")
5. Keep the body under 250 words — professional emails are concise
6. End with the recruiter's name and a placeholder for contact details

Return ONLY valid JSON in exactly this structure:
{{
  "subject": "Interview Invitation — {job_title} at {company_name}",
  "body": "Dear {candidate_name},\\n\\nThank you for your application..."
}}
"""


def generate_email_draft(
    candidate_name: str,
    job_title: str,
    company_name: str,
    recruiter_name: str,
    recommendation: str,
    topics_summary: str,
) -> dict:
    """
    Generates a personalised interview invitation email draft.

    Args:
        candidate_name:  The candidate's full name
        job_title:       The job they applied for
        company_name:    The company posting the job
        recruiter_name:  The recruiter sending the invite (signs off the email)
        recommendation:  From match_scores — sets the tone
        topics_summary:  Short description of interview topics (from question types)

    Returns:
        Dict with 'subject' and 'body' strings.
        NOT saved — caller must save after recruiter edits and confirms.

    Raises:
        ValueError: if recommendation is 'pass' or AI returns bad output
    """
    if recommendation == "pass":
        raise ValueError(
            "Cannot generate an interview invitation for a 'pass' recommendation. "
            "Consider updating the candidate's status to 'rejected' instead."
        )

    prompt = EMAIL_DRAFT_PROMPT.format(
        candidate_name=candidate_name or "Candidate",
        job_title=job_title,
        company_name=company_name,
        recruiter_name=recruiter_name or "The Recruitment Team",
        recommendation=recommendation,
        topics_summary=topics_summary,
    )

    # Temperature 0.5 — emails need warmth and natural language,
    # slightly more creative than scoring (0.1) but less than fully generative tasks
    model = get_model(temperature=0.5)
    logger.info(f"Generating email draft for '{candidate_name}' → '{job_title}'")

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as e:
        logger.error(f"Gemini API call failed during email generation: {e}")
        raise ValueError("Could not reach the AI service. Please try again.")

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:200]}")
        raise ValueError("AI returned an unreadable response. Please try again.")

    subject = str(result.get("subject", "")).strip()
    body = str(result.get("body", "")).strip()

    if not subject or not body:
        raise ValueError("AI returned an incomplete email. Please try again.")

    logger.info("Email draft generated successfully")
    return {"subject": subject, "body": body}