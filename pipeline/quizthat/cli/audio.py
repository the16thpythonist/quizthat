"""Audio/TTS commands mixin for the CLI."""

from __future__ import annotations

from pathlib import Path

import rich_click as click
from rich.console import Console

from quizthat.cli.constants import DEFAULT_LANGUAGES, DEFAULT_QUESTIONS_DIR


def _create_audio_group() -> click.Group:
    """Build the ``audio`` subgroup with its subcommands."""

    @click.group("audio")
    @click.pass_context
    def audio(ctx: click.Context) -> None:
        """Audio/TTS commands (ElevenLabs)."""
        ctx.ensure_object(dict)

    # Force command ordering instead of alphabetical
    audio.list_commands = lambda ctx: ["check-api", "test", "generate", "batch"]

    @audio.command("check-api")
    def check_api() -> None:
        """Check ElevenLabs API key and show subscription info."""
        from quizthat.tts.client import TIER_PRICING, get_subscription_info, has_api_key

        console = Console()

        if not has_api_key():
            console.print("\n  [red]ELEVENLABS_API_KEY is not set.[/red]")
            console.print("  Set it in your .env file or environment.\n")
            return

        console.print("\n  [dim]Testing ElevenLabs API connection...[/dim]")

        # Try subscription info first (requires user_read permission)
        try:
            info = get_subscription_info()
        except Exception as e:
            msg = str(e)
            if "missing_permissions" in msg or "user_read" in msg:
                # Key works but lacks user_read scope — try a voices list call instead
                info = None
                console.print(
                    "\n  [bold]ElevenLabs API[/bold] [green]key is set[/green]"
                    " [dim](no user_read permission for subscription details)[/dim]"
                )
                _test_voices_fallback(console)
                return
            elif "status_code: 401" in msg:
                console.print("\n  [red]Authentication failed.[/red] Check your API key.\n")
                return
            elif "status_code:" in msg:
                console.print(f"\n  [red]API error:[/red] {msg[:200]}\n")
                return
            else:
                console.print(f"\n  [red]Connection error:[/red] {msg[:200]}\n")
                return

        if info is None:
            console.print("\n  [red]Could not fetch subscription info.[/red]\n")
            return

        tier = info["tier"]
        status = info["status"]
        used = info["character_count"]
        limit = info["character_limit"]
        remaining = info["characters_remaining"]
        pct = (used / limit * 100) if limit > 0 else 0

        if pct > 90:
            bar_style = "red"
        elif pct > 70:
            bar_style = "yellow"
        else:
            bar_style = "green"

        console.print(f"\n  [bold]ElevenLabs API[/bold] [green]connected[/green]")
        console.print(f"  Tier: [cyan]{tier}[/cyan]  Status: [green]{status}[/green]")
        console.print(
            f"  Characters: [{bar_style}]{used:,}[/{bar_style}] / {limit:,} "
            f"([{bar_style}]{pct:.1f}%[/{bar_style}] used, {remaining:,} remaining)"
        )

        rate = TIER_PRICING.get(tier.lower())
        if rate:
            console.print(f"  Rate: ${rate:.2f} / 1,000 characters")
        console.print()

    def _test_voices_fallback(console: Console) -> None:
        """Fallback test: list available voices to confirm the key works for TTS."""
        from quizthat.tts.client import _get_client

        client = _get_client()
        if client is None:
            return
        try:
            voices = client.voices.get_all()
            count = len(voices.voices) if hasattr(voices, "voices") else 0
            console.print(f"  Voices available: [cyan]{count}[/cyan]")
        except Exception as e:
            console.print(f"  [yellow]Could not list voices:[/yellow] {str(e)[:100]}")
        console.print()

    @audio.command("test")
    @click.argument("text")
    @click.option(
        "-l",
        "--language",
        default="en",
        help="Language code (uses matching voice from config)",
    )
    @click.option(
        "-o",
        "--output",
        default=None,
        type=click.Path(),
        help="Output file path (default: test_output.mp3)",
    )
    def test(text: str, language: str, output: str | None) -> None:
        """Generate a single voice line from a text string."""
        from quizthat.tts.client import (
            _generate_single_clip,
            _get_client,
            _normalize_audio,
            estimate_cost,
            has_api_key,
            load_voice_config,
        )

        console = Console()

        if not has_api_key():
            console.print("\n  [red]ELEVENLABS_API_KEY is not set.[/red]\n")
            return

        config = load_voice_config()
        narrator = config.get("narrators", {}).get(language, {})
        if not narrator:
            available = ", ".join(config.get("narrators", {}).keys())
            console.print(
                f"\n  [red]No voice configured for language '{language}'.[/red]"
                f"\n  Available: {available}\n"
            )
            return

        client = _get_client()
        if client is None:
            return

        output_path = Path(output) if output else Path(f"test_output.{language}.mp3")
        voice_name = narrator.get("name", language)

        console.print(f'\n  [dim]Generating with {voice_name}...[/dim]')

        try:
            chars = _generate_single_clip(client, text, narrator, output_path)
            _normalize_audio(output_path)
            size_kb = output_path.stat().st_size / 1024
            cost = estimate_cost(chars)
            console.print(f"  [green]Saved:[/green] {output_path} ({size_kb:.1f} KB)")
            console.print(f"  Characters: {chars}  Cost: ~${cost:.4f}")
        except Exception as e:
            console.print(f"\n  [red]Generation failed:[/red] {e}\n")
        console.print()

    @audio.command("generate")
    @click.argument("question_dir", type=click.Path(exists=True))
    @click.option(
        "-l",
        "--languages",
        default=DEFAULT_LANGUAGES,
        help="Comma-separated language codes",
    )
    def generate(question_dir: str, languages: str) -> None:
        """Generate TTS audio for a single question directory."""
        from quizthat.tts.client import (
            estimate_cost,
            generate_all_voice_lines,
            has_api_key,
        )

        console = Console()
        qdir = Path(question_dir)
        lang_list = [lang.strip() for lang in languages.split(",")]

        if not has_api_key():
            console.print("\n  [yellow]No API key -- running in stub mode[/yellow]")

        console.print(f"\n  Generating audio for [cyan]{qdir.name}[/cyan]...")
        console.print(f"  Languages: {', '.join(lang_list)}")

        results = generate_all_voice_lines(qdir, lang_list)

        total_chars = sum(r.characters_used for r in results.values())
        total_files = sum(len(r.files) for r in results.values())
        total_errors = sum(len(r.errors) for r in results.values())

        console.print(f"\n  [green]{total_files} audio files generated[/green]")
        if total_chars > 0:
            cost = estimate_cost(total_chars)
            console.print(f"  Characters used: {total_chars:,}")
            console.print(f"  Estimated cost: ~${cost:.3f}")
        if total_errors > 0:
            console.print(f"  [red]{total_errors} errors[/red]")
            for r in results.values():
                for err in r.errors:
                    console.print(f"    [red]{err}[/red]")
        console.print()

    @audio.command("batch")
    @click.option(
        "--dir",
        "questions_dir",
        default=DEFAULT_QUESTIONS_DIR,
        type=click.Path(exists=False),
        help="Questions directory",
    )
    @click.option(
        "-l",
        "--languages",
        default=DEFAULT_LANGUAGES,
        help="Comma-separated language codes",
    )
    @click.option("--force", is_flag=True, help="Regenerate even if audio exists")
    def batch(questions_dir: str, languages: str, force: bool) -> None:
        """Generate TTS for all questions missing audio."""
        from rich.progress import (
            BarColumn,
            Progress,
            SpinnerColumn,
            TaskProgressColumn,
            TextColumn,
        )

        from quizthat.tts.client import (
            estimate_cost,
            generate_all_voice_lines,
            has_api_key,
        )

        console = Console()
        qdir = Path(questions_dir)
        lang_list = [lang.strip() for lang in languages.split(",")]

        if not qdir.exists():
            console.print(f"\n  [red]Questions directory not found: {qdir}[/red]\n")
            return

        if not has_api_key():
            console.print("\n  [yellow]No API key -- running in stub mode[/yellow]")

        # Find questions that need audio
        question_dirs: list[Path] = []
        for d in sorted(qdir.iterdir()):
            if not d.is_dir() or not (d / "meta.json").exists():
                continue
            if not force:
                audio_dir = d / "audio"
                missing = False
                for lang in lang_list:
                    qfile = audio_dir / f"question.{lang}.mp3"
                    if not qfile.exists() or qfile.stat().st_size == 0:
                        missing = True
                        break
                if not missing:
                    continue
            question_dirs.append(d)

        if not question_dirs:
            console.print("\n  [green]All questions already have audio.[/green]\n")
            return

        console.print(f"\n  Found [cyan]{len(question_dirs)}[/cyan] questions needing audio")
        console.print(f"  Languages: {', '.join(lang_list)}")

        total_chars = 0
        total_files = 0
        total_errors = 0

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Generating audio", total=len(question_dirs))

            for d in question_dirs:
                results = generate_all_voice_lines(d, lang_list)
                for r in results.values():
                    total_chars += r.characters_used
                    total_files += len(r.files)
                    total_errors += len(r.errors)
                progress.update(task, advance=1)

        console.print(
            f"\n  [bold]Batch complete:[/bold] "
            f"[green]{len(question_dirs)} questions[/green], "
            f"[green]{total_files} files[/green]"
        )
        if total_chars > 0:
            cost = estimate_cost(total_chars)
            console.print(f"  Characters: {total_chars:,}  Cost: ~${cost:.3f}")
        if total_errors > 0:
            console.print(f"  [red]{total_errors} errors[/red]")
        console.print()

    return audio


class AudioCommandsMixin:
    """Mixin providing the ``audio`` command group (test-api, generate, batch)."""

    audio_group = _create_audio_group()
