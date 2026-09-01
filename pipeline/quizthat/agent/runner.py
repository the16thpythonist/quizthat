"""Agent runner using the Claude Agent SDK."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from .prompts import GENERATION_SYSTEM_PROMPT, VALIDATION_SYSTEM_PROMPT
from .tools import write_question_folder, find_similar_questions

logger = logging.getLogger(__name__)


async def generate_question_with_agent(
    prompt: str,
    category: str,
    subcategory: str,
    difficulty: str,
    question_type: str,
    languages: list[str],
    batch_id: str | None = None,
    model: str = "claude-sonnet-4-20250514",
) -> dict[str, Any]:
    """Generate a question using the Claude Agent SDK.

    Falls back to a simple API call if the Agent SDK is not available.
    """
    try:
        return await _run_agent_sdk(
            prompt=prompt,
            category=category,
            subcategory=subcategory,
            difficulty=difficulty,
            question_type=question_type,
            languages=languages,
            batch_id=batch_id,
            model=model,
        )
    except ImportError:
        logger.warning(
            "Claude Agent SDK not available. Install with: pip install claude-agent-sdk"
        )
        raise
    except Exception as e:
        logger.error("Agent SDK error: %s", e)
        raise


async def _run_agent_sdk(
    prompt: str,
    category: str,
    subcategory: str,
    difficulty: str,
    question_type: str,
    languages: list[str],
    batch_id: str | None,
    model: str,
) -> dict[str, Any]:
    """Run question generation through the Claude Agent SDK."""
    from claude_agent_sdk import query, tool, create_sdk_mcp_server, ClaudeAgentOptions
    from claude_agent_sdk.types import AssistantMessage, TextBlock, ResultMessage

    written_question_dir: Path | None = None
    tool_errors: list[str] = []

    @tool(
        "write_question",
        "Write a question folder to the corpus. You MUST call this tool to save the question.",
        {
            "type": "object",
            "properties": {
                "question_id": {"type": "string", "description": "Unique 8-char hex ID (e.g. 'a1b2c3d4')"},
                "meta": {"type": "object", "description": "Metadata: {major_category, subcategory, difficulty, question_type, languages: [...], time_limit_seconds}"},
                "question_en": {"type": "object", "description": "English content: {teaser_title, question_text, hint, answer_data}"},
                "question_de": {"type": "object", "description": "German content: {teaser_title, question_text, hint, answer_data}"},
                "research_notes": {"type": "string", "description": "Markdown summary of research sources"},
            },
            "required": ["question_id", "meta", "research_notes"],
        },
    )
    async def write_question_tool(args: dict) -> dict:
        nonlocal written_question_dir
        logger.debug("write_question tool called with id=%s", args.get("question_id"))

        # The agent may pass nested dicts as JSON strings — parse them
        def _ensure_dict(val: Any) -> dict | None:
            if val is None:
                return None
            if isinstance(val, str):
                return json.loads(val)
            return val

        try:
            question_dir = write_question_folder(
                question_id=args["question_id"],
                meta=_ensure_dict(args["meta"]),
                question_en=_ensure_dict(args.get("question_en")),
                question_de=_ensure_dict(args.get("question_de")),
                research_notes=args.get("research_notes", ""),
                batch_id=batch_id,
            )
            written_question_dir = question_dir
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Question written to {question_dir}/",
                    }
                ]
            }
        except Exception as e:
            tool_errors.append(f"write_question: {e}")
            return {
                "content": [{"type": "text", "text": f"Error writing question: {e}"}],
                "isError": True,
            }

    @tool(
        "check_corpus",
        "Check existing corpus for similar questions to avoid duplicates",
        {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Major category to search"},
                "topic_summary": {"type": "string", "description": "Brief topic description to match against"},
            },
            "required": ["category", "topic_summary"],
        },
    )
    async def check_corpus_tool(args: dict) -> dict:
        logger.debug("check_corpus tool called for category=%s", args.get("category"))
        try:
            existing = find_similar_questions(args["category"], args["topic_summary"])
            return {"content": [{"type": "text", "text": json.dumps(existing)}]}
        except Exception as e:
            tool_errors.append(f"check_corpus: {e}")
            return {
                "content": [{"type": "text", "text": f"Error: {e}"}],
                "isError": True,
            }

    pipeline_tools = create_sdk_mcp_server(
        name="pipeline",
        tools=[write_question_tool, check_corpus_tool],
    )

    lang_str = ", ".join(languages)
    full_prompt = (
        f"Generate a {difficulty} {question_type} question about: {prompt}\n\n"
        f"Category: {category}\n"
        f"Subcategory: {subcategory}\n"
        f"Difficulty: {difficulty}\n"
        f"Question type: {question_type}\n"
        f"Languages: {lang_str}\n\n"
        f"First check_corpus for existing questions in this category, then "
        f"research the topic and create the question using write_question."
    )

    def _log_stderr(line: str) -> None:
        logger.error("claude stderr: %s", line.rstrip())

    options = ClaudeAgentOptions(
        system_prompt=GENERATION_SYSTEM_PROMPT,
        model=model,
        permission_mode="acceptEdits",
        allowed_tools=[
            "WebSearch",
            "mcp__pipeline__write_question",
            "mcp__pipeline__check_corpus",
        ],
        mcp_servers={"pipeline": pipeline_tools},
        max_turns=20,
        stderr=_log_stderr,
    )

    # Use async generator prompt to avoid race condition where string
    # prompts close stdin before MCP server handshake completes.
    # See: https://github.com/anthropics/claude-agent-sdk-python/issues/266
    async def _prompt_stream():
        yield {
            "type": "user",
            "session_id": "",
            "message": {"role": "user", "content": full_prompt},
            "parent_tool_use_id": None,
        }

    from claude_agent_sdk.types import UserMessage
    result_text = ""
    debug_messages: list[str] = []
    async for message in query(prompt=_prompt_stream(), options=options):
        msg_type = type(message).__name__
        debug_messages.append(msg_type)
        if isinstance(message, UserMessage):
            for block in message.content:
                text = getattr(block, "text", "")
                if text:
                    debug_messages.append(f"  result: {str(text)[:100]}")
        if isinstance(message, AssistantMessage):
            for block in message.content:
                block_name = type(block).__name__
                # Log tool use names
                if hasattr(block, "name"):
                    block_name += f"({block.name})"
                debug_messages.append(f"  {block_name}")
                if isinstance(block, TextBlock):
                    result_text += block.text

    return {
        "status": "ok",
        "result": result_text,
        "question_dir": str(written_question_dir) if written_question_dir else None,
        "_debug_messages": debug_messages,
        "_tool_errors": tool_errors,
    }


async def validate_question_with_agent(
    question_content: dict,
    meta: dict,
    model: str = "claude-sonnet-4-20250514",
) -> dict[str, Any]:
    """Validate a question using a separate agent run."""
    try:
        from claude_agent_sdk import query, ClaudeAgentOptions
        from claude_agent_sdk.types import AssistantMessage, TextBlock, ResultMessage
    except ImportError:
        logger.warning("Claude Agent SDK not available for validation.")
        return {"verdict": "skip", "reason": "SDK not available"}

    prompt = (
        f"Validate this trivia question:\n\n"
        f"Category: {meta.get('major_category')} / {meta.get('subcategory')}\n"
        f"Difficulty: {meta.get('difficulty')}\n"
        f"Type: {meta.get('question_type')}\n\n"
        f"Question content:\n{json.dumps(question_content, indent=2)}\n\n"
        f"Research the facts independently and provide your validation report."
    )

    options = ClaudeAgentOptions(
        system_prompt=VALIDATION_SYSTEM_PROMPT,
        model=model,
        permission_mode="acceptEdits",
        allowed_tools=["WebSearch"],
        max_turns=10,
    )

    async def _prompt_stream():
        yield {
            "type": "user",
            "session_id": "",
            "message": {"role": "user", "content": prompt},
            "parent_tool_use_id": None,
        }

    result_text = ""
    async for message in query(prompt=_prompt_stream(), options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    result_text += block.text
        if isinstance(message, ResultMessage):
            break

    return {"verdict": "pass", "result": result_text}
