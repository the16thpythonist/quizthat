from django.urls import path

from . import browser

urlpatterns = [
    path("", browser.question_list, name="corpus-browser"),
    path("<str:question_id>/<str:language>/", browser.question_edit, name="corpus-browser-edit"),
]
