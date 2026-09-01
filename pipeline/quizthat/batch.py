"""Batch question generation."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

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
    model: str = "claude-sonnet-4-20250514",
) -> None:
    """Generate a batch of questions."""
    if languages is None:
        languages = ["en", "de"]

    batch_id = f"batch-{datetime.now(timezone.utc).strftime('%Y-%m-%d-%H%M%S')}"
    lang_str = ", ".join(languages)

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
            prompt = (
                f"Generate an interesting {difficulty} {question_type} "
                f"question about {subcategory} (category: {category}). "
                f"Make it unique and engaging."
            )

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
