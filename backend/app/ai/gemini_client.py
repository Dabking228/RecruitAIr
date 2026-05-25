"""
Shared Gemini client configuration.
All AI services import get_model() from here — never configure
Gemini directly in individual service files.
"""
import google.generativeai as genai
from app.config import settings

# Configure once at module import time.
# This is safe because the module is loaded once when the app starts.
genai.configure(api_key=settings.GEMINI_API_KEY)


def get_model(
    temperature: float = 0.1,
    model_name: str = "gemini-2.5-flash",
) -> genai.GenerativeModel:
    """
    Returns a configured Gemini model instance.

    Args:
        temperature: 0.0 = deterministic, 1.0 = creative.
                     Use 0.1 for extraction, 0.7 for generation.
        model_name:  Always use "gemini-2.5-flash" for MVP.
                     It is free-tier friendly and fast.
    """
    return genai.GenerativeModel(
        model_name=model_name,
        generation_config=genai.GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",  # Force JSON output
        ),
    )