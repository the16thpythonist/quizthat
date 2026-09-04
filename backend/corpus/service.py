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
import re
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
    #: False for a question generation wrote that nobody has looked at yet.
    #: `build-corpus-index` omits those, so the game never draws one.
    reviewed: bool = True
    #: teaser_title per language. Carried in the listing because an editor that
    #: shows a column of eight-hex-digit ids is not a browsable thing.
    titles: dict[str, str] = field(default_factory=dict)

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
            "reviewed": self.reviewed,
            "titles": self.titles,
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
            titles = {}
            for language in present:
                try:
                    body = json.loads(
                        (folder / f"question.{language}.json").read_text(encoding="utf-8")
                    )
                except (OSError, json.JSONDecodeError):
                    continue
                titles[language] = body.get("teaser_title", "")

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
                # Absent means reviewed: the flag postdates most of the corpus,
                # and defaulting the other way would empty the game.
                reviewed=meta.get("reviewed", True),
                titles=titles,
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
        """Filter the listing. Text matches the id, category, subcategory and teaser titles."""
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
                [entry.id, entry.major_category, entry.subcategory, *entry.titles.values()]
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

    def tree(self) -> list[dict]:
        """
        The category tree the editor's left pane draws, built from the corpus.

        Derived from the meta.json files rather than from
        `pipeline/config/categories.yaml` so every node has questions behind it
        and nothing in the tree is a dead end. The known cost is the
        inconsistency CLAUDE.md records: a corpus holding both `physics` and
        `Physics` shows two nodes, because they really are two different strings
        as far as everything else in the system is concerned. Editing the
        category on one of them is how they get merged.
        """
        majors: dict[str, dict[str, int]] = {}
        for entry in self.all():
            major = entry.major_category or "\u2014"
            subs = majors.setdefault(major, {})
            subs[entry.subcategory or ""] = subs.get(entry.subcategory or "", 0) + 1
        return [
            {
                "major": major,
                "count": sum(subs.values()),
                "subcategories": [
                    {"name": name, "count": count}
                    for name, count in sorted(subs.items())
                    if name
                ],
            }
            for major, subs in sorted(majors.items())
        ]

    # -- audio -----------------------------------------------------

    #: `<kind>.<language>.mp3`, where kind is teaser, question or answer_<n>.
    AUDIO_NAME = re.compile(r"^(teaser|question|answer_\d+)\.([a-z]{2})\.mp3$")

    def audio_files(self, question_id: str) -> list[dict]:
        """
        The clips on disk for one question.

        Size is included because it is the one thing that distinguishes a real
        clip from the zero-byte placeholder a stub-mode run leaves behind — the
        editor shows those as missing rather than offering silence to play.
        """
        folder = self._folder(question_id) / "audio"
        if not folder.is_dir():
            return []
        clips = []
        for path in sorted(folder.iterdir()):
            match = self.AUDIO_NAME.match(path.name)
            if not match or not path.is_file():
                continue
            clips.append(
                {
                    "name": path.name,
                    "kind": match.group(1),
                    "language": match.group(2),
                    "bytes": path.stat().st_size,
                }
            )
        return clips

    def audio_path(self, question_id: str, filename: str):
        """
        Resolve one clip for serving, or None.

        The name is matched against the corpus's own naming pattern rather than
        merely sanitised: it arrives from a URL, and a pattern that admits only
        `teaser.de.mp3` and its siblings cannot be talked into a traversal.
        """
        if not self.AUDIO_NAME.match(filename):
            return None
        path = self._folder(question_id) / "audio" / filename
        return path if path.is_file() else None

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

    #: What the editor may change about a question's identity. Everything else
    #: in meta.json is the pipeline's to write: `id` names the folder, `version`
    #: and `created_at` are provenance, and `languages` follows the files that
    #: actually exist rather than the other way round.
    EDITABLE_META = (
        "major_category",
        "subcategory",
        "difficulty",
        "question_type",
        "time_limit_seconds",
        # Flipped by the Review button rather than by the classification form,
        # but it is an ordinary meta field and goes through the same merge.
        "reviewed",
    )

    def write_meta(self, question_id: str, changes: dict) -> dict:
        """
        Update the editable fields of meta.json, leaving the rest alone.

        Merged into what is on disk rather than written from the request body,
        so a field this editor does not know about survives being edited by one
        that does not.
        """
        path = self._folder(question_id) / "meta.json"
        if not path.is_file():
            raise FileNotFoundError(path)
        meta = json.loads(path.read_text(encoding="utf-8"))
        for field_name in self.EDITABLE_META:
            if field_name in changes:
                meta[field_name] = changes[field_name]
        path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return meta


index = CorpusIndex(Path(settings.CORPUS_DIR))
