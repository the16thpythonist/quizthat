"""Corpus management commands."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from rich import box
from rich.console import Console
from rich.table import Table
from rich.text import Text

from .schemas import QuestionMeta, QuestionContent

console = Console()


def get_questions_dir(base_dir: Path | None = None) -> Path:
    """Get the questions directory."""
    if base_dir:
        return base_dir
    return Path("questions")


def load_all_meta(questions_dir: Path) -> list[QuestionMeta]:
    """Load all meta.json files from the corpus."""
    metas = []
    if not questions_dir.exists():
        return metas

    for meta_path in sorted(questions_dir.glob("*/meta.json")):
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            metas.append(QuestionMeta(**data))
        except Exception as e:
            console.print(f"[yellow]Warning: skipping {meta_path}: {e}[/yellow]")
    return metas


# ---------------------------------------------------------------------------
# Shared question row data used by ``corpus list`` and ``corpus search``
# ---------------------------------------------------------------------------

@dataclass
class QuestionRow:
    """Flat representation of a question for table display."""

    id: str
    path: Path
    title: str
    category: str
    subcategory: str
    difficulty: str
    question_type: str
    languages: str
    created: datetime
    has_audio: bool = False
    # Extra fields populated during search
    score: float = 0.0


def _load_question_rows(
    questions_dir: Path,
    *,
    lang: str = "en",
) -> list[QuestionRow]:
    """Load metadata + first-language content for every question."""
    rows: list[QuestionRow] = []
    if not questions_dir.exists():
        return rows

    for meta_path in sorted(questions_dir.glob("*/meta.json")):
        try:
            meta = QuestionMeta(**json.loads(meta_path.read_text(encoding="utf-8")))
        except Exception:
            continue

        qdir = meta_path.parent

        # Try requested language, fall back to first available
        content_path = qdir / f"question.{lang}.json"
        if not content_path.exists():
            candidates = list(qdir.glob("question.*.json"))
            content_path = candidates[0] if candidates else None

        title = ""
        if content_path and content_path.exists():
            try:
                content = QuestionContent(**json.loads(content_path.read_text(encoding="utf-8")))
                title = content.teaser_title
            except Exception:
                pass

        audio_dir = qdir / "audio"
        has_audio = audio_dir.is_dir() and any(audio_dir.iterdir())

        rows.append(QuestionRow(
            id=meta.id,
            path=qdir.resolve(),
            title=title,
            category=meta.major_category,
            subcategory=meta.subcategory,
            difficulty=meta.difficulty.value,
            question_type=meta.question_type.value,
            languages=",".join(meta.languages),
            created=_parse_created(meta.created_at),
            has_audio=has_audio,
        ))

    return rows


_DIFFICULTY_ORDER = {"easy": 0, "medium": 1, "hard": 2}


def _sort_rows(rows: list[QuestionRow], key: str, reverse: bool) -> list[QuestionRow]:
    """Sort rows by the given key name."""
    if key == "difficulty":
        return sorted(rows, key=lambda r: _DIFFICULTY_ORDER.get(r.difficulty, 99), reverse=reverse)
    if key == "created":
        return sorted(rows, key=lambda r: r.created, reverse=reverse)
    if key == "score":
        return sorted(rows, key=lambda r: r.score, reverse=reverse)
    return sorted(rows, key=lambda r: getattr(r, key, ""), reverse=reverse)


def _question_table() -> Table:
    """Create the shared question-list table."""
    t = Table(
        show_header=True,
        header_style="bold",
        box=box.HEAVY_HEAD,
        border_style="white",
        expand=True,
        padding=(0, 1),
        show_edge=True,
    )
    t.add_column("ID", style="dim", no_wrap=True, width=9)
    t.add_column("Title", style="white", no_wrap=True, min_width=14, ratio=1)
    t.add_column("Category", style="cyan", no_wrap=True, width=14)
    t.add_column("Diff", style="green", no_wrap=True, width=7)
    t.add_column("Type", style="magenta", no_wrap=True, width=16)
    t.add_column("Lang", style="blue", no_wrap=True, width=5)
    t.add_column("Audio", justify="center", no_wrap=True, width=5)
    t.add_column("Created", style="dim", justify="right", no_wrap=True, width=10)
    return t


def _add_question_row(table: Table, row: QuestionRow) -> None:
    """Add a QuestionRow to the shared table."""
    id_link = f"[link=file://{row.path}]{row.id}[/link]"
    audio = "[green]yes[/green]" if row.has_audio else "[dim]—[/dim]"
    table.add_row(
        id_link,
        row.title,
        row.category,
        row.difficulty,
        row.question_type,
        row.languages,
        audio,
        _relative_date(row.created),
    )


def _bar(fraction: float, width: int = 16) -> str:
    """Render a proportional bar using Unicode block chars."""
    filled = round(fraction * width)
    return f"[cyan]{'━' * filled}[/cyan][bright_black]{'━' * (width - filled)}[/bright_black]"


def _parse_created(iso: str) -> datetime:
    """Parse an ISO-8601 ``created_at`` string."""
    # Strip trailing Z and parse
    return datetime.fromisoformat(iso.rstrip("Z"))


def _relative_date(dt: datetime) -> str:
    """Format a datetime as a human-friendly relative string."""
    delta = datetime.utcnow() - dt
    days = delta.days
    if days == 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 30:
        return f"{days}d ago"
    months = days // 30
    if months < 12:
        return f"{months}mo ago"
    return f"{days // 365}y ago"


# Shared column widths so every table aligns.
_COL_COUNT = 7
_COL_SHARE = 24
_COL_LAST = 11


def _stats_table(label: str, label_style: str = "white") -> Table:
    """Create a bordered table with the standard 4-column layout."""
    t = Table(
        show_header=True,
        header_style="bold",
        box=box.HEAVY_HEAD,
        border_style="white",
        expand=True,
        padding=(0, 1),
        show_edge=True,
    )
    t.add_column(label, style=label_style, no_wrap=True, ratio=1)
    t.add_column("Count", justify="right", style="white", width=_COL_COUNT)
    t.add_column("Share", width=_COL_SHARE, no_wrap=True)
    t.add_column("Last added", justify="right", style="dim", width=_COL_LAST)
    return t


def corpus_stats(questions_dir: Path) -> None:
    """Display corpus statistics."""
    metas = load_all_meta(questions_dir)

    if not metas:
        console.print("[yellow]No questions found in corpus.[/yellow]")
        return

    total = len(metas)
    timestamps = [_parse_created(m.created_at) for m in metas]
    newest = max(timestamps)
    oldest = min(timestamps)

    # --- Header ---
    console.print()
    console.print(
        f"[bold]Corpus Statistics[/bold]  "
        f"[dim]|[/dim]  {total} questions  "
        f"[dim]|[/dim]  newest {_relative_date(newest)}  "
        f"[dim]|[/dim]  oldest {_relative_date(oldest)}"
    )
    console.print()

    def _share_cell(pct: float) -> str:
        return f"{_bar(pct)} [dim]{pct:>5.1%}[/dim]"

    # --- By Category ---
    cat_table = _stats_table("Category", "cyan")
    cat_counts = Counter(m.major_category for m in metas)
    for cat, count in cat_counts.most_common():
        cat_metas = [m for m in metas if m.major_category == cat]
        last = max(_parse_created(m.created_at) for m in cat_metas)
        cat_table.add_row(cat, str(count), _share_cell(count / total), _relative_date(last))
    console.print(cat_table)

    # --- By Difficulty ---
    console.print()
    console.print()
    diff_table = _stats_table("Difficulty", "green")
    diff_counts = Counter(m.difficulty.value for m in metas)
    for diff in ["easy", "medium", "hard"]:
        count = diff_counts.get(diff, 0)
        diff_metas = [m for m in metas if m.difficulty.value == diff]
        last = _relative_date(max(_parse_created(m.created_at) for m in diff_metas)) if diff_metas else "—"
        diff_table.add_row(diff, str(count), _share_cell(count / total) if count else _share_cell(0), last)
    console.print(diff_table)

    # --- By Question Type ---
    console.print()
    console.print()
    type_table = _stats_table("Type", "magenta")
    type_counts = Counter(m.question_type.value for m in metas)
    for qt, count in type_counts.most_common():
        qt_metas = [m for m in metas if m.question_type.value == qt]
        last = _relative_date(max(_parse_created(m.created_at) for m in qt_metas))
        type_table.add_row(qt, str(count), _share_cell(count / total), last)
    console.print(type_table)

    # --- By Language ---
    console.print()
    console.print()
    lang_table = _stats_table("Language", "blue")
    lang_counts: Counter[str] = Counter()
    for m in metas:
        for lang in m.languages:
            lang_counts[lang] += 1
    for lang, count in lang_counts.most_common():
        lang_metas = [m for m in metas if lang in m.languages]
        last = _relative_date(max(_parse_created(m.created_at) for m in lang_metas))
        lang_table.add_row(lang, str(count), _share_cell(count / total), last)
    console.print(lang_table)


def corpus_gaps(
    questions_dir: Path,
    languages: list[str] | None = None,
    as_json: bool = False,
) -> None:
    """Show underpopulated category/difficulty buckets."""
    import yaml

    metas = load_all_meta(questions_dir)

    # Load categories
    config_dir = Path(__file__).parent.parent / "config"
    categories_path = config_dir / "categories.yaml"
    if categories_path.exists():
        with open(categories_path, encoding="utf-8") as f:
            cat_config = yaml.safe_load(f)
    else:
        console.print("[yellow]categories.yaml not found[/yellow]")
        return

    # Build expected buckets
    difficulties = ["easy", "medium", "hard"]
    buckets: dict[str, int] = {}
    for cat_key, cat_data in cat_config.get("categories", {}).items():
        cat_name = cat_data["name"]
        for sub_key, sub_name in cat_data.get("subcategories", {}).items():
            for diff in difficulties:
                key = f"{cat_name}/{sub_name}/{diff}"
                buckets[key] = 0

    # Count existing
    for m in metas:
        key = f"{m.major_category}/{m.subcategory}/{m.difficulty.value}"
        if key in buckets:
            buckets[key] += 1

    # Filter to empty/low buckets
    gaps = {k: v for k, v in buckets.items() if v < 3}

    if as_json:
        gap_list = []
        for key, count in sorted(gaps.items()):
            parts = key.split("/")
            gap_list.append(
                {
                    "category": parts[0],
                    "subcategory": parts[1],
                    "difficulty": parts[2],
                    "count": count,
                }
            )
        console.print_json(json.dumps(gap_list))
    else:
        table = Table(title="Corpus Gaps (< 3 questions)")
        table.add_column("Category", style="cyan")
        table.add_column("Subcategory", style="green")
        table.add_column("Difficulty", style="yellow")
        table.add_column("Count", justify="right")

        for key in sorted(gaps):
            parts = key.split("/")
            table.add_row(parts[0], parts[1], parts[2], str(gaps[key]))

        console.print(table)
        console.print(f"\n[dim]{len(gaps)} gaps found[/dim]")


# ---------------------------------------------------------------------------
# corpus list
# ---------------------------------------------------------------------------


def corpus_list(
    questions_dir: Path,
    *,
    sort: str = "id",
    reverse: bool = False,
    category: str | None = None,
    difficulty: str | None = None,
    question_type: str | None = None,
    language: str | None = None,
) -> None:
    """List all questions in the corpus."""
    rows = _load_question_rows(questions_dir)

    if not rows:
        console.print("[yellow]No questions found in corpus.[/yellow]")
        return

    # Apply filters
    if category:
        rows = [r for r in rows if r.category.lower() == category.lower()]
    if difficulty:
        rows = [r for r in rows if r.difficulty == difficulty]
    if question_type:
        rows = [r for r in rows if r.question_type == question_type]
    if language:
        rows = [r for r in rows if language in r.languages.split(",")]

    if not rows:
        console.print("[yellow]No questions match the given filters.[/yellow]")
        return

    rows = _sort_rows(rows, sort, reverse)

    console.print()
    table = _question_table()
    for row in rows:
        _add_question_row(table, row)
    console.print(table)
    console.print(f"\n[dim]{len(rows)} questions[/dim]")


# ---------------------------------------------------------------------------
# corpus search
# ---------------------------------------------------------------------------


def _load_searchable_text(qdir: Path, lang: str | None) -> dict[str, str]:
    """Load searchable text fields from a question directory.

    Returns a dict with keys ``title``, ``question``, ``category``,
    ``subcategory`` mapping to lowercased text.
    """
    fields: dict[str, str] = {}

    # Meta fields
    meta_path = qdir / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            fields["category"] = meta.get("major_category", "").lower()
            fields["subcategory"] = meta.get("subcategory", "").lower()
        except Exception:
            pass

    # Content fields — search requested language or all
    if lang:
        patterns = [f"question.{lang}.json"]
    else:
        patterns = [p.name for p in qdir.glob("question.*.json")]

    titles: list[str] = []
    questions: list[str] = []
    for name in patterns:
        content_path = qdir / name
        if not content_path.exists():
            continue
        try:
            data = json.loads(content_path.read_text(encoding="utf-8"))
            if data.get("teaser_title"):
                titles.append(data["teaser_title"].lower())
            if data.get("question_text"):
                questions.append(data["question_text"].lower())
        except Exception:
            continue

    fields["title"] = " ".join(titles)
    fields["question"] = " ".join(questions)
    return fields


def corpus_search(
    questions_dir: Path,
    query: str,
    *,
    language: str | None = None,
) -> None:
    """Search questions by relevance and display results."""
    rows = _load_question_rows(questions_dir)

    if not rows:
        console.print("[yellow]No questions found in corpus.[/yellow]")
        return

    query_lower = query.lower()
    scored: list[QuestionRow] = []

    for row in rows:
        text_fields = _load_searchable_text(row.path, language)

        score = 0.0
        # Exact full match in title is strongest signal
        if query_lower == text_fields.get("title", ""):
            score += 10.0
        elif query_lower in text_fields.get("title", ""):
            score += 5.0

        if query_lower in text_fields.get("question", ""):
            score += 3.0

        if query_lower in text_fields.get("category", ""):
            score += 1.0
        if query_lower in text_fields.get("subcategory", ""):
            score += 1.0

        if score > 0:
            row.score = score
            scored.append(row)

    if not scored:
        console.print(f"[yellow]No results for[/yellow] [bold]{query}[/bold]")
        return

    scored = _sort_rows(scored, "score", reverse=True)

    console.print()
    table = _question_table()
    for row in scored:
        _add_question_row(table, row)
    console.print(table)
    console.print(f"\n[dim]{len(scored)} results for [/dim][bold]{query}[/bold]")
