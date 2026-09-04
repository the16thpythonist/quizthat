"""
The relay's data model.

Four tables and no game logic. The server stores a session blob, routes intents
to whoever is authoritative, and fans snapshots back out. It never parses the
blob — see CLAUDE.md for why the rules stay in one place, in TypeScript.
"""

import secrets
import string

from django.db import models

# Ambiguous glyphs are left out: a join code gets read aloud across a room and
# typed on a phone, so O/0 and I/1/L cost more than the extra entropy is worth.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 5


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def new_token() -> str:
    return secrets.token_urlsafe(32)


class Lobby(models.Model):
    """One game in progress, or waiting to start."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PLAYING = "playing", "Playing"
        FINISHED = "finished", "Finished"

    # What the game is called at the table — "Jonas' Spielabend". Display only:
    # joining is still by code, so names may repeat and nothing has to be unique.
    name = models.CharField(max_length=60, blank=True)
    code = models.CharField(max_length=CODE_LENGTH, unique=True, default=new_code)
    # A shared-tablet game that is broadcasting itself so a television can show
    # the boards. Every seat is played on the one device, so it takes spectators
    # but never remote players.
    local = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "lobbies"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name or self.code} ({self.status})"

    @classmethod
    def create_unique(cls, name: str = "", local: bool = False) -> "Lobby":
        """
        Draw a code, retrying on the rare collision.

        31^5 is roughly 28 million, so a clash needs an improbable coincidence
        among lobbies alive at the same moment — but 'improbable' is not 'never'
        when the column is unique and the insert would simply fail.
        """
        for _ in range(10):
            code = new_code()
            if not cls.objects.filter(code=code).exists():
                return cls.objects.create(code=code, name=name, local=local)
        raise RuntimeError("Could not allocate a free lobby code")


class Member(models.Model):
    """
    One device in a lobby.

    The `token` is how a device proves it is itself on every later request. It
    is opaque and per-device: there are no accounts, and `nickname` is the only
    identity the game has (see the stats app, where the same nickname means the
    same profile).
    """

    class Role(models.TextChoices):
        PLAYER = "player", "Player"
        SPECTATOR = "spectator", "Spectator"

    lobby = models.ForeignKey(Lobby, related_name="members", on_delete=models.CASCADE)
    nickname = models.CharField(max_length=40)
    token = models.CharField(max_length=64, unique=True, default=new_token, db_index=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.PLAYER)
    # Whoever created the lobby runs the engine. Exactly one per lobby.
    is_host = models.BooleanField(default=False)
    # Seat order in the game, assigned when play starts. Null for spectators.
    seat = models.IntegerField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["lobby"],
                condition=models.Q(is_host=True),
                name="one_host_per_lobby",
            )
        ]

    def __str__(self) -> str:
        return f"{self.nickname} in {self.lobby.code}"


class Snapshot(models.Model):
    """
    The latest session state as one member should see it.

    One row per member, replaced in place, because a guest only ever needs the
    current state — there is no history to replay and no ordering to preserve
    beyond `version`.

    Per member rather than per lobby because the blobs differ: the host redacts
    each one before sending, so nobody receives another player's in-flight
    battle guess. The server does not do the redacting and cannot check it; it
    stores what it is given, addressed to whom it is told.
    """

    lobby = models.ForeignKey(Lobby, related_name="snapshots", on_delete=models.CASCADE)
    member = models.OneToOneField(Member, related_name="snapshot", on_delete=models.CASCADE)
    version = models.BigIntegerField(default=0)
    blob = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"snapshot v{self.version} for {self.member_id}"


class Intent(models.Model):
    """
    One player action on its way to the host.

    Queued rather than delivered directly: the host may be momentarily away —
    a locked phone, a dropped connection — and an intent that arrived during
    that gap should still be applied when it comes back, not lost.
    """

    lobby = models.ForeignKey(Lobby, related_name="intents", on_delete=models.CASCADE)
    member = models.ForeignKey(Member, related_name="intents", on_delete=models.CASCADE)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    delivered = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["lobby", "delivered", "id"])]

    def __str__(self) -> str:
        return f"intent {self.payload.get('type')} from {self.member_id}"
