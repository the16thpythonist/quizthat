"""
Driving the generation pipeline from the server.

The pipeline is a **separate application** with its own virtualenv, and the
question-writing agent is the `claude` CLI, which the pipeline spawns in turn.
So this runs it as a subprocess rather than importing it: installing the
pipeline into the backend's venv would drag in `elevenlabs` and
`claude-agent-sdk`, and would still not spare us the CLI subprocess underneath.

`quizthat generate-batch --json-events` prints one JSON object per line, which
is the whole reason that flag exists — a reader can follow a run while it is
still going. A thread drains stdout into a buffer, and the SSE view replays that
buffer to whoever is watching.

**One run at a time, server-wide.** Generation is sequential inside the pipeline
anyway (parallel agents would race on the duplicate check), and two runs would
give the editor two event streams to interleave for no gain.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.conf import settings

#: Bound on a single run. Generation takes a minute or two per question, so a
#: hundred would be an afternoon — and almost certainly a typo.
MAX_COUNT = 25

#: How long a finished run's events stay readable, so a browser that reconnects
#: still sees how the run ended.
KEEP_FINISHED_SECONDS = 60 * 30


@dataclass
class Run:
    """One `generate-batch` invocation and everything it has said so far."""

    id: str
    params: dict[str, Any]
    started_at: float
    events: list[dict] = field(default_factory=list)
    status: str = "running"  # running | finished | failed | stopped
    error: str | None = None
    finished_at: float | None = None
    process: subprocess.Popen | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def append(self, event: dict) -> None:
        with self._lock:
            self.events.append(event)

    def since(self, index: int) -> list[dict]:
        """Events after `index`, as a snapshot the caller can iterate safely."""
        with self._lock:
            return self.events[index:]

    @property
    def event_count(self) -> int:
        with self._lock:
            return len(self.events)

    def summary(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "error": self.error,
            "params": self.params,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "event_count": self.event_count,
        }


_current: Run | None = None
_start_lock = threading.Lock()


def current_run() -> Run | None:
    """The run in progress, or the most recent one while it is still fresh."""
    global _current
    run = _current
    if (
        run is not None
        and run.status != "running"
        and run.finished_at is not None
        and time.time() - run.finished_at > KEEP_FINISHED_SECONDS
    ):
        _current = None
        return None
    return run


# ─── Can this machine generate at all? ───────────────────────────


def pipeline_command() -> list[str] | None:
    """
    How to invoke the pipeline CLI, or None if it is not installed.

    Prefers the console script in the pipeline's own venv over `uv run`, which
    would re-resolve the environment on every call and needs a writable cache —
    neither of which a request should be waiting on.
    """
    console_script = Path(settings.PIPELINE_DIR) / ".venv" / "bin" / "quizthat"
    if console_script.is_file():
        return [str(console_script)]
    # Installed onto PATH instead, which is how the Docker image does it.
    on_path = shutil.which("quizthat")
    if on_path:
        return [on_path]
    uv = shutil.which("uv")
    if uv and Path(settings.PIPELINE_DIR).is_dir():
        return [uv, "run", "--project", str(settings.PIPELINE_DIR), "quizthat"]
    return None


def capability() -> dict:
    """
    Whether generation can run here, and if not, exactly what is missing.

    Worth reporting in this much detail because every one of these fails at a
    different layer — the editor is a Django process, spawning the pipeline,
    which spawns the `claude` CLI — and "generation failed" would leave nobody
    any the wiser about which.
    """
    command = pipeline_command()
    claude = shutil.which("claude")
    # The CLI refuses to start inside another Claude Code session, and bypassing
    # that crashes both sessions. If the server was launched from one, say so
    # rather than letting every run fail with a subprocess error.
    nested = bool(os.environ.get("CLAUDECODE"))

    reasons = []
    if command is None:
        reasons.append(
            "The pipeline is not installed here — expected "
            f"{Path(settings.PIPELINE_DIR) / '.venv' / 'bin' / 'quizthat'}. "
            "Run `uv sync` in pipeline/."
        )
    if claude is None:
        reasons.append(
            "The `claude` CLI is not on this server's PATH. The generation agent "
            "runs through it, so it has to be installed and signed in as the user "
            "running the backend."
        )
    if nested:
        reasons.append(
            "This server was started from inside a Claude Code session "
            "(CLAUDECODE is set). The `claude` CLI refuses to nest, because "
            "nested sessions crash each other. Start the backend from an "
            "ordinary terminal."
        )

    return {
        "available": not reasons,
        "reasons": reasons,
        "pipeline": " ".join(command) if command else None,
        "claude": claude,
        "questions_dir": str(settings.CORPUS_DIR),
        "max_count": MAX_COUNT,
    }


# ─── Running ─────────────────────────────────────────────────────


def start(
    *,
    category: str,
    subcategory: str,
    difficulty: str,
    question_type: str,
    count: int,
    languages: list[str],
    model: str | None,
    dry_run: bool = False,
) -> Run:
    """
    Launch a run. Raises `RuntimeError` if one is already going or none can be.
    """
    global _current

    with _start_lock:
        existing = current_run()
        if existing is not None and existing.status == "running":
            raise RuntimeError("A generation run is already going.")

        state = capability()
        if not state["available"]:
            raise RuntimeError(" ".join(state["reasons"]))

        command = pipeline_command()
        assert command is not None  # capability() just checked
        argv = [
            *command,
            "generate-batch",
            "--category", category,
            "--subcategory", subcategory,
            "--difficulty", difficulty,
            "--type", question_type,
            "--count", str(count),
            "--languages", ",".join(languages),
            "--json-events",
        ]
        if model:
            argv += ["--model", model]
        if dry_run:
            argv.append("--dry-run")

        env = {
            **os.environ,
            # The pipeline's default is the *relative* Path("questions"), which
            # would resolve against the server's working directory rather than
            # the corpus it is actually serving.
            "QUIZTHAT_QUESTIONS_DIR": str(settings.CORPUS_DIR),
        }

        run = Run(
            id=uuid.uuid4().hex[:12],
            params={
                "category": category,
                "subcategory": subcategory,
                "difficulty": difficulty,
                "question_type": question_type,
                "count": count,
                "languages": languages,
                "model": model,
                "dry_run": dry_run,
            },
            started_at=time.time(),
        )

        try:
            run.process = subprocess.Popen(
                argv,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(settings.PIPELINE_DIR),
                env=env,
                text=True,
                bufsize=1,  # line buffered, so events arrive as they are printed
            )
        except OSError as exc:
            run.status = "failed"
            run.error = f"Could not start the pipeline: {exc}"
            run.finished_at = time.time()
            _current = run
            return run

        _current = run
        threading.Thread(target=_drain, args=(run,), daemon=True).start()
        return run


def _drain(run: Run) -> None:
    """
    Read the run's output until it exits.

    stdout is the event stream. stderr is collected separately and only
    surfaced if the run fails — the pipeline logs there routinely, and a warning
    is not something to show as an error.
    """
    process = run.process
    assert process is not None and process.stdout is not None

    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            # Anything that is not an event is the pipeline talking to a human.
            # Keep it, marked, rather than dropping it: when a run misbehaves
            # this is usually where the reason is.
            event = {"event": "output", "text": line}
        run.append(event)

    process.wait()
    stderr = process.stderr.read() if process.stderr else ""

    if run.status == "stopped":
        pass
    elif process.returncode == 0:
        run.status = "finished"
    else:
        run.status = "failed"
        run.error = _last_meaningful_line(stderr) or f"exited with code {process.returncode}"

    run.finished_at = time.time()
    run.append({"event": "run_closed", "status": run.status, "error": run.error})


def _last_meaningful_line(stderr: str) -> str | None:
    """
    The most useful line of a traceback, for a one-line error.

    The last line of a Python traceback is the exception; the last line of the
    agent SDK's output is usually a wrapper around it. Taking the last non-empty
    line is right often enough, and the full text stays in the events.
    """
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    return lines[-1] if lines else None


def stop() -> bool:
    """Ask the current run to stop. Returns whether there was one."""
    run = current_run()
    if run is None or run.status != "running" or run.process is None:
        return False
    run.status = "stopped"
    run.error = "Stopped."
    # Questions already written stay written — each is committed by its own tool
    # call, so stopping cancels the rest of the batch rather than undoing it.
    run.process.terminate()
    return True
