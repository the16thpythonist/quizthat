"""JSON API over the corpus folder."""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import is_signed_in
from .service import index


@api_view(["GET"])
def corpus_index(request):
    """
    The same shape as questions/corpus-index.json, built from the folder.

    The generated file stays the one the game fetches; this exists so the
    browser and any tooling can read a live listing without a rebuild step.
    """
    entries = index.all()
    return Response(
        {
            "question_count": len(entries),
            "questions": [e.as_dict() for e in entries],
        }
    )


@api_view(["POST"])
def reload_index(request):
    """
    Re-scan the folder, after the pipeline has written to it.

    Behind the editor's login: it is cheap but it is still a write-shaped
    action, and the reads either side of it are already public because nginx
    serves the same files.
    """
    if not is_signed_in(request):
        return Response(
            {"detail": "Sign in to the corpus editor first."}, status=status.HTTP_403_FORBIDDEN
        )
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
