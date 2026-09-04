"""
JSON API over the corpus folder.

Two audiences. The game reads a listing here (or, more often, the static
`corpus-index.json` nginx serves) and needs no account. The editor at `/admin`
reads and *writes* through the same module, and everything write-shaped is
behind the one shared login in `auth.py`.

Reads stay open on purpose: nginx already serves the very same files to every
device in a game, so a login in front of the read API would protect nothing
while breaking offline play.
"""

from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import SESSION_KEY, check_credentials, is_configured, is_signed_in
from .service import index


def _needs_login() -> Response:
    return Response(
        {"detail": "Sign in to the corpus editor first."}, status=status.HTTP_403_FORBIDDEN
    )


# ─── The editor's session ────────────────────────────────────────
#
# The template browser signs in through a form and a redirect; the SPA has no
# page to redirect to, so it gets the same credential check as JSON.
#
# No CSRF token is exchanged, matching the rest of this server: DRF views are
# csrf-exempt and the session cookie is SameSite=Lax, so another origin cannot
# make a browser post here with the editor's cookie attached.


@api_view(["GET", "POST", "DELETE"])
def session_view(request):
    """Ask who is signed in, sign in, or sign out."""
    if request.method == "GET":
        return Response({"configured": is_configured(), "signed_in": is_signed_in(request)})

    if request.method == "DELETE":
        request.session.flush()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if not is_configured():
        return Response(
            {
                "detail": "No editor password is set. Put QUIZTHAT_ADMIN_PASSWORD in the "
                "repo-root .env and restart the server."
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    username = request.data.get("username") or ""
    password = request.data.get("password") or ""
    if not check_credentials(username, password):
        # One message for both halves, so a wrong username is not distinguishable
        # from a wrong password.
        return Response(
            {"detail": "Username or password is wrong."}, status=status.HTTP_401_UNAUTHORIZED
        )

    request.session[SESSION_KEY] = True
    request.session.cycle_key()  # a fresh id, so a fixed one cannot be reused
    return Response({"configured": True, "signed_in": True})


# ─── Reading ─────────────────────────────────────────────────────


@api_view(["GET"])
def corpus_index(request):
    """
    The same shape as questions/corpus-index.json, built from the folder.

    The generated file stays the one the game fetches; this exists so the
    editor and any tooling can read a live listing without a rebuild step.
    """
    entries = index.all()
    return Response(
        {
            "question_count": len(entries),
            "questions": [e.as_dict() for e in entries],
        }
    )


@api_view(["GET"])
def corpus_tree(request):
    """The category tree for the editor's left pane, plus the filter facets."""
    return Response({"tree": index.tree(), "facets": index.facets()})


@api_view(["POST"])
def reload_index(request):
    """
    Re-scan the folder, after the pipeline has written to it.

    Behind the editor's login: it is cheap but it is still a write-shaped
    action, and the reads either side of it are already public because nginx
    serves the same files.
    """
    if not is_signed_in(request):
        return _needs_login()
    return Response({"question_count": index.reload()})


@api_view(["GET"])
def question_detail(request, question_id: str, language: str):
    try:
        data = index.read_question(question_id, language)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if data is None:
        return Response({"detail": "No such question."}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(["GET"])
def question_bundle(request, question_id: str):
    """
    Everything the detail pane needs about one question, in one request.

    Every language at once rather than one per request: the pane has a language
    switcher, and refetching on each flick between de and en would make a
    comparison that should be instant feel like navigation.
    """
    try:
        meta = index.read_meta(question_id)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if meta is None:
        return Response({"detail": "No such question."}, status=status.HTTP_404_NOT_FOUND)

    entry = index.get(question_id)
    present = entry.present_languages if entry else []
    # `present_languages` is derived from the filenames on disk, so each read
    # here is of a file the scan has already seen.
    languages = {lang: index.read_question(question_id, lang) for lang in present}

    return Response(
        {
            "id": question_id,
            "meta": meta,
            "present_languages": present,
            "languages": languages,
            "audio": index.audio_files(question_id),
        }
    )


@api_view(["GET"])
def question_audio(request, question_id: str, filename: str):
    """
    Stream one clip.

    Served by Django rather than left to nginx so the editor works wherever it
    is reachable — including from outside the LAN, where the corpus volume the
    game's static server exposes is not necessarily published at all.
    """
    try:
        path = index.audio_path(question_id, filename)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if path is None:
        return Response({"detail": "No such clip."}, status=status.HTTP_404_NOT_FOUND)
    return FileResponse(path.open("rb"), content_type="audio/mpeg")


# ─── Writing ─────────────────────────────────────────────────────


@api_view(["PUT"])
def write_question(request, question_id: str, language: str):
    """Save the per-language question file."""
    if not is_signed_in(request):
        return _needs_login()

    payload = request.data
    if not isinstance(payload, dict):
        return Response(
            {"detail": "A question must be a JSON object."}, status=status.HTTP_400_BAD_REQUEST
        )
    if not str(payload.get("question_text", "")).strip():
        return Response(
            {"detail": "question_text cannot be empty."}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        index.write_question(question_id, language, payload)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except FileNotFoundError:
        return Response(
            {"detail": "No such question in that language."}, status=status.HTTP_404_NOT_FOUND
        )

    # The listing shows teaser-independent fields only, but a save is rare and a
    # re-scan is cheap — cheaper than reasoning about when the index went stale.
    index.reload()
    return Response(payload)


@api_view(["PUT"])
def write_meta(request, question_id: str):
    """
    Save the editable half of meta.json.

    Only the fields in `CorpusIndex.EDITABLE_META` move; `id`, `languages`,
    `version` and the provenance fields belong to the pipeline and are merged
    back over whatever the editor sent.
    """
    if not is_signed_in(request):
        return _needs_login()

    payload = request.data
    if not isinstance(payload, dict):
        return Response(
            {"detail": "meta must be a JSON object."}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        meta = index.write_meta(question_id, payload)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except FileNotFoundError:
        return Response({"detail": "No such question."}, status=status.HTTP_404_NOT_FOUND)

    # The category is what the left-hand tree is built from, so the tree the
    # editor is looking at is wrong until this runs.
    index.reload()
    return Response(meta)
