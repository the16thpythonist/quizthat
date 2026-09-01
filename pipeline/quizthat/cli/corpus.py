"""Corpus commands mixin for the CLI."""

from __future__ import annotations

from pathlib import Path

import rich_click as click
from rich.console import Console

from quizthat.cli.constants import (
    DEFAULT_QUESTIONS_DIR,
    DIFFICULTY_CHOICES,
    QUESTION_TYPE_CHOICES,
)

_SORT_CHOICES = ["id", "category", "difficulty", "type", "created"]


def _create_corpus_group() -> click.Group:
    """Build the ``corpus`` subgroup with its subcommands."""

    @click.group("corpus")
    def corpus() -> None:
        """Corpus management commands."""

    @corpus.command()
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    def stats(questions_dir: str) -> None:
        """Show corpus statistics."""
        from quizthat.corpus import corpus_stats

        corpus_stats(Path(questions_dir))

    @corpus.command()
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    @click.option("--languages", default=None, help="Filter by languages (comma-separated)")
    @click.option("--json", "as_json", is_flag=True, help="Machine-readable JSON output")
    def gaps(questions_dir: str, languages: str | None, as_json: bool) -> None:
        """Show underpopulated category/difficulty buckets."""
        from quizthat.corpus import corpus_gaps

        lang_list = [l.strip() for l in languages.split(",")] if languages else None
        corpus_gaps(Path(questions_dir), lang_list, as_json)

    @corpus.command()
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    def validate(questions_dir: str) -> None:
        """Validate all questions in the corpus."""
        from quizthat.validation.validator import validate_corpus

        console = Console()
        results = validate_corpus(Path(questions_dir))

        if not results:
            console.print("[green]All questions are valid.[/green]")
            return

        for qid, errors in results.items():
            console.print(f"\n[red]{qid}:[/red]")
            for error in errors:
                console.print(f"  - {error}")

        console.print(f"\n[yellow]{len(results)} questions with errors[/yellow]")

    @corpus.command("list")
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    @click.option(
        "--sort",
        "sort_key",
        type=click.Choice(_SORT_CHOICES),
        default="id",
        help="Sort column",
    )
    @click.option("--reverse", is_flag=True, help="Reverse sort order")
    @click.option("--category", default=None, help="Filter by category")
    @click.option(
        "--difficulty",
        default=None,
        type=click.Choice(DIFFICULTY_CHOICES),
        help="Filter by difficulty",
    )
    @click.option(
        "--type",
        "question_type",
        default=None,
        type=click.Choice(QUESTION_TYPE_CHOICES),
        help="Filter by question type",
    )
    @click.option("--language", default=None, help="Filter by language code")
    def list_cmd(
        questions_dir: str,
        sort_key: str,
        reverse: bool,
        category: str | None,
        difficulty: str | None,
        question_type: str | None,
        language: str | None,
    ) -> None:
        """List all questions in the corpus."""
        from quizthat.corpus import corpus_list

        corpus_list(
            Path(questions_dir),
            sort=sort_key,
            reverse=reverse,
            category=category,
            difficulty=difficulty,
            question_type=question_type,
            language=language,
        )

    @corpus.command()
    @click.argument("query")
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    @click.option("--language", default=None, help="Restrict search to a language code")
    def search(query: str, questions_dir: str, language: str | None) -> None:
        """Search questions by relevance."""
        from quizthat.corpus import corpus_search

        corpus_search(Path(questions_dir), query, language=language)

    return corpus


class CorpusCommandsMixin:
    """Mixin providing the ``corpus`` command group (stats, gaps, validate)."""

    corpus_group = _create_corpus_group()
