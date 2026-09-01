"""Generation commands mixin for the CLI."""

from __future__ import annotations

import rich_click as click

from quizthat.cli.constants import (
    DEFAULT_LANGUAGES,
    DEFAULT_MODEL,
    DIFFICULTY_CHOICES,
    QUESTION_TYPE_CHOICES,
)


class GenerationCommandsMixin:
    """Mixin providing ``generate`` and ``generate-batch`` commands."""

    @click.command("generate")
    @click.pass_obj
    @click.argument("prompt")
    @click.option("-c", "--category", required=True, help="Major category name")
    @click.option("-s", "--subcategory", required=True, help="Subcategory name")
    @click.option(
        "-d",
        "--difficulty",
        type=click.Choice(DIFFICULTY_CHOICES),
        default="medium",
        help="Question difficulty",
    )
    @click.option(
        "-t",
        "--type",
        "question_type",
        type=click.Choice(QUESTION_TYPE_CHOICES),
        default="multiple_choice",
        help="Question type",
    )
    @click.option(
        "-l",
        "--languages",
        default=DEFAULT_LANGUAGES,
        help="Comma-separated language codes",
    )
    @click.option("-v", "--validate", is_flag=True, help="Run validation after generation")
    @click.option("-m", "--model", default=DEFAULT_MODEL, help="Model to use")
    def generate_command(
        self,
        prompt: str,
        category: str,
        subcategory: str,
        difficulty: str,
        question_type: str,
        languages: str,
        validate: bool,
        model: str,
    ) -> None:
        """Generate a single question from a prompt."""
        from quizthat.generate import generate_single

        lang_list = [lang.strip() for lang in languages.split(",")]

        generate_single(
            prompt=prompt,
            category=category,
            subcategory=subcategory,
            difficulty=difficulty,
            question_type=question_type,
            languages=lang_list,
            validate=validate,
            model=model,
        )

    @click.command("generate-batch")
    @click.pass_obj
    @click.option("-c", "--category", required=True, help="Major category name")
    @click.option("-s", "--subcategory", required=True, help="Subcategory name")
    @click.option(
        "-d",
        "--difficulty",
        type=click.Choice(DIFFICULTY_CHOICES),
        default="medium",
    )
    @click.option("-n", "--count", default=10, help="Number of questions to generate")
    @click.option(
        "-t",
        "--type",
        "question_type",
        type=click.Choice(QUESTION_TYPE_CHOICES),
        default="multiple_choice",
    )
    @click.option(
        "-l",
        "--languages",
        default=DEFAULT_LANGUAGES,
        help="Comma-separated language codes",
    )
    @click.option("--dry-run", is_flag=True, help="Preview without generating")
    @click.option("-m", "--model", default=DEFAULT_MODEL, help="Model to use")
    def generate_batch_command(
        self,
        category: str,
        subcategory: str,
        difficulty: str,
        count: int,
        question_type: str,
        languages: str,
        dry_run: bool,
        model: str,
    ) -> None:
        """Generate a batch of questions."""
        from quizthat.batch import generate_batch

        lang_list = [lang.strip() for lang in languages.split(",")]

        generate_batch(
            category=category,
            subcategory=subcategory,
            difficulty=difficulty,
            count=count,
            question_type=question_type,
            languages=lang_list,
            dry_run=dry_run,
            model=model,
        )
