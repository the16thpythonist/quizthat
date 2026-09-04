from django.urls import path

from . import views

urlpatterns = [
    path("", views.create_lobby, name="create-lobby"),
    path("<str:code>/", views.lobby_detail, name="lobby-detail"),
    path("<str:code>/join/", views.join_lobby, name="join-lobby"),
    path("<str:code>/start/", views.start_lobby, name="start-lobby"),
    path("<str:code>/leave/", views.leave_lobby, name="leave-lobby"),
    path("<str:code>/intents/", views.post_intent, name="post-intent"),
    path("<str:code>/snapshot/", views.post_snapshot, name="post-snapshot"),
    path("<str:code>/events/", views.events, name="lobby-events"),
]
