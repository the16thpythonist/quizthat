"""
Tests for the relay.

These pin down the routing rules — who may act, who may publish, and who
receives what — because they are the only guarantees the server actually makes.
It does not know the game, so there is nothing else here to be right about.
"""

import pytest
from rest_framework.test import APIClient

from lobbies.models import Intent, Lobby, Member, Snapshot


@pytest.fixture
def api():
    return APIClient()


def auth(client: APIClient, token: str) -> APIClient:
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def make_lobby(api: APIClient, nickname: str = "Alice"):
    response = api.post("/api/lobbies/", {"nickname": nickname}, format="json")
    assert response.status_code == 201
    return response.data["lobby"]["code"], response.data["member"]["token"]


def join(api: APIClient, code: str, nickname: str, role: str = "player"):
    fresh = APIClient()
    response = fresh.post(
        f"/api/lobbies/{code}/join/", {"nickname": nickname, "role": role}, format="json"
    )
    return response


@pytest.mark.django_db
class TestLobbyLifecycle:
    def test_creating_a_lobby_makes_the_creator_its_host(self, api):
        code, token = make_lobby(api)
        member = Member.objects.get(token=token)
        assert member.is_host
        assert member.role == Member.Role.PLAYER
        assert len(code) == 5

    def test_a_lobby_needs_a_nickname(self, api):
        assert api.post("/api/lobbies/", {}, format="json").status_code == 400

    def test_codes_avoid_glyphs_that_are_read_wrong(self, api):
        for _ in range(20):
            code, _ = make_lobby(APIClient())
            assert not set(code) & set("O0I1L")

    def test_a_second_player_can_join_an_open_lobby(self, api):
        code, _ = make_lobby(api)
        response = join(api, code, "Bob")
        assert response.status_code == 201
        assert response.data["member"]["token"]
        assert len(response.data["lobby"]["members"]) == 2

    def test_two_players_cannot_share_a_nickname(self, api):
        code, _ = make_lobby(api, "Alice")
        assert join(api, code, "alice").status_code == 409

    def test_a_lobby_holds_six_players(self, api):
        code, _ = make_lobby(api, "P0")
        for n in range(1, 6):
            assert join(api, code, f"P{n}").status_code == 201
        assert join(api, code, "P6").status_code == 409

    def test_starting_fixes_the_seat_order(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        join(api, code, "Cara")
        response = auth(api, host).post(f"/api/lobbies/{code}/start/")
        assert response.status_code == 200
        seats = list(
            Member.objects.filter(lobby__code=code).order_by("joined_at").values_list("seat", flat=True)
        )
        assert seats == [0, 1, 2]
        assert Lobby.objects.get(code=code).status == Lobby.Status.PLAYING

    def test_only_the_host_starts_the_game(self, api):
        code, _ = make_lobby(api)
        guest = join(api, code, "Bob").data["member"]["token"]
        assert auth(api, guest).post(f"/api/lobbies/{code}/start/").status_code == 403

    def test_a_game_needs_two_players(self, api):
        code, host = make_lobby(api)
        assert auth(api, host).post(f"/api/lobbies/{code}/start/").status_code == 409

    def test_a_player_cannot_join_a_game_in_progress(self, api):
        code, host = make_lobby(api)
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        assert join(api, code, "Cara").status_code == 409

    def test_a_spectator_can_join_a_game_in_progress(self, api):
        # The TV is switched on after everyone has already sat down.
        code, host = make_lobby(api)
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        response = join(api, code, "Living room", role="spectator")
        assert response.status_code == 201
        assert response.data["member"]["seat"] is None

    def test_the_host_leaving_closes_the_lobby(self, api):
        code, host = make_lobby(api)
        join(api, code, "Bob")
        assert auth(api, host).post(f"/api/lobbies/{code}/leave/").status_code == 204
        assert Lobby.objects.get(code=code).status == Lobby.Status.FINISHED

    def test_a_guest_leaving_only_removes_them(self, api):
        code, _ = make_lobby(api)
        guest = join(api, code, "Bob").data["member"]["token"]
        auth(APIClient(), guest).post(f"/api/lobbies/{code}/leave/")
        assert Lobby.objects.get(code=code).status == Lobby.Status.OPEN
        assert Member.objects.filter(lobby__code=code).count() == 1


@pytest.mark.django_db
class TestIntents:
    def test_a_player_queues_an_intent_with_their_seat_attached(self, api):
        code, host = make_lobby(api)
        guest = join(api, code, "Bob").data["member"]["token"]
        auth(api, host).post(f"/api/lobbies/{code}/start/")

        response = auth(APIClient(), guest).post(
            f"/api/lobbies/{code}/intents/",
            {"intent": {"type": "submitAnswer", "args": [{"type": "multiple_choice", "index": 2}]}},
            format="json",
        )
        assert response.status_code == 202
        intent = Intent.objects.get(pk=response.data["id"])
        # The seat is added by the server, so the host never has to trust a
        # claim made inside the payload about who is acting.
        assert intent.payload["seat"] == 1
        assert intent.payload["type"] == "submitAnswer"

    def test_a_spectator_cannot_act(self, api):
        code, _ = make_lobby(api)
        tv = join(api, code, "TV", role="spectator").data["member"]["token"]
        response = auth(APIClient(), tv).post(
            f"/api/lobbies/{code}/intents/",
            {"intent": {"type": "placePeg", "args": [0, 0]}},
            format="json",
        )
        assert response.status_code == 403
        assert Intent.objects.count() == 0

    def test_a_stranger_cannot_act(self, api):
        code, _ = make_lobby(api)
        response = auth(APIClient(), "not-a-real-token").post(
            f"/api/lobbies/{code}/intents/",
            {"intent": {"type": "placePeg", "args": [0, 0]}},
            format="json",
        )
        assert response.status_code == 403

    def test_a_malformed_intent_is_refused(self, api):
        code, host = make_lobby(api)
        response = auth(api, host).post(
            f"/api/lobbies/{code}/intents/", {"intent": "placePeg"}, format="json"
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestSnapshots:
    def test_the_host_publishes_a_blob_per_member(self, api):
        code, host = make_lobby(api, "Alice")
        bob = join(api, code, "Bob").data["member"]["token"]
        auth(api, host).post(f"/api/lobbies/{code}/start/")

        response = auth(api, host).post(
            f"/api/lobbies/{code}/snapshot/",
            {
                "version": 4,
                "snapshots": {host: {"state": "selection", "mine": True}, bob: {"state": "selection"}},
            },
            format="json",
        )
        assert response.status_code == 200
        assert response.data["written"] == 2

        bob_member = Member.objects.get(token=bob)
        assert Snapshot.objects.get(member=bob_member).blob == {"state": "selection"}

    def test_each_member_only_gets_the_blob_addressed_to_them(self, api):
        """
        The redaction guarantee, from the server's side.

        The host decides what to hide; all the server promises is that a blob
        filed under one member is never handed to another.
        """
        code, host = make_lobby(api, "Alice")
        bob = join(api, code, "Bob").data["member"]["token"]
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        auth(api, host).post(
            f"/api/lobbies/{code}/snapshot/",
            {
                "version": 1,
                "snapshots": {
                    host: {"battle": {"answers": [{"seat": 0, "value": 42}]}},
                    bob: {"battle": {"answers": []}},
                },
            },
            format="json",
        )
        bob_blob = Snapshot.objects.get(member__token=bob).blob
        assert bob_blob["battle"]["answers"] == []

    def test_only_the_host_publishes(self, api):
        code, _ = make_lobby(api)
        guest = join(api, code, "Bob").data["member"]["token"]
        response = auth(APIClient(), guest).post(
            f"/api/lobbies/{code}/snapshot/",
            {"version": 1, "snapshots": {guest: {"state": "victory"}}},
            format="json",
        )
        assert response.status_code == 403

    def test_a_token_from_another_lobby_is_ignored_not_fatal(self, api):
        """A member who left mid-broadcast must not fail the whole publish."""
        code, host = make_lobby(api, "Alice")
        bob = join(api, code, "Bob").data["member"]["token"]
        other_code, other_host = make_lobby(APIClient(), "Zoe")

        response = auth(api, host).post(
            f"/api/lobbies/{code}/snapshot/",
            {"version": 1, "snapshots": {bob: {"ok": True}, other_host: {"leaked": True}}},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["written"] == 1
        assert not Snapshot.objects.filter(member__token=other_host).exists()

    def test_publishing_replaces_rather_than_accumulates(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        for version in (1, 2, 3):
            auth(api, host).post(
                f"/api/lobbies/{code}/snapshot/",
                {"version": version, "snapshots": {host: {"v": version}}},
                format="json",
            )
        snapshot = Snapshot.objects.get(member__token=host)
        assert snapshot.version == 3
        assert snapshot.blob == {"v": 3}
        assert Snapshot.objects.filter(member__token=host).count() == 1
