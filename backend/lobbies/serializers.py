from rest_framework import serializers

from .models import Lobby, Member


class MemberSerializer(serializers.ModelSerializer):
    """
    A member as other people may see them.

    The token is a credential, so it is included only for the member it belongs
    to — `secret=True` on the one response that hands it over at join time.
    """

    class Meta:
        model = Member
        fields = ["id", "nickname", "role", "is_host", "seat", "joined_at"]

    def __init__(self, *args, secret: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        if secret:
            self.fields["token"] = serializers.CharField(read_only=True)


class LobbySerializer(serializers.ModelSerializer):
    members = MemberSerializer(many=True, read_only=True)

    class Meta:
        model = Lobby
        fields = ["code", "name", "local", "status", "members", "created_at", "updated_at"]
