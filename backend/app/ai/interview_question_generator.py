"""
Interview Question Generator — uses Gemini to generate targeted
interview questions for a specific candidate-job pairing.

The AI reads the candidate's claims and evidence quality alongside
the match scores to focus questions on evidence gaps and key skills.

Called by interview_service.generate_questions() only.
Never call this directly from a router.
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

VALID_QUESTION_TYPES = {"technical", "behavioral", "evidence_check", "role_specific"}

INTERVIEW_QUESTION_PROMPT = """\
You are an expert technical recruiter preparing targeted interview questions.

JOB: {job_title}
JOB DESCRIPTION (excerpt):
{job_description}

JOB REQUIREMENTS:
{requirements_block}

CANDIDATE CLAIMS:
{claims_block}

AI MATCH SCORES:
- Job Fit Score:          {job_fit_score}%
- Evidence Confidence:    {evidence_confidence_score}%
- Required Skill Match:   {required_skill_match}%

QUESTION TYPES (use exactly these values):
- "technical"      → Tests a specific technical skill or knowledge they claimed
- "behavioral"     → STAR-format (Situation, Task, Action, Result) about their experience
- "evidence_check" → Directly challenges a claim with no backing evidence
- "role_specific"  → Tests fit for a specific RESPONSIBILITY listed in the job requirements

RULES:
1. Generate between 6 and 10 questions total
2. Prioritise "evidence_check" for any claim where verification=ai_inferred AND evidence_count=0
3. If evidence_confidence < 50, include at least 2 "evidence_check" questions
4. Always include at least 1 "behavioral" and 1 "role_specific" question
5. Reference the actual claim text or requirement name in each question — never ask generic questions
6. Each question must include a "reason" that explains what gap or claim it targets

Return ONLY valid JSON in exactly this structure:
{{
  "questions": [
    {{
      "question": "You mentioned building a REST API with FastAPI for an e-commerce project. \
Can you walk through the authentication mechanism you implemented and how you handled token expiry?",
      "question_type": "evidence_check",
      "reason": "Candidate claims FastAPI experience but this claim is ai_inferred with 0 supporting evidence."
    }},
    {{
      "question": "Describe a situation where you had to debug a critical production issue under time pressure.",
      "question_type": "behavioral",
      "reason": "Probes real-world experience — candidate claims 2 years of backend development."
    }}
  ]
}}

==== END OF INSTRUCTIONS ====
"""


def _format_requirements(requirements: list[dict]) -> str:
    if not requirements:
        return "No requirements specified."
    lines = []
    for r in requirements:
        lines.append(
            f"- [{r['requirement_type'].upper()}] {r['name']} "
            f"(importance={r['importance']}, evidence_expected={r.get('evidence_expected', False)})"
        )
    return "\n".join(lines)


def _format_claims(claims: list[dict]) -> str:
    if not claims:
        return "No claims provided."
    lines = []
    for c in claims:
        lines.append(
            f"- [{c['claim_type'].upper()}] {c['claim_text']} "
            f"| verification={c.get('verification_status', 'ai_inferred')} "
            f"| evidence_count={c.get('evidence_count', 0)}"
        )
    return "\n".join(lines)


def generate_interview_questions(
    job_title: str,
    job_description: str,
    requirements: list[dict],
    claims: list[dict],
    job_fit_score: int = 0,
    evidence_confidence_score: int = 0,
    required_skill_match: int = 0,
) -> list[dict]:
    """
    Generates interview questions for a candidate-job pairing.

    Args:
        job_title:                The job title
        job_description:          The full job description (will be truncated)
        requirements:             Rows from job_requirements table
        claims:                   Claims enriched with verification_status + evidence_count
        job_fit_score:            From match_scores (0-100)
        evidence_confidence_score: From match_scores (0-100)
        required_skill_match:     From match_scores (0-100)

    Returns:
        List of dicts with 'question', 'question_type', 'reason'.
        NOT saved — caller must save after recruiter confirms.

    Raises:
        ValueError: if Gemini returns unusable output
    """
    # Truncate description to keep the prompt a manageable size
    description_excerpt = job_description[:800] + "..." if len(job_description) > 800 else job_description

    prompt = INTERVIEW_QUESTION_PROMPT.format(
        job_title=job_title,
        job_description=description_excerpt,
        requirements_block=_format_requirements(requirements),
        claims_block=_format_claims(claims),
        job_fit_score=job_fit_score,
        evidence_confidence_score=evidence_confidence_score,
        required_skill_match=required_skill_match,
    )

    # Temperature 0.4 — low enough for professional questions,
    # high enough to vary phrasing across different candidates
    model = get_model(temperature=0.4)
    logger.info(f"Generating interview questions for job '{job_title}'")

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as e:
        logger.error(f"Gemini API call failed during question generation: {e}")
        raise ValueError("Could not reach the AI service. Please try again.")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:200]}")
        raise ValueError("AI returned an unreadable response. Please try again.")

    raw_questions = parsed.get("questions", [])
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ValueError(
            "The AI could not generate questions. "
            "Ensure the candidate has claims and the job has requirements before generating."
        )

    # Validate and clean each question
    cleaned = []
    for q in raw_questions:
        question_text = str(q.get("question", "")).strip()
        if len(question_text) < 20:
            logger.warning("Skipping question — too short")
            continue

        question_type = q.get("question_type", "technical")
        if question_type not in VALID_QUESTION_TYPES:
            logger.warning(f"Invalid question type '{question_type}', defaulting to 'technical'")
            question_type = "technical"

        cleaned.append({
            "question": question_text,
            "question_type": question_type,
            "reason": str(q.get("reason", "")).strip() or None,
        })

    if not cleaned:
        raise ValueError("No valid questions could be generated. Please try again.")

    logger.info(f"Generated {len(cleaned)} interview questions")
    return cleaned