"""
Core agent loop — the Gemini function-calling engine.

Shared by both recruiter and candidate agents.
The only difference between them is which tools and role string are passed in.

Flow per user turn:
  1. Format DB message history into Gemini's expected format
  2. Prepend page context to the user's message
  3. Start a Gemini chat session with the existing history
  4. Send the user's message
  5. If Gemini calls tools → execute them → send results back → repeat
  6. When Gemini produces a plain text response → return it
"""
import logging
import google.generativeai as genai
from app.ai.agent_gemini_client import get_agent_model

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 10


def _format_history(messages: list[dict]) -> list[dict]:
    """
    Converts DB message rows into Gemini's chat history format.

    DB stores:    role = "user" | "assistant"
    Gemini needs: role = "user" | "model"

    Only plain text messages are stored in the DB — tool call/response
    pairs that happened inside a previous turn are not recorded.
    That is intentional: the DB holds what the user sees, not the
    internal reasoning steps.
    """
    history = []
    for msg in messages:
        gemini_role = "model" if msg["role"] == "assistant" else "user"
        history.append({
            "role": gemini_role,
            "parts": [msg["content"]],
        })
    return history


def _build_context_prefix(context: dict | None) -> str:
    """
    Converts the frontend page context dict into a short text prefix
    prepended to the user's message.

    This tells the agent where the user is without them having to say it.
    Gemini reads it as part of the message, not as a separate system turn.

    Example input:  {"page": "recruiter_candidates", "job_id": "abc-123"}
    Example output: "[Context: page=recruiter_candidates, job_id=abc-123]\n"
    """
    if not context:
        return ""
    parts = [f"{k}={v}" for k, v in context.items() if v]
    if not parts:
        return ""
    return f"[Context: {', '.join(parts)}]\n"


def _build_tool_map(tools: list) -> dict:
    """
    Builds a name → callable map from the tools list.
    Used to look up and call the right function when Gemini issues a tool call.
    """
    return {fn.__name__: fn for fn in tools}


def run_agent(
    user_message: str,
    history: list[dict],
    tools: list,
    role: str,
    context: dict | None = None,
) -> str:
    """
    Runs one full agent turn and returns the final text response.

    Args:
        user_message: The text the user just typed in the chat drawer.
        history:      All previous messages in this session, loaded from DB.
                      Each item: {"role": "user"|"assistant", "content": "..."}
        tools:        Tool functions from make_recruiter_tools() or make_candidate_tools().
        role:         "recruiter" or "candidate" — picks the system prompt.
        context:      Page context from the frontend.
                      e.g. {"page": "recruiter_candidates", "job_id": "abc-123"}

    Returns:
        The agent's final natural-language response as a plain string.

    Raises:
        RuntimeError: If the loop exceeds MAX_TOOL_ITERATIONS.
        ValueError:   If Gemini returns an empty or unreadable response.
    """
    model = get_agent_model(tools=tools, role=role)
    tool_map = _build_tool_map(tools)

    formatted_history = _format_history(history)
    context_prefix = _build_context_prefix(context)
    full_message = f"{context_prefix}{user_message}" if context_prefix else user_message

    logger.info(
        f"Agent turn start — role={role}, "
        f"history={len(history)} messages, tools={list(tool_map.keys())}"
    )

    chat = model.start_chat(history=formatted_history)
    response = chat.send_message(full_message)

    for iteration in range(MAX_TOOL_ITERATIONS):
        # Collect all function call parts from this response
        function_calls = [
            part for part in response.parts
            if hasattr(part, "function_call") and part.function_call.name
        ]

        if not function_calls:
            # No tool calls — Gemini has produced its final text response
            break

        logger.info(f"Iteration {iteration + 1}: {len(function_calls)} tool call(s)")

        # Execute every tool Gemini requested, collect the results
        tool_response_parts = []
        for part in function_calls:
            fn_call = part.function_call
            tool_name = fn_call.name
            tool_args = dict(fn_call.args)

            logger.info(f"  → {tool_name}({tool_args})")

            if tool_name not in tool_map:
                tool_result = {"error": f"Unknown tool: '{tool_name}'"}
            else:
                try:
                    tool_result = tool_map[tool_name](**tool_args)
                except Exception as e:
                    logger.error(f"Tool '{tool_name}' raised: {e}")
                    tool_result = {"error": str(e)}

            logger.info(f"  ← {tool_name} result: {str(tool_result)[:150]}")

            tool_response_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=tool_name,
                        response={"result": tool_result},
                    )
                )
            )

        # Send all tool results back to Gemini in one message
        response = chat.send_message(tool_response_parts)

    else:
        # The for loop exhausted all iterations without hitting break.
        # Gemini kept calling tools without ever giving a final answer.
        raise RuntimeError(
            f"Agent loop hit the {MAX_TOOL_ITERATIONS}-iteration safety limit "
            "without producing a final response. This should not happen in normal use."
        )

    # Extract the final text
    try:
        final_text = response.text
    except Exception:
        raise ValueError("Agent produced a response with no readable text.")

    if not final_text or not final_text.strip():
        raise ValueError("Agent returned an empty response.")

    logger.info(f"Agent turn complete — {len(final_text)} chars")
    return final_text.strip()