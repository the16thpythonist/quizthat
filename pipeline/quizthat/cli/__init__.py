"""QuizThat! CLI package.

Assembles command mixins into the final CLI group exposed as the
``quizthat`` entry point.
"""

from __future__ import annotations

import logging

import rich_click as click
from dotenv import find_dotenv, load_dotenv

from quizthat.cli.base import BaseCLI
from quizthat.cli.generation import GenerationCommandsMixin
from quizthat.cli.corpus import CorpusCommandsMixin
from quizthat.cli.audio import AudioCommandsMixin
from quizthat.cli.misc import MiscCommandsMixin


class CLI(GenerationCommandsMixin, CorpusCommandsMixin, AudioCommandsMixin, MiscCommandsMixin, BaseCLI):
    """Main CLI class combining all command mixins."""

    COMMAND_GROUPS = [
        {"name": "Generation", "commands": ["generate", "generate-batch"]},
        {"name": "Corpus", "commands": ["corpus list", "corpus search", "corpus stats", "corpus gaps", "corpus validate"]},
        {"name": "Audio", "commands": ["audio check-api", "audio test", "audio generate", "audio batch"]},
        {"name": "Misc", "commands": ["categories"]},
    ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_command(self.generate_command)
        self.add_command(self.generate_batch_command)
        self.add_command(self.corpus_group)
        self.add_command(self.audio_group)
        self.add_command(self.categories_command)


def create_cli():
    """Create and return the CLI group."""

    @click.group(cls=CLI, context_settings={"show_default": True})
    @click.version_option(package_name="quizthat-pipeline")
    @click.option("-V", "--verbose", is_flag=True, help="Enable debug logging")
    @click.pass_context
    def _cli(ctx: click.Context, verbose: bool) -> None:
        """QuizThat! question generation pipeline."""
        load_dotenv(find_dotenv(usecwd=True))

        if verbose:
            logging.basicConfig(
                level=logging.DEBUG,
                format="%(name)s %(levelname)s: %(message)s",
            )
            logging.getLogger(__name__).debug("Verbose logging enabled")

        ctx.obj = ctx.command

        if ctx.invoked_subcommand is None:
            click.echo(ctx.get_help())

    return _cli


cli = create_cli()
