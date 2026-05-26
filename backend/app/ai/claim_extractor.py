"""
Claim Extractor — uses Gemini to read a candidate's full profile
and all their document text, then extracts specific, verifiable claims.

This is the core intelligence of the evidence-aware system.
Every claim extracted here will be:
  1. Reviewed by the candidate
  2. Matched against job requirements
  3. Scored for evidence support
"""
import json
import logging
from app.ai.gemini_client import get_model

logger = logging.getLogger(__name__)

CLAIM_EXTRACTOR_PROMPT = """\
You are an expert HR analyst reading a candidate's professional profile and resume.

YOUR TASK:
Extract every specific, verifiable professional claim the candidate makes about themselves.

WHAT IS A CLAIM:
A claim is a specific, first-person, professional statement that is:
  - Tied to a concrete skill, project, certification, experience, or achievement
  - Specific enough that someone could ask: "Can you prove this?"
  - About the candidate's own capabilities or history (not general facts)

CLAIM TYPES (use exactly these values):
  "skill"          → A technical or professional skill (must be specific)
  "project"        → A project they built, contributed to, or led
  "certification"  → A formal certificate, qualification, or award
  "experience"     → A role, job, or internship they held
  "leadership"     → Managing, leading, or mentoring people
  "achievement"    → A measurable accomplishment or recognition

WHAT IS NOT A CLAIM (do not extract these):
  - Generic personality traits: "hardworking", "team player", "passionate"
  - Vague intentions: "I want to learn X", "I am interested in Y"
  - Unspecific statements: "I have programming experience"
  - Obvious facts: "I studied at a university"

RULES:
  - Extract between 5 and 20 claims total
  - Be specific: "Python (FastAPI, Django, 2 years)" not just "Python"
  - Rephrase all claims in clear first-person present tense
  - Do not invent anything — only extract what is stated in the text
  - Include a confidence score (0.0 to 1.0) for each claim
    * 1.0 = The candidate explicitly stated this with clear detail
    * 0.7 = Clearly implied with reasonable specificity
    * 0.5 = Inferred from context, less explicit

OUTPUT — return ONLY this JSON, nothing else:
{{
  "claims": [
    {{
      "claim_text": "I have 2 years of Python development experience, \
primarily using FastAPI for building REST APIs.",
      "claim_type": "skill",
      "source_hint": "Work Experience — Backend Developer at XYZ (2022-2024)",
      "confidence": 0.95
    }},
    {{
      "claim_text": "I built a full-stack e-commerce platform with \
Next.js frontend and FastAPI backend as my final year project.",
      "claim_type": "project",
      "source_hint": "Projects section",
      "confidence": 0.9
    }}
  ]
}}

==== CANDIDATE PROFILE ====
{profile_section}

==== RESUME AND DOCUMENTS ====
{documents_section}
"""


def build_profile_section(profile: dict | None) -> str:
    """Formats the candidate profile into a readable text block."""
    if not profile:
        return "No profile information provided."

    lines = []
    if profile.get("full_name"):
        lines.append(f"Name: {profile['full_name']}")
    if profile.get("summary"):
        lines.append(f"\nProfessional Summary:\n{profile['summary']}")
    if profile.get("education"):
        lines.append(f"\nEducation:\n{profile['education']}")
    if profile.get("github_url"):
        lines.append(f"\nGitHub: {profile['github_url']}")
    if profile.get("portfolio_url"):
        lines.append(f"\nPortfolio: {profile['portfolio_url']}")
    if profile.get("linkedin_url"):
        lines.append(f"\nLinkedIn: {profile['linkedin_url']}")

    return "\n".join(lines) if lines else "No profile information provided."


def build_documents_section(documents: list[dict]) -> str:
    """
    Combines extracted text from all documents into one labelled block.
    Skips documents without extracted text.
    """
    sections = []

    for doc in documents:
        text = doc.get("extracted_text")
        if not text or not text.strip():
            continue

        file_type = doc.get("file_type", "document").replace("_", " ").title()
        sections.append(f"--- {file_type} ---\n{text.strip()}")

    if not sections:
        return "No document text available."

    return "\n\n".join(sections)


def extract_claims_from_profile(
    profile: dict | None,
    documents: list[dict],
) -> list[dict]:
    """
    Main entry point: reads the candidate's profile and all document text,
    then calls Gemini to extract structured claims.

    Args:
        profile:   Row from candidate_profiles table (or None)
        documents: Rows from documents table (with extracted_text filled in)

    Returns:
        List of claim dicts, each with:
          claim_text, claim_type, source_hint, confidence (0-1)

    Raises:
        ValueError: if the AI cannot produce usable claims
    """
    profile_section = build_profile_section(profile)
    documents_section = build_documents_section(documents)

    # Check we have something meaningful to work with
    has_content = (
        profile and (profile.get("summary") or profile.get("education"))
    ) or any(
        doc.get("extracted_text") for doc in documents
    )

    if not has_content:
        raise ValueError(
            "No profile text or document content found. "
            "Please complete your profile and upload your resume before extracting claims."
        )

    model = get_model(temperature=0.15)
    prompt = CLAIM_EXTRACTOR_PROMPT.format(
        profile_section=profile_section,
        documents_section=documents_section,
    )

    logger.info(
        f"Sending {len(profile_section) + len(documents_section)} chars to Gemini for claim extraction"
    )

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as e:
        logger.error(f"Gemini API call failed during claim extraction: {e}")
        raise ValueError("Could not reach the AI service. Please try again.")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error(f"Gemini returned invalid JSON: {raw_text[:300]}")
        raise ValueError("AI returned an unreadable response. Please try again.")

    raw_claims = parsed.get("claims", [])
    if not isinstance(raw_claims, list) or not raw_claims:
        raise ValueError(
            "The AI could not find any specific claims in your profile. "
            "Try adding more detail to your professional summary or resume."
        )

    # Validate and normalise each claim
    valid_types = {
        "skill", "project", "certification",
        "experience", "leadership", "achievement"
    }

    cleaned_claims = []
    for claim in raw_claims:
        claim_type = claim.get("claim_type", "skill")
        if claim_type not in valid_types:
            claim_type = "skill"

        claim_text = str(claim.get("claim_text", "")).strip()
        if len(claim_text) < 10:
            continue  # skip empty or nonsense claims

        # Clamp confidence to 0.0–1.0
        try:
            confidence = float(claim.get("confidence", 0.7))
        except (TypeError, ValueError):
            confidence = 0.7
        confidence = round(max(0.0, min(1.0, confidence)), 2)

        cleaned_claims.append({
            "claim_text": claim_text,
            "claim_type": claim_type,
            "source_hint": str(claim.get("source_hint", "")).strip(),
            "confidence": confidence,
        })

    logger.info(f"Extracted {len(cleaned_claims)} validated claims")
    return cleaned_claims