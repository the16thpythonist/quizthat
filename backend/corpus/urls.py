from django.urls import path

from . import generation_views, views

# The single-segment routes are listed first. `<str:question_id>/<str:language>/`
# needs two segments so it cannot swallow them, but keeping the literals at the
# top means a future one-segment route does not quietly become a question id.
urlpatterns = [
    path("session/", views.session_view, name="corpus-session"),
    path("index/", views.corpus_index, name="corpus-index"),
    path("tree/", views.corpus_tree, name="corpus-tree"),
    path("reload/", views.reload_index, name="corpus-reload"),
    path("categories/", generation_views.categories, name="corpus-categories"),
    path("generate/", generation_views.generate, name="corpus-generate"),
    path("generate/events/", generation_views.generate_events, name="corpus-generate-events"),
    path("questions/<str:question_id>/", views.question_bundle, name="corpus-bundle"),
    path("questions/<str:question_id>/meta/", views.write_meta, name="corpus-write-meta"),
    path(
        "questions/<str:question_id>/review/",
        generation_views.review_question,
        name="corpus-review",
    ),
    path(
        "questions/<str:question_id>/audio/<str:filename>",
        views.question_audio,
        name="corpus-audio",
    ),
    path(
        "questions/<str:question_id>/<str:language>/",
        views.write_question,
        name="corpus-write-question",
    ),
    path("<str:question_id>/<str:language>/", views.question_detail, name="corpus-question"),
]
