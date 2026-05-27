"""
Agent-specific Gemini client.

Why not modify gemini_client.py?
The existing get_model() forces response_mime_type="application/json".
That setting is incompatible with function calling — Gemini cannot
produce tool calls under a forced JSON mime type.
Agents return natural language + optional tool calls, so no mime type is set here.
"""
import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)

_SYSTEM_PROMPTS = {
    "recruiter": """\
You are RecruitAIr Copilot, an AI assistant for recruiters inside the RecruitAIr platform.

You help recruiters:
- Review and compare candidates for a job
- Understand match scores and evidence quality
- Generate interview questions and email drafts
- Make faster, evidence-backed hiring decisions

RULES:
- Always call a tool to fetch real data before stating scores, names, or statistics.
- Keep responses concise and actionable — no lengthy preambles.
- When directing to a page, briefly explain why the user should go there.
- Never fabricate candidate data or scores.
""",

    "candidate": """\
You are RecruitAIr Assistant, an AI assistant for candidates inside the RecruitAIr platform.

You help candidates:
- Extract and manage professional claims from uploaded documents
- Preview how well they match a job before applying
- Understand what evidence to add to strengthen their profile
- Get guidance on improving their application

RULES:
- Always call a tool to fetch real data before giving scores or claim details.
- Be encouraging but honest — tell candidates specifically what to improve.
- When directing to a page, explain what action to take there.
- Never fabricate job requirements or profile data.
""",
}


def get_agent_model(tools: list, role: str = "recruiter") -> genai.GenerativeModel:
    """
    Returns a Gemini model configured for agentic use.

    Key differences from get_model() in gemini_client.py:
    - No response_mime_type — agents return text, not raw JSON
    - tools parameter enables function calling
    - system_instruction gives the agent its identity and rules
    - Temperature 0.7 — conversational but not too creative

    Args:
        tools: List of Python callables. Gemini automatically extracts
               their schema from type hints and docstrings.
               Every tool function MUST have type hints + a docstring.
        role:  "recruiter" or "candidate" — selects the system prompt.
    """
    system_prompt = _SYSTEM_PROMPTS.get(role, _SYSTEM_PROMPTS["recruiter"])

    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.7,
        ),
        tools=tools,
        system_instruction=system_prompt,
    )