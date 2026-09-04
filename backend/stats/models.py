"""
Match history across sessions.

Identity is the nickname and nothing else — no accounts, no passwords, no
device tokens carried between games. Two different people who both type "Jonas"
share a profile; that is a deliberate trade for never asking anyone to sign up,
and it is the reason nothing sensitive is recorded here.
"""

from django.db import models
from django.db.models import F, Q


class Profile(models.Model):
    """
    Everyone who has ever played under a given name.

    Matched case-insensitively — "jonas" and "Jonas" are one person — while the
    display name keeps whatever capitalisation was typed most recently.
    """

    key = models.CharField(max_length=40, unique=True, db_index=True)
    display_name = models.CharField(max_length=40)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.display_name

    @classmethod
    def for_nickname(cls, nickname: str) -> "Profile":
        key = nickname.strip().casefold()
        profile, _ = cls.objects.get_or_create(
            key=key, defaults={"display_name": nickname.strip()}
        )
        if profile.display_name != nickname.strip():
            profile.display_name = nickname.strip()
            profile.save(update_fields=["display_name", "last_seen"])
        return profile


class GameResult(models.Model):
    """One finished game, reported by the host when it ends."""

    lobby_code = models.CharField(max_length=8, blank=True)
    session_id = models.CharField(max_length=64, unique=True)
    rounds = models.IntegerField(default=0)
    player_count = models.IntegerField(default=0)
    finished_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-finished_at"]

    def __str__(self) -> str:
        return f"game {self.session_id[:8]} ({self.player_count}p)"


class Participation(models.Model):
    """
    How one profile did in one game.

    Kept per game rather than as running totals on the profile so a wrong or
    duplicated report can be deleted without leaving the counters skewed.
    """

    game = models.ForeignKey(GameResult, related_name="participants", on_delete=models.CASCADE)
    profile = models.ForeignKey(Profile, related_name="participations", on_delete=models.CASCADE)
    seat = models.IntegerField()
    color = models.CharField(max_length=16, blank=True)
    won = models.BooleanField(default=False)
    pegs = models.IntegerField(default=0)
    questions_attempted = models.IntegerField(default=0)
    questions_correct = models.IntegerField(default=0)
    jokers_used = models.IntegerField(default=0)

    class Meta:
        ordering = ["seat"]
        constraints = [
            models.UniqueConstraint(fields=["game", "seat"], name="one_row_per_seat"),
            models.CheckConstraint(
                condition=Q(questions_correct__lte=F("questions_attempted")),
                name="correct_within_attempted",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.profile} in {self.game_id}"
