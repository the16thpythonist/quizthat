"""Pydantic schemas for question data validation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class QuestionType(str, Enum):
    multiple_choice = "multiple_choice"
    sorting = "sorting"
    map_location = "map_location"
    calculation = "calculation"
    # Battle-only types. These are never offered as ordinary turn questions:
    # a value to be guessed cannot be posed as multiple choice, and both are
    # answered by every player at once rather than by one.
    estimation = "estimation"
    battle_map = "battle_map"


#: Types that only ever appear in a battle at the end of a round.
BATTLE_QUESTION_TYPES = frozenset({QuestionType.estimation, QuestionType.battle_map})


# --- answer_data variants ---


class MultipleChoiceAnswerData(BaseModel):
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)


class SortingAnswerData(BaseModel):
    items: list[str] = Field(min_length=4, max_length=6)
    correct_order: list[int]
    metric: str


class ScoringBand(BaseModel):
    radius_km: float
    label: str


class MapTarget(BaseModel):
    lat: float
    lng: float


class MapLocationAnswerData(BaseModel):
    target: MapTarget
    scoring: list[ScoringBand] = Field(min_length=1)


class CalculationAnswerData(BaseModel):
    correct_value: float
    tolerance: float
    unit: str


class EstimationAnswerData(BaseModel):
    """A number everyone guesses; ranked by absolute difference.

    No tolerance, unlike a calculation: nobody is right or wrong in a battle,
    they are only nearer or further away.
    """

    correct_value: float
    unit: str


class BattleMapAnswerData(BaseModel):
    """A point everyone pins; ranked by great-circle distance.

    Deliberately without the scoring bands a map_location carries — a battle
    ranks by raw distance, so radius thresholds have nothing to decide.
    """

    target: MapTarget


AnswerData = (
    MultipleChoiceAnswerData
    | SortingAnswerData
    | MapLocationAnswerData
    | CalculationAnswerData
    | EstimationAnswerData
    | BattleMapAnswerData
)


# --- File-level schemas ---


class QuestionMeta(BaseModel):
    """Schema for meta.json."""

    id: str
    languages: list[str]
    major_category: str
    subcategory: str
    difficulty: Difficulty
    question_type: QuestionType
    time_limit_seconds: int | None = None
    version: int = 1
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    generation_batch: str | None = None
    #: Whether a person has looked at this question.
    #:
    #: Generation writes `False`; the editor at /admin flips it. Defaults to
    #: `True` so the questions that predate the flag — and anything written by
    #: hand — count as reviewed rather than silently vanishing from the game the
    #: moment `build-corpus-index` learned to filter on it.
    reviewed: bool = True


class QuestionContent(BaseModel):
    """Schema for question.{lang}.json."""

    teaser_title: str
    question_text: str
    hint: str
    answer_data: dict  # Validated separately based on question_type


class CorpusIndexEntry(BaseModel):
    """A single entry in corpus-index.json."""

    id: str
    major_category: str
    subcategory: str
    difficulty: Difficulty
    question_type: QuestionType
    languages: list[str]
    time_limit_seconds: int | None = None
    path: str


class CorpusIndex(BaseModel):
    """Top-level corpus-index.json schema."""

    generated_at: str
    question_count: int
    questions: list[CorpusIndexEntry]
