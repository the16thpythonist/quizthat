"""Tests for match history — mostly about the nickname-as-identity trade."""

import pytest
from rest_framework.test import APIClient

from stats.models import GameResult, Participation, Profile


@pytest.fixture
def api():
    return APIClient()


def lobby_with_host(api: APIClient):
    response = api.post("/api/lobbies/", {"nickname": "Alice"}, format="json")
    return response.data["lobby"]["code"], response.data["member"]["token"]


_DEFAULT = object()


def report(api: APIClient, code: str, token: str, session_id="s1", players=_DEFAULT):
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api.post(
        f"/api/stats/report/{code}/",
        {
            "session_id": session_id,
            "rounds": 4,
            "players": DEFAULT_PLAYERS if players is _DEFAULT else players,
        },
        format="json",
    )


DEFAULT_PLAYERS = [
    {
        "nickname": "Alice",
        "seat": 0,
        "color": "red",
        "won": True,
        "pegs": 4,
        "questions_attempted": 6,
        "questions_correct": 5,
    },
    {
        "nickname": "Bob",
        "seat": 1,
        "color": "blue",
        "won": False,
        "pegs": 2,
        "questions_attempted": 6,
        "questions_correct": 2,
    },
]


@pytest.mark.django_db
class TestReporting:
    def test_the_host_records_a_finished_game(self, api):
        code, token = lobby_with_host(api)
        response = report(api, code, token)
        assert response.status_code == 201
        assert response.data["recorded"] is True
        assert GameResult.objects.count() == 1
        assert Participation.objects.count() == 2
        assert Profile.objects.count() == 2

    def test_reporting_the_same_session_twice_does_not_double_count(self, api):
        code, token = lobby_with_host(api)
        report(api, code, token)
        second = report(api, code, token)
        # A host that reconnects and re-sends should be a no-op, not an error.
        assert second.status_code == 200
        assert second.data["recorded"] is False
        assert GameResult.objects.count() == 1
        assert Participation.objects.count() == 2

    def test_only_the_host_may_report(self, api):
        code, _ = lobby_with_host(api)
        guest = APIClient().post(
            f"/api/lobbies/{code}/join/", {"nickname": "Bob"}, format="json"
        ).data["member"]["token"]
        assert report(api, code, guest).status_code == 403
        assert GameResult.objects.count() == 0

    def test_a_report_needs_players(self, api):
        code, token = lobby_with_host(api)
        assert report(api, code, token, players=[]).status_code == 400


@pytest.mark.django_db
class TestIdentity:
    def test_the_same_nickname_is_the_same_profile_across_games(self, api):
        code, token = lobby_with_host(api)
        report(api, code, token, session_id="s1")
        report(api, code, token, session_id="s2")
        alice = Profile.objects.get(key="alice")
        assert alice.participations.count() == 2

    def test_nicknames_match_regardless_of_capitalisation(self, api):
        code, token = lobby_with_host(api)
        report(api, code, token, session_id="s1")
        report(
            api,
            code,
            token,
            session_id="s2",
            players=[{"nickname": "ALICE", "seat": 0, "won": False, "pegs": 1,
                      "questions_attempted": 1, "questions_correct": 0}],
        )
        assert Profile.objects.count() == 2  # Alice and Bob, not three
        alice = Profile.objects.get(key="alice")
        assert alice.participations.count() == 2
        # The most recently typed spelling wins the display name.
        assert alice.display_name == "ALICE"

    def test_two_different_people_sharing_a_name_share_a_profile(self, api):
        """
        The accepted cost of having no accounts.

        Documented as a test rather than a comment so nobody 'fixes' it by
        accident and quietly changes what the leaderboard means.
        """
        code, token = lobby_with_host(api)
        report(api, code, token, session_id="s1")
        report(
            api,
            code,
            token,
            session_id="s2",
            players=[{"nickname": "Alice", "seat": 0, "won": True, "pegs": 4,
                      "questions_attempted": 4, "questions_correct": 4}],
        )
        assert Profile.objects.get(key="alice").participations.count() == 2


@pytest.mark.django_db
class TestLeaderboard:
    def test_it_counts_wins_games_and_accuracy(self, api):
        code, token = lobby_with_host(api)
        report(api, code, token, session_id="s1")
        rows = APIClient().get("/api/stats/leaderboard/").data
        by_name = {row["nickname"]: row for row in rows}
        assert by_name["Alice"]["wins"] == 1
        assert by_name["Alice"]["games"] == 1
        assert by_name["Bob"]["wins"] == 0
        assert by_name["Bob"]["accuracy"] == pytest.approx(2 / 6, abs=1e-3)

    def test_accuracy_is_null_rather_than_zero_when_nothing_was_attempted(self, api):
        code, token = lobby_with_host(api)
        report(
            api,
            code,
            token,
            players=[{"nickname": "Idle", "seat": 0, "won": False, "pegs": 0,
                      "questions_attempted": 0, "questions_correct": 0}],
        )
        row = next(r for r in APIClient().get("/api/stats/leaderboard/").data if r["nickname"] == "Idle")
        assert row["accuracy"] is None

    def test_a_profile_lists_its_games(self, api):
        code, token = lobby_with_host(api)
        report(api, code, token, session_id="s1")
        data = APIClient().get("/api/stats/profiles/alice/").data
        assert data["nickname"] == "Alice"
        assert len(data["games"]) == 1
        assert data["games"][0]["won"] is True

    def test_an_unknown_profile_is_a_404(self, api):
        assert APIClient().get("/api/stats/profiles/nobody/").status_code == 404
