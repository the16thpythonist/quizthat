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


AnswerData = (
    MultipleChoiceAnswerData
    | SortingAnswerData
    | MapLocationAnswerData
    | CalculationAnswerData
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
