"""
Tests for the corpus editor's login.

It guards the one surface that can rewrite the question files. Everything about
playing a game stays open, and these pin that boundary down in both directions.
"""

import pytest
from django.test import Client

CREDENTIALS = {"username": "curator", "password": "correct horse battery staple"}


@pytest.fixture
def configured(settings):
    """A server with the admin credentials set, as a real deployment would be."""
    settings.ADMIN_USER = CREDENTIALS["username"]
    settings.ADMIN_PASSWORD = CREDENTIALS["password"]
    return settings


@pytest.fixture
def unconfigured(settings):
    settings.ADMIN_PASSWORD = ""
    return settings


def sign_in(client: Client, **overrides) -> None:
    client.post("/corpus/login/", {**CREDENTIALS, **overrides})


@pytest.mark.django_db
class TestWithoutAPassword:
    def test_the_editor_refuses_rather_than_opening(self, unconfigured, client):
        """
        The point of the default.

        A server nobody configured must not quietly leave the corpus writable to
        anyone who can reach it.
        """
        response = client.get("/corpus/")
        assert response.status_code == 503
        assert b"no password set" in response.content

    def test_the_login_page_says_what_to_set(self, unconfigured, client):
        response = client.get("/corpus/login/")
        assert response.status_code == 503
        assert b"QUIZTHAT_ADMIN_PASSWORD" in response.content

    def test_no_password_can_get_in(self, unconfigured, client):
        client.post("/corpus/login/", {"username": "admin", "password": ""})
        assert client.get("/corpus/").status_code == 503


@pytest.mark.django_db
class TestSigningIn:
    def test_the_editor_is_closed_until_you_sign_in(self, configured, client):
        response = client.get("/corpus/")
        assert response.status_code == 302
        assert response.headers["Location"].startswith("/corpus/login/")

    def test_the_right_credentials_open_it(self, configured, client):
        sign_in(client)
        assert client.get("/corpus/").status_code == 200

    def test_a_wrong_password_does_not(self, configured, client):
        sign_in(client, password="hunter2")
        assert client.get("/corpus/").status_code == 302

    def test_a_wrong_username_does_not(self, configured, client):
        sign_in(client, username="somebody")
        assert client.get("/corpus/").status_code == 302

    def test_the_error_does_not_say_which_half_was_wrong(self, configured, client):
        """Saying so would tell an attacker when they had found a real username."""
        wrong_user = client.post("/corpus/login/", {**CREDENTIALS, "username": "nope"})
        wrong_password = client.post("/corpus/login/", {**CREDENTIALS, "password": "nope"})
        assert b"Username or password is wrong." in wrong_user.content
        assert b"Username or password is wrong." in wrong_password.content

    def test_signing_out_closes_it_again(self, configured, client):
        sign_in(client)
        assert client.get("/corpus/").status_code == 200
        client.get("/corpus/logout/")
        assert client.get("/corpus/").status_code == 302

    def test_it_returns_you_to_where_you_were_going(self, configured, client):
        client.get("/corpus/34de3030/de/")  # bounced to the login
        response = client.post(
            "/corpus/login/", {**CREDENTIALS, "next": "/corpus/34de3030/de/"}
        )
        assert response.headers["Location"] == "/corpus/34de3030/de/"

    def test_it_will_not_be_talked_into_an_open_redirect(self, configured, client):
        """`next` comes from the query string, so it is attacker-controlled."""
        for hostile in ("https://example.com/", "//example.com/"):
            response = client.post("/corpus/login/", {**CREDENTIALS, "next": hostile})
            assert response.headers["Location"] == "/corpus/"


@pytest.mark.django_db
class TestWhatStaysOpen:
    def test_editing_a_question_needs_the_login(self, configured, client):
        response = client.get("/corpus/34de3030/de/")
        assert response.status_code == 302

    def test_rescanning_needs_the_login(self, configured, client):
        assert client.post("/api/corpus/reload/").status_code == 403
        sign_in(client)
        assert client.post("/api/corpus/reload/").status_code == 200

    def test_reading_the_corpus_stays_open(self, configured, client):
        # nginx serves the same files to every device in the game anyway, so
        # putting a login in front of the read API would protect nothing.
        assert client.get("/api/corpus/index/").status_code == 200

    def test_playing_a_game_needs_no_account(self, configured, client):
        response = client.post(
            "/api/lobbies/", {"nickname": "Alice"}, content_type="application/json"
        )
        assert response.status_code == 201
        assert client.get("/api/lobbies/open/").status_code == 200
