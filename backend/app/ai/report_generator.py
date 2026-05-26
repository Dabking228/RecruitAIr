"""
Candidate Report Generator — uses Gemini to write a structured
narrative analysis of a candidate for a specific job application.

This is the human-readable explanation of WHY the candidate
scored the way they did. It connects claims → evidence → requirements.

Called by report_service.generate_candidate_report() only.
Temperature 0.3 — analytical, consistent, fact-based.
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

REPORT_GENERATOR_PROMPT = """\
You are a senior technical recruiter writing a structured candidate assessment report.

JOB: {job_title}

JOB REQUIREMENTS (sorted by importance):
{requirements_block}

CANDIDATE CLAIMS AND EVIDENCE:
{claims_block}

AI MATCH SCORES:
- Job Fit Score:            {job_fit_score}%
- Evidence Confidence:      {evidence_confidence_score}%
- Required Skill Match:     {required_skill_match}%
- Preferred Skill Match:    {preferred_skill_match}%
- Experience Relevance:     {experience_relevance_score}%
- Overall Recommendation:   {recommendation}

REPORT INSTRUCTIONS:
1. executive_summary: 2-3 sentences. Who is this candidate for this role? \
Reference their strongest verified claim and the most significant gap.
2. strengths: 3-5 bullet points. Specific skills or experiences that directly \
address job requirements. Reference claim_text where relevant.
3. evidence_highlights: 2-4 bullet points. Claims that have strong evidence \
(verification=verified, evidence_count > 0). Explain what the evidence signals.
4. evidence_gaps: 2-4 bullet points. Important claims with verification=ai_inferred \
AND evidence_count=0 — skills asserted but not proven. Be factual, not harsh.
5. concerns: 2-3 bullet points. Missing must_have requirements, unexplained gaps, \
or low-evidence high-weight skills. Reference specific job requirements.
6. recommended_next_step: 1 sentence. Based on the recommendation \
("{recommendation}"), what should the recruiter do next? Be specific.

RULES:
- Do NOT reference AI scoring or automated systems in the report text
- Write as if you personally reviewed the candidate
- Be specific — reference actual claim texts and requirement names
- Keep each bullet point under 25 words
- Do not repeat information across sections

Return ONLY valid JSON in exactly this structure:
{{
  "executive_summary": "...",
  "strengths": ["...", "...", "..."],
  "evidence_highlights": ["...", "..."],
  "evidence_gaps": ["...", "..."],
  "concerns": ["...", "..."],
  "recommended_next_step": "..."
}}
"""


def _format_requirements(requirements: list[dict]) -> str:
    if not requirements:
        return "No requirements specified."
    # Sort: must_have first, then by weight descending
    sorted_reqs = sorted(
        requirements,
        key=lambda r: (0 if r.get("importance") == "must_have" else 1, -float(r.get("weight", 1.0)))
    )
    lines = []
    for r in sorted_reqs:
        lines.append(
            f"- [{r['importance'].upper()}] {r['name']} "
            f"(weight={r.get('weight', 1.0)}, "
            f"evidence_expected={r.get('evidence_expected', False)})"
        )
    return "\n".join(lines)


def _format_claims(claims: list[dict]) -> str:
    if not claims:
        return "No claims provided."
    lines = []
    for c in claims:
        lines.append(
            f"- [{c['claim_type'].upper()}] \"{c['claim_text']}\" "
            f"| verification={c.get('verification_status', 'ai_inferred')} "
            f"| evidence_count={c.get('evidence_count', 0)}"
        )
    return "\n".join(lines)


def generate_report(
    job_title: str,
    requirements: list[dict],
    claims: list[dict],
    scores: dict,
) -> dict:
    """
    Generates a structured candidate assessment report.

    Args:
        job_title:    The job the candidate applied for
        requirements: Rows from job_requirements table
        claims:       Claims enriched with verification_status + evidence_count
        scores:       Dict from match_scores table (all 5 scores + recommendation)

    Returns:
        Dict with 6 keys: executive_summary, strengths, evidence_highlights,
        evidence_gaps, concerns, recommended_next_step.

    Raises:
        ValueError: if Gemini returns unusable output
    """
    recommendation = scores.get("recommendation", "maybe")

    prompt = REPORT_GENERATOR_PROMPT.format(
        job_title=job_title,
        requirements_block=_format_requirements(requirements),
        claims_block=_format_claims(claims),
        job_fit_score=scores.get("job_fit_score", 0),
        evidence_confidence_score=scores.get("evidence_confidence_score", 0),
        required_skill_match=scores.get("required_skill_match", 0),
        preferred_skill_match=scores.get("preferred_skill_match", 0),
        experience_relevance_score=scores.get("experience_relevance_score", 0),
        recommendation=recommendation,
    )

    model = get_model(temperature=0.3)
    logger.info(f"Generating candidate report for job '{job_title}'")

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as e:
        logger.error(f"Gemini API call failed during report generation: {e}")
        raise ValueError("Could not reach the AI service. Please try again.")

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:200]}")
        raise ValueError("AI returned an unreadable response. Please try again.")

    # Validate required fields — default to empty if missing
    report = {
        "executive_summary": str(result.get("executive_summary", "")).strip(),
        "strengths": [str(s) for s in result.get("strengths", []) if s],
        "evidence_highlights": [str(s) for s in result.get("evidence_highlights", []) if s],
        "evidence_gaps": [str(s) for s in result.get("evidence_gaps", []) if s],
        "concerns": [str(s) for s in result.get("concerns", []) if s],
        "recommended_next_step": str(result.get("recommended_next_step", "")).strip(),
    }

    if not report["executive_summary"]:
        raise ValueError("AI returned an incomplete report. Please try again.")

    logger.info("Candidate report generated successfully")
    return report