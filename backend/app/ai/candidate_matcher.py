"""
Candidate Matcher — uses Gemini to score a candidate's claims
against a job's requirements and return structured scores.

Called by match_service.run_match_scoring() only.
Never call this directly from a router.
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

# Valid recommendation values mirror the match_scores.recommendation CHECK constraint.
VALID_RECOMMENDATIONS = {"strong_hire", "hire", "maybe", "pass"}

CANDIDATE_MATCHER_PROMPT = """\
You are an expert technical recruiter. Score this candidate against the job requirements.

JOB: {job_title}
SUMMARY: {job_summary}

JOB REQUIREMENTS:
{requirements_block}

CANDIDATE CLAIMS:
{claims_block}

SCORING RULES:
1. job_fit_score (0-100): Overall fit. Weight must_have requirements 3× more than nice_to_have.
2. evidence_confidence_score (0-100): How well are claims backed by real evidence?
   - verification=verified AND evidence_count > 0  → strong positive
   - verification=user_confirmed, no evidence      → partial credit (50%)
   - verification=ai_inferred, no evidence         → minimal credit (20%)
   - Penalise heavily when evidence_expected=true but no evidence exists
3. required_skill_match (0-100): % of must_have and required_skill requirements addressed
4. preferred_skill_match (0-100): % of nice_to_have and preferred_skill requirements addressed
5. experience_relevance_score (0-100): How relevant is their overall experience to this specific role?
6. recommendation — pick exactly one:
   - "strong_hire": job_fit >= 80 AND evidence_confidence >= 70
   - "hire":        job_fit >= 65 AND evidence_confidence >= 50
   - "maybe":       job_fit >= 45 OR evidence too low to reach "hire"
   - "pass":        job_fit < 45

Return ONLY valid JSON in exactly this structure:
{{
  "job_fit_score": <integer 0-100>,
  "evidence_confidence_score": <integer 0-100>,
  "required_skill_match": <integer 0-100>,
  "preferred_skill_match": <integer 0-100>,
  "experience_relevance_score": <integer 0-100>,
  "recommendation": "<strong_hire|hire|maybe|pass>"
}}
"""


def _format_requirements(requirements: list[dict]) -> str:
    if not requirements:
        return "No requirements specified."
    lines = []
    for r in requirements:
        lines.append(
            f"- [{r['requirement_type'].upper()}] {r['name']} "
            f"(importance={r['importance']}, weight={r.get('weight', 1.0)}, "
            f"evidence_expected={r.get('evidence_expected', False)}): "
            f"{r.get('description', '')}"
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


def score_candidate_against_job(
    job_title: str,
    job_summary: str,
    requirements: list[dict],
    claims: list[dict],
) -> dict:
    """
    Scores a candidate against job requirements using Gemini.

    Args:
        job_title:    Title of the job
        job_summary:  One-line job summary (from job_parser output)
        requirements: Rows from job_requirements table
        claims:       Claim dicts enriched with verification_status + evidence_count

    Returns:
        Dict with 5 integer scores (0-100) and a recommendation string.

    Raises:
        ValueError: if Gemini returns unusable output
    """
    prompt = CANDIDATE_MATCHER_PROMPT.format(
        job_title=job_title,
        job_summary=job_summary or "Not provided.",
        requirements_block=_format_requirements(requirements),
        claims_block=_format_claims(claims),
    )

    model = get_model(temperature=0.1)
    logger.info(f"Sending scoring request to Gemini for job '{job_title}'")

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as e:
        logger.error(f"Gemini API call failed during scoring: {e}")
        raise ValueError("Could not reach the AI service. Please try again.")

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:200]}")
        raise ValueError("AI returned an unreadable response. Please try again.")

    # Validate recommendation — default to "maybe" if Gemini drifts
    recommendation = result.get("recommendation", "maybe")
    if recommendation not in VALID_RECOMMENDATIONS:
        logger.warning(f"Invalid recommendation '{recommendation}', defaulting to 'maybe'")
        recommendation = "maybe"
    result["recommendation"] = recommendation

    # Clamp all numeric scores to 0–100
    score_fields = [
        "job_fit_score", "evidence_confidence_score",
        "required_skill_match", "preferred_skill_match",
        "experience_relevance_score",
    ]
    for field in score_fields:
        try:
            result[field] = max(0, min(100, int(result.get(field, 0))))
        except (TypeError, ValueError):
            result[field] = 0

    logger.info(
        f"Scoring complete: fit={result['job_fit_score']} "
        f"evidence={result['evidence_confidence_score']} "
        f"recommendation={result['recommendation']}"
    )

    return result