"""Base CLI class with custom help formatting."""

from __future__ import annotations

import rich
import rich_click as click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from quizthat.cli.display import RichLogo, RichHelp


class BaseCLI(click.RichGroup):
    """Base CLI group providing Rich-formatted help output.

    Subclasses should define a ``COMMAND_GROUPS`` class variable — a list of
    dicts with ``name`` and ``commands`` keys — to control how commands are
    grouped in the help display.
    """

    COMMAND_GROUPS: list[dict] = []

    def __init__(self, *args, **kwargs):
        click.RichGroup.__init__(self, *args, invoke_without_command=True, **kwargs)
        self.cons = Console()

    def get_help(self, ctx):
        rich.print(RichLogo())
        rich.print(RichHelp())

        self.cons.print()

        prog_name = ctx.command_path
        self.cons.print(f" Usage: {prog_name} [OPTIONS] COMMAND [ARGS]...")
        self.cons.print()

        # Options panel
        options_table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
        options_table.add_column("Option", style="cyan", min_width=20, max_width=20, no_wrap=True)
        options_table.add_column("Description", style="white", ratio=1)
        options_table.add_row("-V, --verbose", "Enable debug logging.")
        options_table.add_row("--version", "Show the version and exit.")
        options_table.add_row("--help", "Show this message and exit.")

        options_panel = Panel(
            options_table,
            title="[bold]Options[/bold]",
            title_align="left",
            border_style="bright_black",
            padding=(0, 1),
            expand=True,
        )
        self.cons.print(options_panel)

        self.cons.print()
        self._format_command_groups(ctx)

        return ""

    def _resolve_command(self, ctx, cmd_path: str):
        """Resolve a possibly nested command path like ``'corpus stats'``."""
        parts = cmd_path.split()
        cmd = self.get_command(ctx, parts[0])
        for part in parts[1:]:
            if cmd is None or not isinstance(cmd, click.MultiCommand):
                return None
            cmd = cmd.get_command(ctx, part)
        return cmd

    def _format_command_groups(self, ctx) -> None:
        """Render each command group defined in ``COMMAND_GROUPS`` as a Rich panel."""
        for group in self.COMMAND_GROUPS:
            table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
            table.add_column("Command", style="cyan", min_width=20, max_width=20, no_wrap=True)
            table.add_column("Description", style="white", ratio=1)

            has_commands = False
            for cmd_name in group["commands"]:
                cmd = self._resolve_command(ctx, cmd_name)
                if cmd is not None:
                    help_text = cmd.get_short_help_str(limit=100)
                    table.add_row(cmd_name, help_text)
                    has_commands = True

            if not has_commands:
                table.add_row("[dim]No commands yet[/dim]", "")

            panel = Panel(
                table,
                title=f"[bold]{group['name']}[/bold]",
                title_align="left",
                border_style="bright_black",
                padding=(0, 1),
                expand=True,
            )
            rich.print(panel)
