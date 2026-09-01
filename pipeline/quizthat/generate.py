"""Single question generation with multi-stage live progress display."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .agent.runner import generate_question_with_agent, validate_question_with_agent
from .tts.client import generate_all_voice_lines
from .agent.tools import get_questions_dir

logger = logging.getLogger(__name__)
console = Console()


class StageTracker:
    """Tracks multi-stage progress for the live display."""

    SPINNER_CHARS = ["|", "/", "-", "\\"]

    def __init__(self) -> None:
        self.stages: list[dict] = []
        self._tick = 0

    def add_stage(self, name: str, detail: str = "") -> int:
        idx = len(self.stages)
        self.stages.append(
            {"name": name, "detail": detail, "status": "pending", "result": ""}
        )
        return idx

    def start(self, idx: int, detail: str = "") -> None:
        self.stages[idx]["status"] = "running"
        if detail:
            self.stages[idx]["detail"] = detail

    def complete(self, idx: int, result: str = "") -> None:
        self.stages[idx]["status"] = "done"
        if result:
            self.stages[idx]["result"] = result

    def fail(self, idx: int, error: str = "") -> None:
        self.stages[idx]["status"] = "failed"
        if error:
            self.stages[idx]["result"] = error

    def render(self) -> Table:
        self._tick += 1
        table = Table(show_header=False, box=None, padding=(0, 1))
        table.add_column(width=2)
        table.add_column(min_width=28)
        table.add_column()

        for stage in self.stages:
            status = stage["status"]
            if status == "pending":
                icon = Text("  ", style="dim")
                name = Text(stage["name"], style="dim")
                detail = Text(stage["detail"], style="dim")
            elif status == "running":
                char = self.SPINNER_CHARS[self._tick % len(self.SPINNER_CHARS)]
                icon = Text(char, style="bold blue")
                name = Text(stage["name"], style="bold")
                detail = Text(stage["detail"], style="dim")
            elif status == "done":
                icon = Text("v", style="bold green")
                name = Text(stage["name"], style="green")
                detail = Text(stage["result"], style="dim green")
            else:  # failed
                icon = Text("x", style="bold red")
                name = Text(stage["name"], style="red")
                detail = Text(stage["result"], style="dim red")

            table.add_row(icon, name, detail)

        return table


def display_question_card(question_dir: Path) -> None:
    """Read generated question files and display a Rich summary card."""
    meta_path = question_dir / "meta.json"
    if not meta_path.exists():
        console.print(f"[yellow]No meta.json found in {question_dir}[/yellow]")
        return

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    question_id = meta.get("id", "?")
    category = meta.get("major_category", "?")
    subcategory = meta.get("subcategory", "?")
    difficulty = meta.get("difficulty", "?")
    q_type = meta.get("question_type", "?")
    langs = meta.get("languages", [])

    # Load content for each language
    contents: dict[str, dict] = {}
    for lang in langs:
        content_path = question_dir / f"question.{lang}.json"
        if content_path.exists():
            contents[lang] = json.loads(content_path.read_text(encoding="utf-8"))

    # Use first available language for the primary display
    primary = contents.get("en") or next(iter(contents.values()), None)
    if not primary:
        console.print(f"[yellow]No question content found in {question_dir}[/yellow]")
        return

    title = primary.get("teaser_title", "")
    question_text = primary.get("question_text", "")
    hint = primary.get("hint", "")
    answer_data = primary.get("answer_data", {})

    # Build the card content
    lines: list[str] = []

    # Question text
    lines.append(f"[bold white]{question_text}[/bold white]")
    lines.append("")

    # Answer options — render based on question type
    if q_type == "multiple_choice" and "options" in answer_data:
        correct_idx = answer_data.get("correct_index", -1)
        labels = "ABCD"
        for i, option in enumerate(answer_data["options"]):
            if i == correct_idx:
                lines.append(f"  [bold green]{labels[i]})[/bold green] [green]{option}[/green]")
            else:
                lines.append(f"  [dim]{labels[i]})[/dim] {option}")
    elif q_type == "sorting" and "items" in answer_data:
        order = answer_data.get("correct_order", [])
        metric = answer_data.get("metric", "")
        if metric:
            lines.append(f"  [dim]Sort by:[/dim] {metric}")
        for rank, idx in enumerate(order, 1):
            item = answer_data["items"][idx] if idx < len(answer_data["items"]) else "?"
            lines.append(f"  [green]{rank}.[/green] {item}")
    elif q_type == "map_location" and "target" in answer_data:
        target = answer_data["target"]
        lines.append(f"  [green]Target:[/green] {target.get('lat', '?')}°, {target.get('lng', '?')}°")
    elif q_type == "calculation" and "correct_value" in answer_data:
        val = answer_data["correct_value"]
        unit = answer_data.get("unit", "")
        tol = answer_data.get("tolerance", 0)
        lines.append(f"  [green]Answer:[/green] {val} {unit} [dim](±{tol})[/dim]")

    # Hint
    if hint:
        lines.append("")
        lines.append(f"[dim]Hint:[/dim] [italic]{hint}[/italic]")

    # Metadata footer
    diff_colors = {"easy": "green", "medium": "yellow", "hard": "red"}
    diff_style = diff_colors.get(difficulty, "white")
    lines.append("")
    lines.append(
        f"[dim]Category:[/dim] [cyan]{category}[/cyan] / [cyan]{subcategory}[/cyan]  "
        f"[dim]Difficulty:[/dim] [{diff_style}]{difficulty}[/{diff_style}]  "
        f"[dim]Type:[/dim] [magenta]{q_type}[/magenta]  "
        f"[dim]Languages:[/dim] [blue]{', '.join(langs)}[/blue]"
    )

    # Other languages — show title only
    for lang, content in contents.items():
        if lang == "en" or lang == list(contents.keys())[0] and "en" not in contents:
            continue
        lang_title = content.get("teaser_title", "")
        if lang_title:
            lines.append(f"[dim]{lang.upper()}:[/dim] {lang_title}")

    # Clickable ID link
    resolved = question_dir.resolve()
    lines.append("")
    lines.append(f"[link=file://{resolved}]{question_id}[/link] [dim]{resolved}[/dim]")

    panel = Panel(
        "\n".join(lines),
        title=f"[bold]{title}[/bold]",
        title_align="left",
        border_style="cyan",
        padding=(1, 2),
    )
    console.print(panel)


def generate_single(
    prompt: str,
    category: str,
    subcategory: str,
    difficulty: str,
    question_type: str = "multiple_choice",
    languages: list[str] | None = None,
    validate: bool = False,
    model: str = "claude-sonnet-4-20250514",
) -> None:
    """Generate a single question via the agent pipeline with live progress."""
    if languages is None:
        languages = ["en", "de"]

    tracker = StageTracker()
    research_idx = tracker.add_stage("Researching topic...", f'prompt: "{prompt[:50]}"')
    construct_idx = tracker.add_stage(
        "Constructing question...", f"{question_type}, {difficulty}"
    )
    if validate:
        validate_idx = tracker.add_stage(
            "Validating...", "checking correctness + duplicates"
        )
    tts_idx = tracker.add_stage(
        "Generating voice lines...", f'languages: {", ".join(languages)}'
    )
    done_idx = tracker.add_stage("Done", "")

    console.print()

    # Snapshot existing question IDs so we can find the new one after generation
    questions_dir = get_questions_dir()
    existing_ids = set()
    if questions_dir.exists():
        existing_ids = {p.name for p in questions_dir.iterdir() if p.is_dir()}

    result = None
    question_dir: Path | None = None

    with Live(tracker.render(), console=console, refresh_per_second=4) as live:
        # Stage 1: Research + construct (agent does both)
        tracker.start(research_idx, f'searching "{prompt[:40]}"')
        live.update(tracker.render())

        try:
            result = asyncio.run(
                generate_question_with_agent(
                    prompt=prompt,
                    category=category,
                    subcategory=subcategory,
                    difficulty=difficulty,
                    question_type=question_type,
                    languages=languages,
                    model=model,
                )
            )
            tracker.complete(research_idx, "sources found")
            live.update(tracker.render())

        except ImportError:
            tracker.fail(research_idx, "Claude Agent SDK not installed")
            tracker.fail(construct_idx, "skipped")
            if validate:
                tracker.fail(validate_idx, "skipped")
            tracker.fail(tts_idx, "skipped")
            tracker.fail(done_idx, "generation failed")
            live.update(tracker.render())
            console.print(
                "\n  [red]Install claude-agent-sdk to use agent generation.[/red]"
            )
            return

        except BaseException as e:
            # Unwrap ExceptionGroup to surface the real cause
            cause = e
            while isinstance(cause, BaseExceptionGroup) and cause.exceptions:
                cause = cause.exceptions[0]
            error_msg = str(cause)
            tracker.fail(research_idx, error_msg[:60])
            tracker.fail(construct_idx, "skipped")
            if validate:
                tracker.fail(validate_idx, "skipped")
            tracker.fail(tts_idx, "skipped")
            tracker.fail(done_idx, "generation failed")
            live.update(tracker.render())
            logger.debug("Generation error details:", exc_info=e)
            return

        # Find the generated question directory
        qdir_str = result.get("question_dir") if result else None
        if qdir_str:
            question_dir = Path(qdir_str)
        elif questions_dir.exists():
            new_dirs = [
                p for p in questions_dir.iterdir()
                if p.is_dir() and p.name not in existing_ids and (p / "meta.json").exists()
            ]
            if new_dirs:
                question_dir = new_dirs[0]

        if question_dir and question_dir.exists():
            tracker.complete(construct_idx, "question constructed")
        else:
            tool_errors = result.get("_tool_errors", []) if result else []
            if tool_errors:
                tracker.fail(construct_idx, tool_errors[0][:60])
            else:
                tracker.fail(construct_idx, "agent did not write question")
        live.update(tracker.render())

        # Stage 2: Validation (optional)
        if validate:
            tracker.start(validate_idx, "checking correctness")
            live.update(tracker.render())

            if question_dir and (question_dir / "meta.json").exists():
                meta_data = json.loads((question_dir / "meta.json").read_text(encoding="utf-8"))
                # Load primary language content (prefer English)
                content_path = question_dir / "question.en.json"
                if not content_path.exists():
                    candidates = list(question_dir.glob("question.*.json"))
                    content_path = candidates[0] if candidates else None

                if content_path and content_path.exists():
                    content_data = json.loads(content_path.read_text(encoding="utf-8"))
                    try:
                        loop = asyncio.new_event_loop()
                        val_result = loop.run_until_complete(
                            validate_question_with_agent(
                                question_content=content_data,
                                meta=meta_data,
                                model=model,
                            )
                        )
                        loop.close()
                        verdict = val_result.get("verdict", "unknown")
                        tracker.complete(validate_idx, f"verdict: {verdict}")
                    except Exception as e:
                        cause = e
                        while isinstance(cause, BaseExceptionGroup) and cause.exceptions:
                            cause = cause.exceptions[0]
                        tracker.fail(validate_idx, str(cause)[:60])
                else:
                    tracker.fail(validate_idx, "no question content found")
            else:
                tracker.fail(validate_idx, "no question directory found")
            live.update(tracker.render())

        # Stage 3: TTS
        if question_dir and question_dir.exists():
            from .tts.client import has_api_key, estimate_cost

            if has_api_key():
                tracker.start(tts_idx, f"generating audio ({len(languages)} languages)")
                live.update(tracker.render())
                try:
                    tts_results = generate_all_voice_lines(question_dir, languages)
                    total_chars = sum(r.characters_used for r in tts_results.values())
                    total_files = sum(len(r.files) for r in tts_results.values())
                    total_errors = sum(len(r.errors) for r in tts_results.values())

                    if total_errors > 0:
                        tracker.complete(
                            tts_idx,
                            f"{total_files} files, {total_chars} chars, {total_errors} errors",
                        )
                    else:
                        cost = estimate_cost(total_chars)
                        tracker.complete(
                            tts_idx,
                            f"{total_files} files, {total_chars} chars (~${cost:.3f})",
                        )
                except Exception as e:
                    tracker.fail(tts_idx, str(e)[:60])
            else:
                tracker.start(tts_idx, "no API key, stub mode")
                live.update(tracker.render())
                generate_all_voice_lines(question_dir, languages)
                tracker.complete(tts_idx, "stub: placeholder files created")
        else:
            tracker.fail(tts_idx, "no question directory")
        live.update(tracker.render())

        # Done
        if question_dir and question_dir.exists():
            tracker.complete(done_idx, "question generated successfully")
        else:
            tracker.fail(done_idx, "question not written")
        live.update(tracker.render())

    console.print()

    # Show diagnostics if question wasn't written
    if result and not (question_dir and question_dir.exists()):
        tool_errors = result.get("_tool_errors", [])
        debug_msgs = result.get("_debug_messages", [])
        agent_text = result.get("result", "")
        if tool_errors:
            console.print(f"  [red]Tool errors:[/red] {tool_errors}")
        if agent_text:
            console.print(f"  [yellow]Agent response (first 500 chars):[/yellow]")
            console.print(f"  {agent_text[:500]}")
        if debug_msgs:
            console.print(f"  [dim]Message types: {', '.join(debug_msgs[:20])}[/dim]")

    # Debug: log what the agent returned
    logger.debug("Agent result keys: %s", list(result.keys()) if result else "None")
    logger.debug("Agent result_text (first 200): %s", (result.get("result", "")[:200]) if result else "N/A")
    logger.debug("Agent question_dir: %s", result.get("question_dir") if result else "N/A")
    logger.debug("Agent SDK messages: %s", result.get("_debug_messages", []) if result else "N/A")
    logger.debug("Agent tool errors: %s", result.get("_tool_errors", []) if result else "N/A")

    # Display the generated question card
    if question_dir and question_dir.exists() and (question_dir / "meta.json").exists():
        display_question_card(question_dir)
    else:
        logger.debug("No question directory found — card skipped")
    console.print()
