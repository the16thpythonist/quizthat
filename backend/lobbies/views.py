"""
The relay API.

Every endpoint here moves opaque bytes around. Nothing in this module inspects
a session blob or an intent payload beyond routing it, which is what keeps the
game rules in exactly one place.
"""

import asyncio
import json
import time

from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Intent, Lobby, Member, Snapshot
from .serializers import LobbySerializer, MemberSerializer

# How often the event stream looks for changes. A turn takes tens of seconds, so
# a third of a second is imperceptible, and polling the DB keeps the stream
# correct across multiple worker processes — an in-process wakeup would not be.
POLL_INTERVAL = 0.3
# Proxies and phone radios drop a connection that goes quiet. A comment line is
# a no-op to EventSource but keeps the socket alive.
HEARTBEAT_SECONDS = 15


def _token_from(request) -> str:
    """
    The caller's member token.

    EventSource cannot set request headers, so the events endpoint has to accept
    the token in the query string. It is an opaque random string, not personal
    data, but it is still a credential in a URL — hence the header everywhere
    else, where it is available.
    """
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return request.GET.get("token", "").strip()


def _member_or_none(code: str, token: str) -> Member | None:
    if not token:
        return None
    return Member.objects.filter(lobby__code=code.upper(), token=token).select_related("lobby").first()


def _forbidden(detail: str) -> Response:
    return Response({"detail": detail}, status=status.HTTP_403_FORBIDDEN)


@api_view(["GET"])
def open_lobbies(request):
    """
    Games a spectator could watch, newest first.

    **Deliberately without join codes.** A television cannot reasonably type a
    code, so this exists to let one be picked from a list — but publishing the
    codes here would let anyone who can reach the server join any game as a
    *player* without being told one, which is the whole point of the code.
    So this carries only what is needed to choose and to watch.

    Games already under way are included: a TV is usually switched on after
    everyone has sat down, and spectators may join at any time.
    """
    lobbies = (
        Lobby.objects.filter(status__in=[Lobby.Status.OPEN, Lobby.Status.PLAYING])
        .annotate(player_count=Count("members", filter=Q(members__role=Member.Role.PLAYER)))
        .order_by("-created_at")[:40]
    )
    return Response(
        [
            {
                "id": lobby.id,
                "name": lobby.name or "",
                "status": lobby.status,
                "player_count": lobby.player_count,
                "created_at": lobby.created_at,
            }
            for lobby in lobbies
        ]
    )


@api_view(["POST"])
def watch_lobby(request, lobby_id: int):
    """
    Join a listed game as a spectator, by id rather than by code.

    The counterpart to the listing above: picking a game from a list has to
    work without knowing its code, but this can only ever produce a spectator.
    A device that wants to play still has to be told the code.

    No nickname either — a spectator has no stats and no seat, so a TV can go
    from the main menu to watching without typing anything at all.
    """
    lobby = get_object_or_404(Lobby, pk=lobby_id)
    if lobby.status == Lobby.Status.FINISHED:
        return Response({"detail": "That game has finished."}, status=status.HTTP_409_CONFLICT)

    nickname = (request.data.get("nickname") or "").strip() or "TV"
    member = Member.objects.create(
        lobby=lobby, nickname=nickname, role=Member.Role.SPECTATOR
    )
    lobby.save(update_fields=["updated_at"])
    return Response(
        {"lobby": LobbySerializer(lobby).data, "member": MemberSerializer(member, secret=True).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def create_lobby(request):
    """Open a lobby. The creator is its host and its first player."""
    nickname = (request.data.get("nickname") or "").strip()
    if not nickname:
        return Response({"detail": "A nickname is required."}, status=status.HTTP_400_BAD_REQUEST)

    # A game with no name is still findable in the list, so rather than demand
    # one, fall back to whoever opened it.
    name = (request.data.get("name") or "").strip()[:60] or f"{nickname}s Spiel"
    lobby = Lobby.create_unique(name=name)
    member = Member.objects.create(
        lobby=lobby, nickname=nickname, role=Member.Role.PLAYER, is_host=True
    )
    return Response(
        {"lobby": LobbySerializer(lobby).data, "member": MemberSerializer(member, secret=True).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def join_lobby(request, code: str):
    """
    Join an open lobby as a player, or at any time as a spectator.

    A spectator is the TV: it can join a game already in progress, because it
    only ever watches. A player cannot, since seats are fixed when play starts.
    """
    lobby = get_object_or_404(Lobby, code=code.upper())
    nickname = (request.data.get("nickname") or "").strip()
    role = request.data.get("role") or Member.Role.PLAYER
    if role not in Member.Role.values:
        return Response({"detail": "Unknown role."}, status=status.HTTP_400_BAD_REQUEST)
    if not nickname:
        nickname = "TV" if role == Member.Role.SPECTATOR else ""
    if not nickname:
        return Response({"detail": "A nickname is required."}, status=status.HTTP_400_BAD_REQUEST)

    if role == Member.Role.PLAYER:
        if lobby.status != Lobby.Status.OPEN:
            return Response(
                {"detail": "This game has already started."}, status=status.HTTP_409_CONFLICT
            )
        if lobby.members.filter(role=Member.Role.PLAYER).count() >= 6:
            return Response({"detail": "This lobby is full."}, status=status.HTTP_409_CONFLICT)
        if lobby.members.filter(role=Member.Role.PLAYER, nickname__iexact=nickname).exists():
            return Response(
                {"detail": "Somebody in this lobby is already called that."},
                status=status.HTTP_409_CONFLICT,
            )

    member = Member.objects.create(lobby=lobby, nickname=nickname, role=role)
    lobby.save(update_fields=["updated_at"])  # wakes the roster on every stream
    return Response(
        {"lobby": LobbySerializer(lobby).data, "member": MemberSerializer(member, secret=True).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def lobby_detail(request, code: str):
    member = _member_or_none(code, _token_from(request))
    if not member:
        return _forbidden("Not a member of this lobby.")
    return Response(LobbySerializer(member.lobby).data)


@api_view(["POST"])
def start_lobby(request, code: str):
    """
    Close the lobby to new players and fix the seat order.

    Seats are assigned here, once, in join order — the host's engine uses them
    as the player indices, so they must not move afterwards.
    """
    member = _member_or_none(code, _token_from(request))
    if not member:
        return _forbidden("Not a member of this lobby.")
    if not member.is_host:
        return _forbidden("Only the host can start the game.")

    lobby = member.lobby
    players = list(lobby.members.filter(role=Member.Role.PLAYER).order_by("joined_at"))
    if len(players) < 2:
        return Response(
            {"detail": "At least two players are needed."}, status=status.HTTP_409_CONFLICT
        )

    for seat, player in enumerate(players):
        player.seat = seat
    Member.objects.bulk_update(players, ["seat"])
    lobby.status = Lobby.Status.PLAYING
    lobby.save(update_fields=["status", "updated_at"])
    return Response(LobbySerializer(lobby).data)


@api_view(["POST"])
def post_intent(request, code: str):
    """Queue one player action for the host to apply."""
    member = _member_or_none(code, _token_from(request))
    if not member:
        return _forbidden("Not a member of this lobby.")
    if member.role == Member.Role.SPECTATOR:
        return _forbidden("A spectator cannot act.")

    payload = request.data.get("intent")
    if not isinstance(payload, dict) or "type" not in payload:
        return Response(
            {"detail": "An intent must be an object with a type."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The seat travels with the intent so the host can tell who acted without
    # trusting anything inside the payload.
    intent = Intent.objects.create(
        lobby=member.lobby,
        member=member,
        payload={"type": payload.get("type"), "args": payload.get("args", []), "seat": member.seat},
    )
    return Response({"id": intent.id}, status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
def post_snapshot(request, code: str):
    """
    Publish the state, already redacted per recipient.

    The body is `{"version": n, "snapshots": {member_id: blob}}`. The host
    decides what each member may see; this only files the blobs under the right
    members.

    Addressed by member id rather than token because a token is a credential:
    the host would have to be told everyone else's to address them, and then a
    single compromised phone could impersonate the table. Ids are already public
    in the roster and are enough to route by.

    An id that is not in this lobby is ignored rather than rejected, so a member
    leaving mid-broadcast does not fail the whole publish.
    """
    member = _member_or_none(code, _token_from(request))
    if not member:
        return _forbidden("Not a member of this lobby.")
    if not member.is_host:
        return _forbidden("Only the host publishes state.")

    snapshots = request.data.get("snapshots")
    if not isinstance(snapshots, dict):
        return Response(
            {"detail": "snapshots must be an object keyed by member id."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        version = int(request.data.get("version", 0))
    except (TypeError, ValueError):
        return Response({"detail": "version must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    by_id = {str(m.id): m for m in member.lobby.members.all()}
    written = 0
    for member_id, blob in snapshots.items():
        target = by_id.get(str(member_id))
        if target is None:
            continue
        Snapshot.objects.update_or_create(
            member=target,
            defaults={"lobby": member.lobby, "version": version, "blob": blob},
        )
        written += 1

    return Response({"written": written, "version": version})


@api_view(["POST"])
def leave_lobby(request, code: str):
    member = _member_or_none(code, _token_from(request))
    if not member:
        return _forbidden("Not a member of this lobby.")
    lobby = member.lobby
    if member.is_host:
        # Without a host nothing can advance, so the lobby closes with them.
        lobby.status = Lobby.Status.FINISHED
        lobby.save(update_fields=["status", "updated_at"])
    else:
        member.delete()
        lobby.save(update_fields=["updated_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Event stream ────────────────────────────────────────────────


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@sync_to_async
def _load_member(code: str, token: str) -> Member | None:
    return _member_or_none(code, token)


@sync_to_async
def _roster(lobby_id: int) -> dict:
    lobby = Lobby.objects.get(pk=lobby_id)
    return LobbySerializer(lobby).data


@sync_to_async
def _lobby_stamp(lobby_id: int):
    return (
        Lobby.objects.filter(pk=lobby_id)
        .values_list("updated_at", "status")
        .first()
    )


@sync_to_async
def _snapshot_for(member_id: int, since: int):
    row = Snapshot.objects.filter(member_id=member_id).values("version", "blob").first()
    if row and row["version"] > since:
        return row
    return None


@sync_to_async
def _take_intents(lobby_id: int, after: int) -> list[dict]:
    """
    Hand the host everything queued since it last looked.

    Marked delivered in the same call: an intent is applied once, and the host
    re-reads the world from its own state rather than from this queue, so
    redelivery after a reconnect would double-apply.
    """
    rows = list(
        Intent.objects.filter(lobby_id=lobby_id, delivered=False, id__gt=after)
        .order_by("id")
        .values("id", "payload")[:50]
    )
    if rows:
        Intent.objects.filter(id__in=[r["id"] for r in rows]).update(delivered=True)
    return rows


async def events(request, code: str):
    """
    Long-lived stream of everything this member needs.

    Guests and spectators receive `snapshot`; the host additionally receives
    `intent`. Everyone receives `lobby` when the roster or status changes.
    """
    token = _token_from(request)
    member = await _load_member(code, token)
    if member is None:
        return StreamingHttpResponse(
            iter([_sse("error", {"detail": "Not a member of this lobby."})]),
            content_type="text/event-stream",
            status=403,
        )

    member_id = member.id
    lobby_id = member.lobby_id
    is_host = member.is_host

    async def stream():
        yield _sse(
            "hello",
            {
                "member_id": member_id,
                "is_host": is_host,
                "role": member.role,
                "seat": member.seat,
            },
        )
        yield _sse("lobby", await _roster(lobby_id))

        last_version = -1
        last_intent_id = 0
        last_stamp = await _lobby_stamp(lobby_id)
        last_beat = time.monotonic()

        while True:
            stamp = await _lobby_stamp(lobby_id)
            if stamp is None:
                yield _sse("closed", {"reason": "The lobby is gone."})
                return
            if stamp != last_stamp:
                last_stamp = stamp
                yield _sse("lobby", await _roster(lobby_id))

            row = await _snapshot_for(member_id, last_version)
            if row is not None:
                last_version = row["version"]
                yield _sse("snapshot", {"version": row["version"], "session": row["blob"]})

            if is_host:
                for intent in await _take_intents(lobby_id, last_intent_id):
                    last_intent_id = max(last_intent_id, intent["id"])
                    yield _sse("intent", {"id": intent["id"], "intent": intent["payload"]})

            now = time.monotonic()
            if now - last_beat >= HEARTBEAT_SECONDS:
                last_beat = now
                yield ": keep-alive\n\n"

            await asyncio.sleep(POLL_INTERVAL)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    # nginx buffers proxied responses by default, which would hold every event
    # until the buffer filled — i.e. forever, for a stream this small.
    response["X-Accel-Buffering"] = "no"
    return response
