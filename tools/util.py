import os
import pathlib

import click

PATH = pathlib.Path(__file__).parent.absolute()
PROJECT_PATH = os.path.dirname(PATH)
ASSETS_PATH = os.path.join(PROJECT_PATH, 'public', 'assets')


def secho_info(text: str) -> None:
    click.secho(f'... {text}')


def secho_progress(text: str) -> None:
    click.secho(f'[o] {text}', fg='green')


def secho_error(text: str) -> None:
    click.secho(f'[x] {text}', fg='red')