"""Custom MCP tools for the question generation agent."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from ..schemas import QuestionMeta, QuestionContent


def get_questions_dir() -> Path:
    """Get the questions output directory."""
    return Path(os.environ.get("QUIZTHAT_QUESTIONS_DIR", "questions"))


def write_question_folder(
    question_id: str,
    meta: dict,
    question_en: dict | None,
    question_de: dict | None,
    research_notes: str,
    batch_id: str | None = None,
) -> Path:
    """Write a complete question folder to disk.

    Returns the path to the created question folder.
    """
    questions_dir = get_questions_dir()
    question_dir = questions_dir / question_id
    question_dir.mkdir(parents=True, exist_ok=True)

    # Determine languages
    languages = []
    if question_en:
        languages.append("en")
    if question_de:
        languages.append("de")

    # Build and validate meta
    meta_obj = QuestionMeta(
        id=question_id,
        languages=languages,
        major_category=meta.get("major_category", ""),
        subcategory=meta.get("subcategory", ""),
        difficulty=meta.get("difficulty", "medium"),
        question_type=meta.get("question_type", "multiple_choice"),
        time_limit_seconds=meta.get("time_limit_seconds"),
        version=1,
        created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        generation_batch=batch_id,
    )

    (question_dir / "meta.json").write_text(
        json.dumps(meta_obj.model_dump(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Write language-specific content
    if question_en:
        content_en = QuestionContent(**question_en)
        (question_dir / "question.en.json").write_text(
            json.dumps(content_en.model_dump(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    if question_de:
        content_de = QuestionContent(**question_de)
        (question_dir / "question.de.json").write_text(
            json.dumps(content_de.model_dump(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    # Create audio directory (placeholder)
    (question_dir / "audio").mkdir(exist_ok=True)

    # Write generation audit trail
    gen_dir = question_dir / "generation"
    gen_dir.mkdir(exist_ok=True)

    if research_notes:
        (gen_dir / "research.md").write_text(research_notes, encoding="utf-8")

    log_entry = {
        "model": "claude-sonnet-4-20250514",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "batch_id": batch_id,
        "question_id": question_id,
    }
    (gen_dir / "log.json").write_text(
        json.dumps(log_entry, indent=2) + "\n", encoding="utf-8"
    )

    return question_dir


def find_similar_questions(category: str, topic_summary: str) -> list[dict]:
    """Check the existing corpus for questions in the same category/topic.

    Returns a list of existing question summaries for duplicate avoidance.
    """
    questions_dir = get_questions_dir()
    similar = []

    if not questions_dir.exists():
        return similar

    for meta_path in questions_dir.glob("*/meta.json"):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("major_category", "").lower() == category.lower():
                # Load English content for comparison
                en_path = meta_path.parent / "question.en.json"
                if en_path.exists():
                    content = json.loads(en_path.read_text(encoding="utf-8"))
                    similar.append(
                        {
                            "id": meta.get("id"),
                            "category": meta.get("major_category"),
                            "subcategory": meta.get("subcategory"),
                            "teaser": content.get("teaser_title"),
                            "question": content.get("question_text"),
                        }
                    )
        except (json.JSONDecodeError, OSError):
            continue

    return similar
