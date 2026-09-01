"""Question validation logic."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from ..schemas import (
    QuestionMeta,
    QuestionContent,
    MultipleChoiceAnswerData,
    SortingAnswerData,
    MapLocationAnswerData,
    CalculationAnswerData,
)

logger = logging.getLogger(__name__)


def validate_question_folder(question_dir: Path) -> list[str]:
    """Validate a question folder for structural correctness.

    Returns a list of error messages (empty if valid).
    """
    errors: list[str] = []

    meta_path = question_dir / "meta.json"
    if not meta_path.exists():
        errors.append("Missing meta.json")
        return errors

    try:
        meta_data = json.loads(meta_path.read_text(encoding="utf-8"))
        meta = QuestionMeta(**meta_data)
    except Exception as e:
        errors.append(f"Invalid meta.json: {e}")
        return errors

    # Check language files exist
    for lang in meta.languages:
        lang_path = question_dir / f"question.{lang}.json"
        if not lang_path.exists():
            errors.append(f"Missing question.{lang}.json (listed in meta.languages)")
            continue

        try:
            content_data = json.loads(lang_path.read_text(encoding="utf-8"))
            content = QuestionContent(**content_data)
        except Exception as e:
            errors.append(f"Invalid question.{lang}.json: {e}")
            continue

        # Validate answer_data based on question_type
        answer_errors = _validate_answer_data(
            content.answer_data, meta.question_type, lang
        )
        errors.extend(answer_errors)

    return errors


def _validate_answer_data(
    answer_data: dict, question_type: str, lang: str
) -> list[str]:
    """Validate answer_data matches the question_type schema."""
    errors: list[str] = []

    try:
        if question_type == "multiple_choice":
            MultipleChoiceAnswerData(**answer_data)
        elif question_type == "sorting":
            data = SortingAnswerData(**answer_data)
            if len(data.correct_order) != len(data.items):
                errors.append(
                    f"[{lang}] sorting: correct_order length "
                    f"({len(data.correct_order)}) != items length ({len(data.items)})"
                )
        elif question_type == "map_location":
            MapLocationAnswerData(**answer_data)
        elif question_type == "calculation":
            CalculationAnswerData(**answer_data)
        else:
            errors.append(f"Unknown question_type: {question_type}")
    except Exception as e:
        errors.append(f"[{lang}] answer_data validation failed: {e}")

    return errors


def validate_corpus(questions_dir: Path) -> dict[str, list[str]]:
    """Validate all questions in the corpus.

    Returns a dict of question_id -> list of errors.
    Only includes questions with errors.
    """
    results: dict[str, list[str]] = {}

    if not questions_dir.exists():
        return results

    for item in sorted(questions_dir.iterdir()):
        if not item.is_dir():
            continue
        if item.name.startswith(".") or item.name == "corpus-index.json":
            continue

        errors = validate_question_folder(item)
        if errors:
            results[item.name] = errors

    return results
