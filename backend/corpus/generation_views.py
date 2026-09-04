"""
The editor's generation endpoints.

Starting a run, following it, stopping it — plus the category list the form is
built from. All of it behind the editor's login: a run writes question files and
spends the account's Claude usage, which is not something to leave open on a
network.
"""

from __future__ import annotations

import asyncio
import json

import yaml
from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import generation
from .auth import is_signed_in
from .service import index

#: How often the stream looks for new events. Generation moves in steps of
#: seconds, so a quarter second is far below anything a person perceives.
POLL_INTERVAL = 0.25
#: A run can sit silent for a minute while the agent searches, and a proxy will
#: drop a connection that quiet.
HEARTBEAT_SECONDS = 15


def _needs_login() -> Response:
    return Response(
        {"detail": "Sign in to the corpus editor first."}, status=status.HTTP_403_FORBIDDEN
    )


@api_view(["GET"])
def categories(request):
    """
    The taxonomy the generation form offers, from the pipeline's own config.

    Read from `pipeline/config/categories.yaml` rather than derived from the
    corpus, because the point of generating is to fill a category that has
    nothing in it yet — a corpus-derived list could not offer one.

    **The display names are what the pipeline wants**, not the yaml keys:
    `--category Geography`, not `--category geography`. The keys are internal.
    """
    path = settings.PIPELINE_DIR / "config" / "categories.yaml"
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except OSError:
        return Response(
            {"detail": f"No categories.yaml at {path}."}, status=status.HTTP_404_NOT_FOUND
        )

    # How many questions the corpus already holds per bucket, so the form can
    # show where the gaps are without a second request.
    counts: dict[str, int] = {}
    for entry in index.all():
        key = f"{entry.major_category}/{entry.subcategory}"
        counts[key] = counts.get(key, 0) + 1

    result = []
    for data in (raw.get("categories") or {}).values():
        name = data.get("name", "")
        subs = [
            {"name": sub_name, "count": counts.get(f"{name}/{sub_name}", 0)}
            for sub_name in (data.get("subcategories") or {}).values()
        ]
        result.append(
            {
                "name": name,
                "count": sum(sub["count"] for sub in subs),
                "subcategories": sorted(subs, key=lambda sub: sub["name"]),
            }
        )
    return Response({"categories": sorted(result, key=lambda cat: cat["name"])})


@api_view(["GET", "POST", "DELETE"])
def generate(request):
    """Ask whether generation is possible and what is running; start it; stop it."""
    if not is_signed_in(request):
        return _needs_login()

    if request.method == "GET":
        run = generation.current_run()
        return Response(
            {"capability": generation.capability(), "run": run.summary() if run else None}
        )

    if request.method == "DELETE":
        return Response({"stopped": generation.stop()})

    data = request.data if isinstance(request.data, dict) else {}
    category = (data.get("category") or "").strip()
    subcategory = (data.get("subcategory") or "").strip()
    if not category or not subcategory:
        return Response(
            {"detail": "A category and a subcategory are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        count = int(data.get("count", 1))
    except (TypeError, ValueError):
        return Response({"detail": "count must be a number."}, status=status.HTTP_400_BAD_REQUEST)
    if not 1 <= count <= generation.MAX_COUNT:
        return Response(
            {"detail": f"count must be between 1 and {generation.MAX_COUNT}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    languages = data.get("languages") or ["en", "de"]
    if not isinstance(languages, list) or not all(isinstance(lang, str) for lang in languages):
        return Response(
            {"detail": "languages must be a list of codes."}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        run = generation.start(
            category=category,
            subcategory=subcategory,
            difficulty=data.get("difficulty") or "medium",
            question_type=data.get("question_type") or "multiple_choice",
            count=count,
            languages=languages,
            model=(data.get("model") or "").strip() or None,
            dry_run=bool(data.get("dry_run")),
        )
    except RuntimeError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

    return Response(run.summary(), status=status.HTTP_202_ACCEPTED)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@sync_to_async
def _signed_in(request) -> bool:
    """
    The login check, off the event loop.

    Reading the session is a database query, and Django refuses one from async
    context. The relay's stream does the same for every read it makes.
    """
    return is_signed_in(request)


async def generate_events(request):
    """
    The run's events, as they happen.

    Replays from the beginning rather than only sending what arrives next: a
    browser that reloads mid-run should see the whole run, and the events are
    already in memory. A run is at most a few hundred of them.
    """
    if not await _signed_in(request):
        return StreamingHttpResponse(
            iter([_sse("error", {"detail": "Sign in to the corpus editor first."})]),
            content_type="text/event-stream",
            status=403,
        )

    async def stream():
        sent = 0
        last_beat = asyncio.get_event_loop().time()

        while True:
            run = generation.current_run()
            if run is None:
                yield _sse("idle", {})
                return

            for event in run.since(sent):
                sent += 1
                yield _sse("progress", event)

            if run.status != "running" and sent >= run.event_count:
                yield _sse("closed", run.summary())
                return

            now = asyncio.get_event_loop().time()
            if now - last_beat >= HEARTBEAT_SECONDS:
                last_beat = now
                yield ": keep-alive\n\n"

            await asyncio.sleep(POLL_INTERVAL)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    # nginx would otherwise buffer the whole response, which for a stream means
    # holding every event until the run ended.
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(["PUT"])
def review_question(request, question_id: str):
    """
    Mark a question reviewed, or put it back.

    `build-corpus-index` omits unreviewed questions, so this is what actually
    puts a generated question in front of players.
    """
    if not is_signed_in(request):
        return _needs_login()

    reviewed = request.data.get("reviewed", True)
    if not isinstance(reviewed, bool):
        return Response(
            {"detail": "reviewed must be true or false."}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        meta = index.write_meta(question_id, {"reviewed": reviewed})
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except FileNotFoundError:
        return Response({"detail": "No such question."}, status=status.HTTP_404_NOT_FOUND)

    index.reload()
    return Response(meta)
