from django.urls import path

from . import views

urlpatterns = [
    path("leaderboard/", views.leaderboard, name="leaderboard"),
    path("profiles/<str:nickname>/", views.profile_detail, name="profile-detail"),
    path("report/<str:code>/", views.report_result, name="report-result"),
]
