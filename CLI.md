# Mixin-Based CLI Architecture

A pattern for building `rich-click` CLIs that stay organised as they grow. Each
domain gets its own mixin file; a single `CLI` class composes them together;
and a `BaseCLI` provides branded, Rich-formatted help output with grouped
command panels.

---

## 1. Philosophy

| Principle | What it means in practice |
|---|---|
| **One file per domain** | A "Generation" mixin lives in `generation.py`, a "Corpus" mixin in `corpus.py`, etc. |
| **Composition over inheritance** | The final `CLI` class is a flat mixin chain — no deep hierarchy. |
| **Constants are shared** | Defaults that appear in more than one command live in `constants.py`. |
| **Display is separated** | Logo, help text, and any Rich renderable classes live in `display.py` + `assets/`. |
| **Late imports** | Heavy dependencies are imported inside command bodies, keeping CLI startup fast. |
| **Entry point stays stable** | `__init__.py` exposes a module-level `cli` object. The `pyproject.toml` entry point (`myapp.cli:cli`) never needs to change. |

---

## 2. Directory structure

```
myapp/cli/
├── __init__.py       # CLI class (mixin composition) + create_cli() + module-level `cli`
├── base.py           # BaseCLI(click.RichGroup) — custom help formatting
├── display.py        # RichLogo, RichHelp — Rich console protocol classes
├── constants.py      # Shared defaults (models, languages, choices, …)
├── assets/
│   ├── logo.txt          # ASCII/block-character logo text
│   └── logo_image.txt    # Optional ANSI art displayed beside the logo
│
│   # One file per command domain:
├── generation.py     # GenerationCommandsMixin
├── corpus.py         # CorpusCommandsMixin
├── audio.py          # AudioCommandsMixin (placeholder)
└── …
```

---

## 3. Key components

### 3.1 `constants.py` — shared defaults

Any value that appears as a default in more than one command should be defined
here and imported by the mixin modules.

```python
DEFAULT_MODEL = "claude-sonnet-4-20250514"
DEFAULT_LANGUAGES = "en,de"
DEFAULT_QUESTIONS_DIR = "questions"
DIFFICULTY_CHOICES = ["easy", "medium", "hard"]
QUESTION_TYPE_CHOICES = ["multiple_choice", "sorting", "map_location", "calculation"]
```

### 3.2 `display.py` — Rich console protocol classes

Classes that implement `__rich_console__(self, console, options)` so they can be
passed directly to `rich.print()`.

**`RichLogo`** loads `assets/logo.txt` (and optionally `assets/logo_image.txt`
for ANSI art) and renders them with Rich styling:

```python
class RichLogo:
    STYLE = Style(bold=True, color="white")

    def __rich_console__(self, console, options):
        text_path = ASSETS_DIR / "logo.txt"
        try:
            text_string = text_path.read_text()
        except FileNotFoundError:
            text_string = "MyApp!"
        text = Text(text_string, style=self.STYLE)

        # Optional ANSI image rendered side-by-side
        image_path = ASSETS_DIR / "logo_image.txt"
        try:
            image_string = image_path.read_text()
            ansi_string = image_string.replace("\\e", "\033")
            image = Text.from_ansi(ansi_string)
            side_by_side = Columns([image, text], equal=True, padding=(0, 3))
            yield Padding(side_by_side, (1, 3, 1, 3))
        except FileNotFoundError:
            yield Padding(text, (1, 3, 0, 3))
```

**`RichHelp`** yields a short project tagline and description — no usage
examples, just text:

```python
class RichHelp:
    def __rich_console__(self, console, options):
        yield "[white bold]MyApp![/white bold] - One-line description"
        yield ""
        yield "A longer paragraph describing what the tool does."
```

### 3.3 `base.py` — `BaseCLI(click.RichGroup)`

The base group class that every CLI inherits from. It provides:

1. **`self.cons`** — a shared `Console()` instance available to all mixins via
   `self`.
2. **`get_help(ctx)`** — overrides the default help to render logo, help text,
   an options panel, and grouped command panels.
3. **`_format_command_groups(ctx)`** — reads the `COMMAND_GROUPS` class variable
   (defined on the final `CLI` subclass) and renders each group as a Rich
   `Panel` containing a table of commands and their short help strings. Empty
   groups display `[dim]No commands yet[/dim]`.

```python
class BaseCLI(click.RichGroup):
    COMMAND_GROUPS: list[dict] = []

    def __init__(self, *args, **kwargs):
        click.RichGroup.__init__(self, *args, invoke_without_command=True, **kwargs)
        self.cons = Console()

    def get_help(self, ctx):
        rich.print(RichLogo())
        rich.print(RichHelp())
        self.cons.print()
        self.cons.print(f" Usage: {ctx.command_path} [OPTIONS] COMMAND [ARGS]...")
        self.cons.print()

        # … render options panel …

        self._format_command_groups(ctx)
        return ""  # already printed

    def _format_command_groups(self, ctx) -> None:
        commands = self.list_commands(ctx)
        command_objs = {name: self.get_command(ctx, name) for name in commands}

        for group in self.COMMAND_GROUPS:
            table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
            table.add_column("Command", style="cyan", min_width=20, max_width=20, no_wrap=True)
            table.add_column("Description", style="white", ratio=1)

            has_commands = False
            for cmd_name in group["commands"]:
                if cmd_name in command_objs:
                    cmd = command_objs[cmd_name]
                    help_text = cmd.get_short_help_str(limit=100) if cmd else ""
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
```

Key detail: `get_help` returns `""` (not the default formatted string) because
all output has already been printed to the console directly.

### 3.4 Command mixins

There are **two patterns** depending on whether commands are top-level or nested
in a subgroup.

#### Pattern A: Top-level commands (methods with `@click.pass_obj`)

For commands that live directly under the root group (e.g. `myapp generate`),
define them as class methods decorated with `@click.command` and
`@click.pass_obj`:

```python
class GenerationCommandsMixin:
    @click.command("generate")
    @click.pass_obj
    @click.argument("prompt")
    @click.option("--model", default=DEFAULT_MODEL, help="Model to use")
    def generate_command(self, prompt: str, model: str) -> None:
        """Generate a single question from a prompt."""
        from myapp.generate import generate_single  # late import
        generate_single(prompt=prompt, model=model)
```

These are registered in `CLI.__init__` with `self.add_command(self.generate_command)`.

The `self` parameter works because `@click.pass_obj` injects `ctx.obj` as the
first argument, and `create_cli()` sets `ctx.obj = ctx.command` (the `CLI`
instance itself).

#### Pattern B: Nested subgroups (factory function)

For a group with subcommands (e.g. `myapp corpus stats`), the
`@click.pass_obj` method pattern does not work on nested groups. Instead, use a
**module-level factory function** that builds the group:

```python
def _create_corpus_group() -> click.Group:
    @click.group("corpus")
    def corpus() -> None:
        """Corpus management commands."""

    @corpus.command()
    @click.option("--dir", "questions_dir", default=DEFAULT_QUESTIONS_DIR)
    def stats(questions_dir: str) -> None:
        """Show corpus statistics."""
        from myapp.corpus import corpus_stats
        corpus_stats(Path(questions_dir))

    # … more subcommands …

    return corpus


class CorpusCommandsMixin:
    corpus_group = _create_corpus_group()
```

Subcommands inside the factory are regular functions (no `self`). If they need
Rich output, they create a local `Console()`.

The mixin stores the built group as a **class attribute** and it is registered
in `CLI.__init__` with `self.add_command(self.corpus_group)`.

#### Pattern C: Empty placeholder mixin

For future command domains, create an empty mixin with a docstring listing
planned commands:

```python
class AudioCommandsMixin:
    """Mixin for future audio/TTS commands.

    Planned commands:
    - tts-generate
    - tts-batch
    - tts-preview
    """
```

### 3.5 `__init__.py` — assembly

This is where everything comes together.

```python
class CLI(GenerationCommandsMixin, CorpusCommandsMixin, AudioCommandsMixin, BaseCLI):
    COMMAND_GROUPS = [
        {"name": "Generation", "commands": ["generate", "generate-batch"]},
        {"name": "Corpus", "commands": ["corpus"]},
        {"name": "Audio", "commands": []},
    ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Pattern A commands — registered individually
        self.add_command(self.generate_command)
        self.add_command(self.generate_batch_command)
        # Pattern B groups — registered as a whole group
        self.add_command(self.corpus_group)


def create_cli():
    @click.group(cls=CLI)
    @click.version_option(package_name="myapp")
    @click.pass_context
    def _cli(ctx: click.Context) -> None:
        """MyApp CLI."""
        load_dotenv(find_dotenv(usecwd=True))
        ctx.obj = ctx.command  # makes `self` available via @click.pass_obj

        if ctx.invoked_subcommand is None:
            click.echo(ctx.get_help())

    return _cli


cli = create_cli()
```

Key points:

- **MRO**: `BaseCLI` must be last in the inheritance list (it is the only
  concrete base class).
- **`COMMAND_GROUPS`**: a class-level list of dicts that drives the grouped help
  display. Each dict has `name` (panel title) and `commands` (list of command
  name strings). Empty lists render the "No commands yet" placeholder.
- **`ctx.obj = ctx.command`**: this is what makes `@click.pass_obj` inject the
  `CLI` instance as `self` into mixin method commands.
- **`cli = create_cli()`** at module level: this is the object that the
  `pyproject.toml` entry point resolves.

---

## 4. Entry point

In `pyproject.toml`:

```toml
[project.scripts]
myapp = "myapp.cli:cli"
```

This never changes when you add or remove command mixins.

---

## 5. Adding a new command group — step by step

1. **Create `myapp/cli/newdomain.py`** with either Pattern A (top-level
   commands) or Pattern B (subgroup).
2. **Add any new constants** to `constants.py`.
3. **Edit `__init__.py`**:
   - Import the new mixin.
   - Add it to the `CLI` class's inheritance list (before `BaseCLI`).
   - Register its commands in `CLI.__init__` via `self.add_command(…)`.
   - Add an entry to `COMMAND_GROUPS`.
4. That's it. No changes to `base.py`, `display.py`, `pyproject.toml`, or any
   other mixin file.

---

## 6. Dependencies

| Package | Role |
|---|---|
| `rich-click` | Drop-in replacement for `click` with Rich-formatted help for subcommands |
| `rich` | Console, Table, Panel, Text, Columns, etc. for custom help formatting |
| `python-dotenv` | `.env` loading in `create_cli()` |

---

## 7. Conventions

- **Naming**: mixin files use the domain name (`generation.py`), mixin classes
  use `{Domain}CommandsMixin`, command methods use `{name}_command` (e.g.
  `generate_command`), subgroup attributes use `{name}_group`.
- **Late imports**: heavy dependencies (`anthropic`, model loaders, etc.) are
  imported inside command function bodies to keep `--help` fast.
- **Absolute imports**: mixin modules import from the package root
  (`from myapp.generate import …`), not relative imports.
- **help strings**: the `@click.command` docstring becomes the command's help
  text. Keep it to one sentence.
