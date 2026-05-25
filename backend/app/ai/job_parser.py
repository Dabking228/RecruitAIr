"""
Job Description Parser — uses Gemini to extract structured
requirements from a free-text job description.

The recruiter pastes their JD, we send it to Gemini,
and get back a list of typed, weighted requirements.
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────
# This prompt is the core of the AI feature. Every word matters.
# Rules for a good extraction prompt:
#   1. Define the AI's role clearly
#   2. Explain exactly what you want extracted
#   3. Define every field's allowed values
#   4. Show the output format with a real example
#   5. Keep the instruction tone firm, not conversational

JOB_PARSER_PROMPT = """\
You are an expert HR analyst and job description parser.

TASK:
Analyze the job description below and extract ALL requirements into a structured list.

REQUIREMENT TYPES (use exactly these values):
- "required_skill"   → Technical or soft skill the candidate must have
- "preferred_skill"  → Skill that is a bonus but not required
- "responsibility"   → Day-to-day duty or task in this role
- "certification"    → A formal certificate or qualification required or preferred

IMPORTANCE (use exactly these values):
- "must_have"     → The candidate cannot be hired without this
- "nice_to_have"  → The candidate is preferred if they have this

WEIGHT (a float from 0.5 to 3.0):
- 3.0 = Absolutely central to this role
- 2.0 = Very important
- 1.0 = Standard requirement
- 0.5 = Minor bonus

EVIDENCE_EXPECTED:
- true  → Candidate should provide proof (GitHub, portfolio, certificate, etc.)
- false → Cannot be easily proven with a document (e.g., "good communication skills")

EXTRACTION RULES:
- Extract between 5 and 15 requirements total
- Be specific: "Python (FastAPI, Django)" not just "Backend development"
- Responsibilities are always must_have with evidence_expected: false
- Certifications always have evidence_expected: true
- Do not invent requirements not present in the description

OUTPUT FORMAT — return ONLY this JSON, nothing else:
{{
  "job_summary": "One sentence describing what this role does and for whom",
  "requirements": [
    {{
      "requirement_type": "required_skill",
      "name": "Python Programming",
      "description": "3+ years of Python experience, preferably with FastAPI or Django",
      "importance": "must_have",
      "weight": 2.5,
      "evidence_expected": true
    }}
  ]
}}

JOB DESCRIPTION:
---
{description}
---\
"""


def parse_job_description(description: str) -> dict:
    """
    Parses a job description and returns structured requirements.

    Returns:
        {
            "job_summary": str,
            "requirements": [
                {
                    "requirement_type": str,
                    "name": str,
                    "description": str,
                    "importance": str,
                    "weight": float,
                    "evidence_expected": bool
                },
                ...
            ]
        }

    Raises:
        ValueError: if the AI returns unusable output after validation
    """
    if len(description.strip()) < 50:
        raise ValueError("Job description is too short for meaningful extraction.")

    model = get_model(temperature=0.1)  # Low temp for consistent extraction
    prompt = JOB_PARSER_PROMPT.format(description=description)

    logger.info("Sending job description to Gemini for parsing...")

    try:
        response = model.generate_content(prompt)
        raw_text = response.text

        logger.info(f"Gemini response received ({len(raw_text)} chars)")

    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        raise ValueError(
            "Could not reach the AI service. Please check your API key and try again."
        )

    # ── Parse the JSON ─────────────────────────────────────────
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:200]}")
        raise ValueError(
            "The AI returned an unreadable response. Please try again."
        )

    # ── Validate the structure ─────────────────────────────────
    if "requirements" not in parsed or not isinstance(parsed["requirements"], list):
        raise ValueError("AI response is missing the requirements list.")

    # ── Clean and validate each requirement ───────────────────
    valid_types = {"required_skill", "preferred_skill", "responsibility", "certification"}
    valid_importance = {"must_have", "nice_to_have"}

    cleaned = []
    for i, req in enumerate(parsed["requirements"]):
        # Skip requirements with invalid types silently
        if req.get("requirement_type") not in valid_types:
            logger.warning(f"Skipping requirement {i}: invalid type '{req.get('requirement_type')}'")
            continue

        # Default invalid importance to must_have
        if req.get("importance") not in valid_importance:
            req["importance"] = "must_have"

        # Clamp weight to 0.5–3.0
        try:
            weight = float(req.get("weight", 1.0))
        except (TypeError, ValueError):
            weight = 1.0
        req["weight"] = round(max(0.5, min(3.0, weight)), 2)

        # Ensure evidence_expected is a boolean
        req["evidence_expected"] = bool(req.get("evidence_expected", True))

        # Ensure name and description exist
        req["name"] = str(req.get("name", "Unnamed requirement")).strip()
        req["description"] = str(req.get("description", "")).strip()

        cleaned.append(req)

    if not cleaned:
        raise ValueError(
            "The AI could not extract any requirements from this description. "
            "Please ensure the job description contains clear requirements."
        )

    logger.info(f"Successfully extracted {len(cleaned)} requirements")

    return {
        "job_summary": str(parsed.get("job_summary", "")).strip(),
        "requirements": cleaned,
    }