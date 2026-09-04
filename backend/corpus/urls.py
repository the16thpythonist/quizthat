from django.urls import path

from . import views

urlpatterns = [
    path("index/", views.corpus_index, name="corpus-index"),
    path("reload/", views.reload_index, name="corpus-reload"),
    path("<str:question_id>/<str:language>/", views.question_detail, name="corpus-question"),
]
