"""Match history: reported by the host at the end of a game, read by anyone."""

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from lobbies.models import Member

from .models import GameResult, Participation, Profile


def _host_member(request, code: str) -> Member | None:
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.startswith("Bearer ") else ""
    if not token:
        return None
    return Member.objects.filter(lobby__code=code.upper(), token=token, is_host=True).first()


@api_view(["POST"])
def report_result(request, code: str):
    """
    Record a finished game.

    Only the host may report, and only once per session id: a host that
    reconnects and re-sends should not double-count the game, so a repeat is
    answered with the existing record rather than an error.
    """
    if _host_member(request, code) is None:
        return Response(
            {"detail": "Only the host can report a result."}, status=status.HTTP_403_FORBIDDEN
        )

    session_id = (request.data.get("session_id") or "").strip()
    players = request.data.get("players")
    if not session_id or not isinstance(players, list) or not players:
        return Response(
            {"detail": "session_id and a non-empty players list are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing = GameResult.objects.filter(session_id=session_id).first()
    if existing:
        return Response({"id": existing.id, "recorded": False})

    try:
        with transaction.atomic():
            game = GameResult.objects.create(
                lobby_code=code.upper(),
                session_id=session_id,
                rounds=int(request.data.get("rounds") or 0),
                player_count=len(players),
            )
            for entry in players:
                nickname = (entry.get("nickname") or "").strip()
                if not nickname:
                    continue
                Participation.objects.create(
                    game=game,
                    profile=Profile.for_nickname(nickname),
                    seat=int(entry.get("seat") or 0),
                    color=entry.get("color") or "",
                    won=bool(entry.get("won")),
                    pegs=int(entry.get("pegs") or 0),
                    questions_attempted=int(entry.get("questions_attempted") or 0),
                    questions_correct=int(entry.get("questions_correct") or 0),
                    jokers_used=int(entry.get("jokers_used") or 0),
                )
    except IntegrityError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

    return Response({"id": game.id, "recorded": True}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def leaderboard(request):
    """Every profile with a game to its name, best win rate first."""
    rows = (
        Profile.objects.annotate(
            games=Count("participations"),
            wins=Count("participations", filter=Q(participations__won=True)),
            pegs=Sum("participations__pegs"),
            attempted=Sum("participations__questions_attempted"),
            correct=Sum("participations__questions_correct"),
        )
        .filter(games__gt=0)
        .order_by("-wins", "-games")
    )
    return Response(
        [
            {
                "nickname": row.display_name,
                "games": row.games,
                "wins": row.wins,
                "pegs": row.pegs or 0,
                "questions_attempted": row.attempted or 0,
                "questions_correct": row.correct or 0,
                "accuracy": round((row.correct or 0) / row.attempted, 3) if row.attempted else None,
            }
            for row in rows
        ]
    )


@api_view(["GET"])
def profile_detail(request, nickname: str):
    profile = Profile.objects.filter(key=nickname.strip().casefold()).first()
    if profile is None:
        return Response({"detail": "Nobody has played under that name."}, status=status.HTTP_404_NOT_FOUND)
    games = profile.participations.select_related("game").order_by("-game__finished_at")[:50]
    return Response(
        {
            "nickname": profile.display_name,
            "first_seen": profile.first_seen,
            "games": [
                {
                    "session_id": p.game.session_id,
                    "finished_at": p.game.finished_at,
                    "won": p.won,
                    "pegs": p.pegs,
                    "questions_attempted": p.questions_attempted,
                    "questions_correct": p.questions_correct,
                    "player_count": p.game.player_count,
                }
                for p in games
            ],
        }
    )
