"""
The one login in QuizThat.

It guards the corpus editor and nothing else. Playing a game needs no account —
players identify themselves with a nickname and a join code, and a television
signs in as nobody at all. But the editor rewrites the question files that every
game draws from, so it is not something to leave open on a network.

There are no user accounts: a single shared username and password, set in the
repo-root `.env`. Deliberately not Django's auth system, which would mean a user
table, migrations and a password reset flow for what is one credential shared by
whoever curates the questions.
"""

import secrets
from functools import wraps

from django.conf import settings
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse

SESSION_KEY = "corpus_admin"


def is_configured() -> bool:
    """
    Whether a password has been set at all.

    With none, the editor refuses rather than opening: a misconfigured server
    should fail loudly, not quietly leave the corpus writable by anyone who can
    reach it.
    """
    return bool(settings.ADMIN_PASSWORD)


def is_signed_in(request) -> bool:
    return bool(request.session.get(SESSION_KEY))


def check_credentials(username: str, password: str) -> bool:
    """
    Compare both halves in constant time.

    `secrets.compare_digest` rather than `==` so the comparison does not leak
    how much of the password was right through how long it took to fail.
    """
    if not is_configured():
        return False
    user_ok = secrets.compare_digest(username, settings.ADMIN_USER)
    password_ok = secrets.compare_digest(password, settings.ADMIN_PASSWORD)
    return user_ok and password_ok


def admin_required(view):
    """Send anyone not signed in to the login page, keeping where they meant to go."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not is_configured():
            return render(request, "corpus/unconfigured.html", status=503)
        if not is_signed_in(request):
            return HttpResponseRedirect(f"{reverse('corpus-login')}?next={request.path}")
        return view(request, *args, **kwargs)

    return wrapper


def login_view(request):
    if not is_configured():
        return render(request, "corpus/unconfigured.html", status=503)

    # Only ever redirect within this site: a `next` taken from the query string
    # is attacker-controlled, and an absolute URL there would turn the login
    # into an open redirect.
    raw_next = request.POST.get("next") or request.GET.get("next") or ""
    destination = raw_next if raw_next.startswith("/") and not raw_next.startswith("//") else "/corpus/"

    error = None
    if request.method == "POST":
        username = request.POST.get("username", "")
        password = request.POST.get("password", "")
        if check_credentials(username, password):
            request.session[SESSION_KEY] = True
            request.session.cycle_key()  # a fresh id, so a fixed one cannot be reused
            return HttpResponseRedirect(destination)
        # One message for both halves: saying which was wrong tells an attacker
        # when they have found a real username.
        error = "Username or password is wrong."

    return render(request, "corpus/login.html", {"error": error, "next": destination})


def logout_view(request):
    request.session.flush()
    return HttpResponseRedirect(reverse("corpus-login"))
