"""Rich display classes for CLI output formatting."""

from __future__ import annotations

from pathlib import Path

from rich.columns import Columns
from rich.style import Style
from rich.padding import Padding
from rich.text import Text


ASSETS_DIR = Path(__file__).parent / "assets"


class RichLogo:
    """Renders the QuizThat! ASCII logo with optional ANSI image alongside."""

    STYLE = Style(bold=True, color="white")

    def __rich_console__(self, console, options):
        # Load text logo
        text_path = ASSETS_DIR / "logo.txt"
        try:
            text_string = text_path.read_text()
        except FileNotFoundError:
            text_string = "QuizThat!"
        text = Text(text_string, style=self.STYLE)

        # Load optional ANSI image
        image_path = ASSETS_DIR / "logo_image.txt"
        try:
            image_string = image_path.read_text()
            # Replace \e with actual escape character and parse ANSI codes
            ansi_string = image_string.replace("\\e", "\033")
            image = Text.from_ansi(ansi_string)
            side_by_side = Columns([image, text], equal=True, padding=(0, 3))
            yield Padding(side_by_side, (1, 3, 1, 3))
        except FileNotFoundError:
            yield Padding(text, (1, 3, 0, 3))


class RichHelp:
    """Renders the project description below the logo."""

    def __rich_console__(self, console, options):
        yield "[white bold]QuizThat![/white bold] - Question generation pipeline for trivia games"
        yield ""
        yield (
            "Generate, validate, and manage multilingual trivia questions "
            "powered by Claude. Supports multiple question types, difficulty "
            "levels, and corpus analytics."
        )
