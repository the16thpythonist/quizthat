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


def member_id(token: str) -> str:
    return str(Member.objects.get(token=token).id)


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

    def test_a_player_may_join_a_game_in_progress(self, api):
        # Latecomers are allowed in and seated at the end; see TestJoiningLate
        # for what that costs them.
        code, host = make_lobby(api)
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        assert join(api, code, "Cara").status_code == 201

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
                "snapshots": {
                    member_id(host): {"state": "selection", "mine": True},
                    member_id(bob): {"state": "selection"},
                },
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
                    member_id(host): {"battle": {"answers": [{"seat": 0, "value": 42}]}},
                    member_id(bob): {"battle": {"answers": []}},
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
            {"version": 1, "snapshots": {member_id(guest): {"state": "victory"}}},
            format="json",
        )
        assert response.status_code == 403

    def test_an_id_from_another_lobby_is_ignored_not_fatal(self, api):
        """A member who left mid-broadcast must not fail the whole publish."""
        code, host = make_lobby(api, "Alice")
        bob = join(api, code, "Bob").data["member"]["token"]
        _, other_host = make_lobby(APIClient(), "Zoe")

        response = auth(api, host).post(
            f"/api/lobbies/{code}/snapshot/",
            {
                "version": 1,
                "snapshots": {
                    member_id(bob): {"ok": True},
                    member_id(other_host): {"leaked": True},
                },
            },
            format="json",
        )
        assert response.status_code == 200
        assert response.data["written"] == 1
        assert not Snapshot.objects.filter(member__token=other_host).exists()

    def test_a_member_never_learns_another_member_token(self, api):
        """
        Tokens are credentials, which is why snapshots are addressed by id.

        The host has to name every recipient to publish; if that needed tokens,
        one phone would hold the whole table's.
        """
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        roster = auth(api, host).get(f"/api/lobbies/{code}/").data
        assert all("token" not in m for m in roster["members"])

    def test_publishing_replaces_rather_than_accumulates(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        for version in (1, 2, 3):
            auth(api, host).post(
                f"/api/lobbies/{code}/snapshot/",
                {"version": version, "snapshots": {member_id(host): {"v": version}}},
                format="json",
            )
        snapshot = Snapshot.objects.get(member__token=host)
        assert snapshot.version == 3
        assert snapshot.blob == {"v": 3}
        assert Snapshot.objects.filter(member__token=host).count() == 1


@pytest.mark.django_db
class TestNamesAndWatching:
    def test_a_lobby_carries_the_name_it_was_given(self, api):
        response = api.post(
            "/api/lobbies/", {"nickname": "Alice", "name": "Jonas' Spielabend"}, format="json"
        )
        assert response.data["lobby"]["name"] == "Jonas' Spielabend"

    def test_an_unnamed_lobby_is_named_after_whoever_opened_it(self, api):
        response = api.post("/api/lobbies/", {"nickname": "Alice"}, format="json")
        # Findable in the list either way, so a missing name is filled in rather
        # than demanded.
        assert response.data["lobby"]["name"] == "Alices Spiel"

    def test_names_may_repeat(self, api):
        for _ in range(2):
            response = APIClient().post(
                "/api/lobbies/", {"nickname": "Alice", "name": "Quizabend"}, format="json"
            )
            assert response.status_code == 201

    def test_open_and_running_games_are_both_listed(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        api.post("/api/lobbies/", {"nickname": "Zoe", "name": "Not started"}, format="json")
        auth(api, host).post(f"/api/lobbies/{code}/start/")

        rows = APIClient().get("/api/lobbies/open/").data
        statuses = {row["status"] for row in rows}
        # A TV is usually switched on after everyone has sat down.
        assert statuses == {"open", "playing"}
        assert len(rows) == 2

    def test_a_finished_game_drops_off_the_list(self, api):
        code, host = make_lobby(api, "Alice")
        auth(api, host).post(f"/api/lobbies/{code}/leave/")  # the host leaving closes it
        assert APIClient().get("/api/lobbies/open/").data == []

    def test_the_listing_never_exposes_a_join_code(self, api):
        """
        The listing exists so a television can pick a game without typing.

        If it carried codes, anyone who could reach the server could join any
        game as a *player* without being told one — which is the entire point of
        having a code. Playing still requires being told it.
        """
        make_lobby(api, "Alice")
        rows = APIClient().get("/api/lobbies/open/").data
        assert rows
        for row in rows:
            assert "code" not in row
            assert "token" not in row
        assert set(rows[0]) == {"id", "name", "status", "player_count", "created_at", "local"}

    def test_the_listing_counts_players_not_spectators(self, api):
        code, _ = make_lobby(api, "Alice")
        join(api, code, "Bob")
        join(api, code, "TV", role="spectator")
        row = APIClient().get("/api/lobbies/open/").data[0]
        assert row["player_count"] == 2

    def test_watching_by_id_needs_no_code_and_no_nickname(self, api):
        code, _ = make_lobby(api, "Alice")
        lobby_id = Lobby.objects.get(code=code).id
        response = APIClient().post(f"/api/lobbies/watch/{lobby_id}/", {}, format="json")
        assert response.status_code == 201
        assert response.data["member"]["role"] == "spectator"
        assert response.data["member"]["nickname"] == "TV"
        assert response.data["lobby"]["code"] == code  # they get it once inside

    def test_watching_by_id_can_only_ever_produce_a_spectator(self, api):
        code, _ = make_lobby(api, "Alice")
        lobby_id = Lobby.objects.get(code=code).id
        response = APIClient().post(
            f"/api/lobbies/watch/{lobby_id}/", {"role": "player", "nickname": "Sneak"}, format="json"
        )
        # The role in the body is ignored: this route is not a way in to playing.
        assert response.data["member"]["role"] == "spectator"
        assert Member.objects.get(nickname="Sneak").seat is None

    def test_watching_a_running_game_works(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        lobby_id = Lobby.objects.get(code=code).id
        assert APIClient().post(f"/api/lobbies/watch/{lobby_id}/", {}, format="json").status_code == 201

    def test_watching_a_finished_game_is_refused(self, api):
        code, host = make_lobby(api, "Alice")
        lobby_id = Lobby.objects.get(code=code).id
        auth(api, host).post(f"/api/lobbies/{code}/leave/")
        assert APIClient().post(f"/api/lobbies/watch/{lobby_id}/", {}, format="json").status_code == 409

    def test_a_watcher_still_cannot_act(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        lobby_id = Lobby.objects.get(code=code).id
        token = APIClient().post(f"/api/lobbies/watch/{lobby_id}/", {}, format="json").data["member"]["token"]
        response = auth(APIClient(), token).post(
            f"/api/lobbies/{code}/intents/",
            {"intent": {"type": "placePeg", "args": [0, 0]}},
            format="json",
        )
        assert response.status_code == 403


@pytest.mark.django_db
class TestJoiningLate:
    def test_a_player_can_join_a_game_in_progress(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")

        response = join(api, code, "Cara")
        assert response.status_code == 201
        # Seated at the end of the turn order, not squeezed in.
        assert response.data["member"]["seat"] == 2

    def test_a_latecomer_never_takes_a_seat_somebody_holds(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        join(api, code, "Cara")
        join(api, code, "Dan")

        seats = sorted(
            Member.objects.filter(lobby__code=code, role=Member.Role.PLAYER).values_list(
                "seat", flat=True
            )
        )
        assert seats == [0, 1, 2, 3]

    def test_spectators_do_not_consume_a_seat(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        join(api, code, "TV", role="spectator")

        response = join(api, code, "Cara")
        assert response.data["member"]["seat"] == 2

    def test_a_late_join_still_respects_the_six_player_limit(self, api):
        code, host = make_lobby(api, "P0")
        join(api, code, "P1")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        for n in range(2, 6):
            assert join(api, code, f"P{n}").status_code == 201
        assert join(api, code, "P6").status_code == 409

    def test_a_late_join_still_refuses_a_duplicate_nickname(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/start/")
        assert join(api, code, "bob").status_code == 409

    def test_a_finished_game_cannot_be_joined(self, api):
        code, host = make_lobby(api, "Alice")
        join(api, code, "Bob")
        auth(api, host).post(f"/api/lobbies/{code}/leave/")  # host leaving closes it
        assert join(api, code, "Cara").status_code == 409


@pytest.mark.django_db
class TestBroadcastingALocalGame:
    """
    A shared-tablet game that publishes itself so a television can follow it.

    Everyone is sitting at the same device, so it takes spectators but never
    remote players — there is no seat for a second device to occupy.
    """

    def make_local(self, api, name="Alice, Bob"):
        return api.post(
            "/api/lobbies/", {"nickname": "Tisch", "name": name, "local": True}, format="json"
        )

    def test_a_local_game_can_be_opened(self, api):
        response = self.make_local(api)
        assert response.status_code == 201
        assert response.data["lobby"]["local"] is True
        assert Lobby.objects.get(code=response.data["lobby"]["code"]).local

    def test_an_ordinary_lobby_is_not_local(self, api):
        code, _ = make_lobby(api)
        assert Lobby.objects.get(code=code).local is False

    def test_it_is_listed_for_spectators(self, api):
        self.make_local(api, name="Alice, Bob")
        rows = APIClient().get("/api/lobbies/open/").data
        assert [row["name"] for row in rows] == ["Alice, Bob"]
        assert rows[0]["local"] is True

    def test_a_television_may_watch_it(self, api):
        lobby_id = Lobby.objects.get(code=self.make_local(api).data["lobby"]["code"]).id
        response = APIClient().post(f"/api/lobbies/watch/{lobby_id}/", {}, format="json")
        assert response.status_code == 201
        assert response.data["member"]["role"] == "spectator"

    def test_a_remote_player_may_not_join_it(self, api):
        code = self.make_local(api).data["lobby"]["code"]
        response = join(api, code, "Cara")
        assert response.status_code == 409
        assert "one device" in response.data["detail"]

    def test_a_spectator_may_still_join_by_code(self, api):
        code = self.make_local(api).data["lobby"]["code"]
        assert join(api, code, "TV", role="spectator").status_code == 201
