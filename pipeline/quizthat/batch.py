"""Batch question generation."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

from .constants import DEFAULT_MODEL
from .events import EventSink, emit
from .agent.runner import generate_question_with_agent

logger = logging.getLogger(__name__)
console = Console()


def generate_batch(
    category: str,
    subcategory: str,
    difficulty: str,
    count: int,
    question_type: str = "multiple_choice",
    languages: list[str] | None = None,
    dry_run: bool = False,
    model: str = DEFAULT_MODEL,
    on_event: EventSink = None,
) -> None:
    """
    Generate a batch of questions.

    With `on_event` set, progress is reported as events and nothing is drawn —
    see `generate_single` for why the two cannot share stdout.
    """
    if languages is None:
        languages = ["en", "de"]

    batch_id = f"batch-{datetime.now(timezone.utc).strftime('%Y-%m-%d-%H%M%S')}"
    lang_str = ", ".join(languages)

    if on_event is not None:
        _generate_batch_headless(
            category=category,
            subcategory=subcategory,
            difficulty=difficulty,
            count=count,
            question_type=question_type,
            languages=languages,
            dry_run=dry_run,
            model=model,
            batch_id=batch_id,
            on_event=on_event,
        )
        return

    console.print(
        f"\n  [bold]Batch:[/bold] {count} {difficulty} {category}/{subcategory} "
        f"questions ({lang_str})"
    )
    console.print(f"  [dim]Batch ID: {batch_id}[/dim]")

    if dry_run:
        console.print("\n  [yellow]Dry run mode — no questions will be generated.[/yellow]")
        for i in range(count):
            console.print(
                f"  Would generate: {difficulty} {question_type} in "
                f"{category}/{subcategory} [{lang_str}]"
            )
        return

    generated = 0
    failed = 0
    duplicates = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"Generating {count} questions", total=count)

        for i in range(count):
            prompt = _prompt_for(difficulty, question_type, category, subcategory)

            try:
                asyncio.run(
                    generate_question_with_agent(
                        prompt=prompt,
                        category=category,
                        subcategory=subcategory,
                        difficulty=difficulty,
                        question_type=question_type,
                        languages=languages,
                        batch_id=batch_id,
                        model=model,
                    )
                )
                generated += 1
            except Exception as e:
                logger.error("Failed to generate question %d: %s", i + 1, e)
                failed += 1

            progress.update(task, advance=1)

    console.print(
        f"\n  [bold]Batch complete:[/bold] "
        f"[green]{generated} generated[/green]  "
        f"[red]{failed} failed[/red]  "
        f"[yellow]{duplicates} duplicates[/yellow]"
    )


def _prompt_for(difficulty: str, question_type: str, category: str, subcategory: str) -> str:
    """The per-question prompt. One place, so both paths ask for the same thing."""
    return (
        f"Generate an interesting {difficulty} {question_type} "
        f"question about {subcategory} (category: {category}). "
        f"Make it unique and engaging."
    )


def _generate_batch_headless(
    category: str,
    subcategory: str,
    difficulty: str,
    count: int,
    question_type: str,
    languages: list[str],
    dry_run: bool,
    model: str,
    batch_id: str,
    on_event: EventSink,
) -> None:
    """A batch, reported as events."""
    from .generate import _generate_single_headless

    emit(
        on_event,
        "run_started",
        total=count,
        batch_id=batch_id,
        category=category,
        subcategory=subcategory,
        difficulty=difficulty,
        question_type=question_type,
        languages=languages,
        model=model,
        dry_run=dry_run,
    )

    if dry_run:
        emit(on_event, "run_finished", generated=0, failed=0, dry_run=True)
        return

    generated = 0
    failed = 0
    # Sequentially, as the Rich path does: each question runs its own agent, and
    # several at once would race on the corpus check that avoids duplicates.
    for index in range(count):
        written = _generate_single_headless(
            prompt=_prompt_for(difficulty, question_type, category, subcategory),
            category=category,
            subcategory=subcategory,
            difficulty=difficulty,
            question_type=question_type,
            languages=languages,
            model=model,
            on_event=on_event,
            batch_id=batch_id,
            index=index,
            total=count,
        )
        if written is not None:
            generated += 1
        else:
            failed += 1

    emit(on_event, "run_finished", generated=generated, failed=failed, batch_id=batch_id)
