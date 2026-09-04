"""
The corpus, read straight off disk.

There is no Question model on purpose. `questions/` is the source of truth: the
pipeline writes it, git tracks it, and nginx serves it to the game. A database
copy would be a second source of truth to keep in sync, and drift between the
two is a failure mode nobody would notice until a question went missing.

So this module reads the folder and keeps a small in-memory index for search.
Edits write back to the JSON files, and git is the undo.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from pathlib import Path

from django.conf import settings


@dataclass
class QuestionEntry:
    """One question folder, as the browser needs to list it."""

    id: str
    major_category: str = ""
    subcategory: str = ""
    difficulty: str = ""
    question_type: str = ""
    languages: list[str] = field(default_factory=list)
    time_limit_seconds: int | None = None
    # Languages that actually have a question file on disk, which is not always
    # what meta.json claims.
    present_languages: list[str] = field(default_factory=list)
    has_audio: bool = False

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "major_category": self.major_category,
            "subcategory": self.subcategory,
            "difficulty": self.difficulty,
            "question_type": self.question_type,
            "languages": self.languages,
            "time_limit_seconds": self.time_limit_seconds,
            "present_languages": self.present_languages,
            "has_audio": self.has_audio,
            "path": f"{self.id}/",
        }


class CorpusIndex:
    """
    A cached listing of the corpus.

    Rebuilt on demand rather than watched: the pipeline writes in bulk and
    rarely, so a `reload()` after a generation run is cheaper and more
    predictable than a filesystem watcher.
    """

    def __init__(self, root: Path):
        self.root = root
        self._lock = threading.Lock()
        self._entries: dict[str, QuestionEntry] = {}
        self._loaded = False

    # -- reading ---------------------------------------------------

    def _scan(self) -> dict[str, QuestionEntry]:
        entries: dict[str, QuestionEntry] = {}
        if not self.root.is_dir():
            return entries
        for folder in sorted(self.root.iterdir()):
            if not folder.is_dir() or folder.name.startswith("."):
                continue
            meta_path = folder / "meta.json"
            if not meta_path.is_file():
                continue
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                # A half-written folder should not take the whole listing down.
                continue
            present = sorted(
                p.name.split(".")[1]
                for p in folder.glob("question.*.json")
                if len(p.name.split(".")) == 3
            )
            entries[folder.name] = QuestionEntry(
                id=meta.get("id", folder.name),
                major_category=meta.get("major_category", ""),
                subcategory=meta.get("subcategory", ""),
                difficulty=meta.get("difficulty", ""),
                question_type=meta.get("question_type", ""),
                languages=meta.get("languages", []),
                time_limit_seconds=meta.get("time_limit_seconds"),
                present_languages=present,
                has_audio=(folder / "audio").is_dir(),
            )
        return entries

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        self.reload()

    def reload(self) -> int:
        with self._lock:
            self._entries = self._scan()
            self._loaded = True
            return len(self._entries)

    def all(self) -> list[QuestionEntry]:
        self.ensure_loaded()
        return list(self._entries.values())

    def get(self, question_id: str) -> QuestionEntry | None:
        self.ensure_loaded()
        return self._entries.get(question_id)

    def search(
        self,
        *,
        text: str = "",
        major: str = "",
        difficulty: str = "",
        question_type: str = "",
        language: str = "",
    ) -> list[QuestionEntry]:
        """Filter the listing. Text matches the id, category and subcategory."""
        needle = text.strip().lower()
        results = []
        for entry in self.all():
            if major and entry.major_category != major:
                continue
            if difficulty and entry.difficulty != difficulty:
                continue
            if question_type and entry.question_type != question_type:
                continue
            if language and language not in entry.present_languages:
                continue
            if needle and needle not in " ".join(
                [entry.id, entry.major_category, entry.subcategory]
            ).lower():
                continue
            results.append(entry)
        return results

    def facets(self) -> dict[str, list[str]]:
        """Distinct values, for the filter dropdowns."""
        entries = self.all()
        def distinct(attr: str) -> list[str]:
            return sorted({getattr(e, attr) for e in entries if getattr(e, attr)})
        languages = sorted({lang for e in entries for lang in e.present_languages})
        return {
            "major_category": distinct("major_category"),
            "difficulty": distinct("difficulty"),
            "question_type": distinct("question_type"),
            "language": languages,
        }

    # -- individual files -----------------------------------------

    def _folder(self, question_id: str) -> Path:
        """
        Resolve a question folder, refusing anything that escapes the corpus.

        The id reaches here from a URL, so `..` and absolute paths have to be
        ruled out before it is joined to a filesystem path.
        """
        candidate = (self.root / question_id).resolve()
        root = self.root.resolve()
        if not candidate.is_relative_to(root) or candidate == root:
            raise ValueError(f"Refusing to read outside the corpus: {question_id!r}")
        return candidate

    def read_meta(self, question_id: str) -> dict | None:
        path = self._folder(question_id) / "meta.json"
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def read_question(self, question_id: str, language: str) -> dict | None:
        if not language.isalpha():
            raise ValueError(f"Not a language code: {language!r}")
        path = self._folder(question_id) / f"question.{language}.json"
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def write_question(self, question_id: str, language: str, data: dict) -> None:
        """
        Save an edited question back to its file.

        Written whole and pretty-printed, matching what the pipeline produces,
        so an edit made here shows up in `git diff` as the lines that changed
        rather than as a reformatted file.
        """
        if not language.isalpha():
            raise ValueError(f"Not a language code: {language!r}")
        path = self._folder(question_id) / f"question.{language}.json"
        if not path.is_file():
            raise FileNotFoundError(path)
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


index = CorpusIndex(Path(settings.CORPUS_DIR))
