from django.urls import path

from . import auth, browser

urlpatterns = [
    path("", browser.question_list, name="corpus-browser"),
    path("login/", auth.login_view, name="corpus-login"),
    path("logout/", auth.logout_view, name="corpus-logout"),
    path("<str:question_id>/<str:language>/", browser.question_edit, name="corpus-browser-edit"),
]
