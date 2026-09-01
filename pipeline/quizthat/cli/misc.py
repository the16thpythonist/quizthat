"""Miscellaneous commands mixin for the CLI."""

from __future__ import annotations

from pathlib import Path

import rich_click as click
import yaml
from rich import box
from rich.console import Console
from rich.table import Table
from rich.tree import Tree


@click.command("categories")
def categories_command() -> None:
    """Display the category configuration."""
    config_path = Path(__file__).parent.parent.parent / "config" / "categories.yaml"
    console = Console()

    if not config_path.exists():
        console.print("[yellow]categories.yaml not found[/yellow]")
        return

    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    cats = config.get("categories", {})

    table = Table(
        show_header=True,
        header_style="bold",
        box=box.HEAVY_HEAD,
        border_style="white",
        expand=True,
        padding=(0, 1),
        show_edge=True,
    )
    table.add_column("Name", no_wrap=True, ratio=1)
    table.add_column("Key", style="dim", no_wrap=True, width=16)

    for cat_key, cat_data in cats.items():
        name = cat_data["name"]
        subs = cat_data.get("subcategories", {})
        table.add_row(f"[bold cyan]{name}[/bold cyan]", f"[dim]{cat_key}[/dim]")
        for sub_key, sub_name in subs.items():
            table.add_row(f"  [white]{sub_name}[/white]", f"[dim]{sub_key}[/dim]")

    total_cats = len(cats)
    total_subs = sum(len(c.get("subcategories", {})) for c in cats.values())

    console.print()
    table.caption = f"[dim]{total_cats} categories, {total_subs} subcategories[/dim]"
    table.caption_justify = "right"
    console.print(table)


class MiscCommandsMixin:
    """Mixin providing miscellaneous utility commands."""

    categories_command = categories_command
