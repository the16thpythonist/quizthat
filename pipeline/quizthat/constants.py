"""
Defaults shared across the pipeline.

Top-level rather than in `cli/constants.py` because the agent runner needs the
model name too, and importing anything under `quizthat.cli` pulls in
`rich_click` and starts building the command tree — which, from a module the
CLI itself imports, is a cycle waiting to happen.
"""

#: The model the generation agent runs on.
DEFAULT_MODEL = "claude-sonnet-5"
DEFAULT_LANGUAGES = "en,de"
DEFAULT_QUESTIONS_DIR = "questions"
DIFFICULTY_CHOICES = ["easy", "medium", "hard"]
QUESTION_TYPE_CHOICES = ["multiple_choice", "sorting", "map_location", "calculation"]
