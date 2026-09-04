"""
Generation progress, as data rather than as a terminal drawing.

The Rich `Live` display in `generate.py` is for a person watching a terminal.
Anything else that wants to follow a run — the editor at `/admin`, a log, a CI
job — needs the same information as structured records, which is what this is.

One JSON object per line on stdout, so a reader can consume it incrementally
without waiting for the process to exit. **Emitting events and drawing to the
console are mutually exclusive**: Rich would interleave escape codes into the
stream and a reader would choke on them.

The vocabulary is small on purpose. A consumer that does not recognise an
`event` should ignore it rather than fail, so new kinds can be added here
without breaking anything downstream.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable, Protocol

#: What a caller passes in to follow a run. `None` means nobody is watching.
EventSink = Callable[[dict[str, Any]], None] | None


class _Writer(Protocol):
    def write(self, text: str, /) -> int: ...
    def flush(self) -> None: ...


def jsonl_sink(stream: _Writer | None = None) -> Callable[[dict[str, Any]], None]:
    """
    An `EventSink` that writes one JSON line per event.

    Flushed per line: the whole point is that a reader sees a turn while the
    run is still going, and a block-buffered pipe would hold everything until
    the process ended.
    """
    out = stream if stream is not None else sys.stdout

    def emit(event: dict[str, Any]) -> None:
        out.write(json.dumps(event, ensure_ascii=False) + "\n")
        out.flush()

    return emit


def emit(sink: EventSink, event: str, **fields: Any) -> None:
    """
    Send one event, if anyone is listening.

    Never raises: a run must not fail because the thing watching it went away —
    a closed pipe when the browser navigated off the page is the ordinary case,
    not an error worth losing a half-generated question over.
    """
    if sink is None:
        return
    try:
        sink({"event": event, **fields})
    except Exception:  # noqa: BLE001 - see the docstring
        pass


def summarize(value: Any, limit: int = 300) -> str:
    """
    A short, printable rendering of a tool's input or output.

    Truncated because a WebSearch result can be tens of kilobytes and the point
    of showing it is to convey *what the agent is doing*, not to reproduce what
    it read.
    """
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            text = str(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
