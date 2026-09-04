"""
A small browser and editor for the corpus.

Plain Django views rather than Django Admin: the admin is built on models, and
the corpus deliberately has none. What it needs is a searchable listing and a
form that writes a JSON file back, which is little more than these two views.
"""

import json

from django.contrib import messages
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse

from .auth import admin_required
from .service import index


@admin_required
def question_list(request):
    filters = {
        "text": request.GET.get("q", ""),
        "major": request.GET.get("major", ""),
        "difficulty": request.GET.get("difficulty", ""),
        "question_type": request.GET.get("type", ""),
        "language": request.GET.get("language", ""),
    }
    if request.GET.get("reload"):
        count = index.reload()
        messages.info(request, f"Re-scanned the corpus: {count} questions.")
        return HttpResponseRedirect(reverse("corpus-browser"))

    results = index.search(**filters)
    return render(
        request,
        "corpus/list.html",
        {
            "results": results,
            "total": len(index.all()),
            "filters": filters,
            "facets": index.facets(),
        },
    )


@admin_required
def question_edit(request, question_id: str, language: str):
    try:
        meta = index.read_meta(question_id)
        data = index.read_question(question_id, language)
    except ValueError as exc:
        raise Http404(str(exc)) from exc
    if meta is None or data is None:
        raise Http404("No such question.")

    error = None
    if request.method == "POST":
        raw = request.POST.get("payload", "")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            # Show the broken text back rather than discarding the edit.
            error = f"That is not valid JSON: {exc}"
            data = raw
        else:
            index.write_question(question_id, language, parsed)
            index.reload()
            messages.success(request, f"Saved {question_id}/question.{language}.json")
            return HttpResponseRedirect(
                reverse("corpus-browser-edit", args=[question_id, language])
            )

    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2)
    entry = index.get(question_id)
    return render(
        request,
        "corpus/edit.html",
        {
            "question_id": question_id,
            "language": language,
            "meta": json.dumps(meta, ensure_ascii=False, indent=2),
            "payload": payload,
            "languages": entry.present_languages if entry else [language],
            "error": error,
        },
    )
