"""
The JSON API the /admin editor runs on.

Everything here works against a temporary corpus rather than the repo's own
`questions/` folder: these tests write files, and a test that edits the real
corpus would show up as an unexplained diff in somebody's working tree.
"""

import json

import pytest

from .service import index

CREDENTIALS = {"username": "curator", "password": "correct horse battery staple"}

META = {
    "id": "aaaa1111",
    "languages": ["de", "en"],
    "major_category": "Geography",
    "subcategory": "Mountains",
    "difficulty": "medium",
    "question_type": "map_location",
    "time_limit_seconds": None,
    "version": 1,
    "created_at": "2026-03-01T10:07:17.579487Z",
    "generation_batch": "test-corpus-initial",
}

QUESTION_DE = {
    "teaser_title": "Auf dem Dach der Welt",
    "question_text": "Zeige auf der Karte, wo der Mount Everest liegt.",
    "hint": "Er liegt an der Grenze zwischen Nepal und Tibet.",
    "answer_data": {"target": {"lat": 27.9881, "lng": 86.925}, "scoring": []},
}


@pytest.fixture
def corpus(tmp_path, settings):
    """A two-question corpus on disk, with the editor's password set."""
    settings.ADMIN_USER = CREDENTIALS["username"]
    settings.ADMIN_PASSWORD = CREDENTIALS["password"]

    first = tmp_path / "aaaa1111"
    (first / "audio").mkdir(parents=True)
    (first / "meta.json").write_text(json.dumps(META), encoding="utf-8")
    (first / "question.de.json").write_text(json.dumps(QUESTION_DE), encoding="utf-8")
    (first / "question.en.json").write_text(
        json.dumps({**QUESTION_DE, "question_text": "Point to Mount Everest."}), encoding="utf-8"
    )
    (first / "audio" / "teaser.de.mp3").write_bytes(b"ID3fake")
    # A keyless pipeline run leaves these behind; the editor has to tell them
    # apart from a real clip.
    (first / "audio" / "question.de.mp3").write_bytes(b"")
    (first / "audio" / "notes.txt").write_text("not a clip", encoding="utf-8")

    second = tmp_path / "bbbb2222"
    second.mkdir()
    (second / "meta.json").write_text(
        json.dumps({**META, "id": "bbbb2222", "major_category": "History", "subcategory": "Rome"}),
        encoding="utf-8",
    )
    (second / "question.de.json").write_text(json.dumps(QUESTION_DE), encoding="utf-8")

    original_root = index.root
    index.root = tmp_path
    index.reload()
    yield tmp_path
    index.root = original_root
    index.reload()


@pytest.fixture
def editor(db, corpus, client):
    """A client already signed in to the editor. Signing in needs the session table."""
    client.post("/api/corpus/session/", CREDENTIALS, content_type="application/json")
    return client


class TestSigningIn:
    def test_an_anonymous_caller_is_told_a_password_exists(self, corpus, client):
        body = client.get("/api/corpus/session/").json()
        assert body == {"configured": True, "signed_in": False}

    def test_the_wrong_password_does_not_sign_anyone_in(self, corpus, client):
        response = client.post(
            "/api/corpus/session/",
            {**CREDENTIALS, "password": "nope"},
            content_type="application/json",
        )
        assert response.status_code == 401
        assert client.get("/api/corpus/session/").json()["signed_in"] is False

    def test_the_message_does_not_say_which_half_was_wrong(self, corpus, client):
        wrong_user = client.post(
            "/api/corpus/session/",
            {**CREDENTIALS, "username": "nope"},
            content_type="application/json",
        )
        wrong_password = client.post(
            "/api/corpus/session/",
            {**CREDENTIALS, "password": "nope"},
            content_type="application/json",
        )
        assert wrong_user.json() == wrong_password.json()

    def test_an_unconfigured_server_refuses_rather_than_letting_anyone_in(
        self, corpus, client, settings
    ):
        settings.ADMIN_PASSWORD = ""
        response = client.post(
            "/api/corpus/session/",
            {"username": "", "password": ""},
            content_type="application/json",
        )
        assert response.status_code == 503
        assert "QUIZTHAT_ADMIN_PASSWORD" in response.json()["detail"]

    def test_signing_out_ends_the_session(self, editor):
        assert editor.delete("/api/corpus/session/").status_code == 204
        assert editor.get("/api/corpus/session/").json()["signed_in"] is False


class TestTheTree:
    def test_it_is_built_from_the_questions_on_disk(self, corpus, client):
        tree = client.get("/api/corpus/tree/").json()["tree"]
        assert [node["major"] for node in tree] == ["Geography", "History"]
        assert tree[0]["subcategories"] == [{"name": "Mountains", "count": 1}]

    def test_a_major_carries_the_count_of_everything_beneath_it(self, corpus, client):
        assert all(node["count"] == 1 for node in client.get("/api/corpus/tree/").json()["tree"])

    def test_it_follows_an_edited_category_without_a_restart(self, editor):
        editor.put(
            "/api/corpus/questions/bbbb2222/meta/",
            {"major_category": "Geography", "subcategory": "Mountains"},
            content_type="application/json",
        )
        tree = editor.get("/api/corpus/tree/").json()["tree"]
        assert [node["major"] for node in tree] == ["Geography"]
        assert tree[0]["subcategories"] == [{"name": "Mountains", "count": 2}]


class TestTheDetailBundle:
    def test_it_carries_every_language_at_once(self, corpus, client):
        body = client.get("/api/corpus/questions/aaaa1111/").json()
        assert body["present_languages"] == ["de", "en"]
        assert body["languages"]["en"]["question_text"] == "Point to Mount Everest."

    def test_it_lists_the_clips_with_their_sizes(self, corpus, client):
        audio = client.get("/api/corpus/questions/aaaa1111/").json()["audio"]
        by_name = {clip["name"]: clip for clip in audio}
        assert by_name["teaser.de.mp3"]["bytes"] > 0
        # The placeholder is listed, not hidden: the editor shows it as missing.
        assert by_name["question.de.mp3"]["bytes"] == 0
        assert "notes.txt" not in by_name

    def test_an_unknown_question_is_a_404(self, corpus, client):
        assert client.get("/api/corpus/questions/nope/").status_code == 404


class TestAudio:
    def test_a_clip_streams_back(self, corpus, client):
        response = client.get("/api/corpus/questions/aaaa1111/audio/teaser.de.mp3")
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "audio/mpeg"
        assert b"".join(response.streaming_content) == b"ID3fake"

    @pytest.mark.parametrize(
        "filename", ["../meta.json", "notes.txt", "teaser.de.wav", "..%2Fmeta.json"]
    )
    def test_only_corpus_clip_names_are_served(self, corpus, client, filename):
        response = client.get(f"/api/corpus/questions/aaaa1111/audio/{filename}")
        assert response.status_code in (400, 404)

    def test_a_question_id_cannot_climb_out_of_the_corpus(self, corpus, client):
        response = client.get("/api/corpus/questions/..%2F..%2Fetc/")
        assert response.status_code in (400, 404)


class TestWriting:
    def test_saving_a_question_needs_the_login(self, corpus, client):
        response = client.put(
            "/api/corpus/questions/aaaa1111/de/",
            {**QUESTION_DE, "question_text": "changed"},
            content_type="application/json",
        )
        assert response.status_code == 403
        on_disk = json.loads((corpus / "aaaa1111" / "question.de.json").read_text())
        assert on_disk["question_text"] == QUESTION_DE["question_text"]

    def test_saving_a_question_rewrites_the_file(self, editor, corpus):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/de/",
            {**QUESTION_DE, "teaser_title": "Ganz oben"},
            content_type="application/json",
        )
        assert response.status_code == 200
        on_disk = json.loads((corpus / "aaaa1111" / "question.de.json").read_text())
        assert on_disk["teaser_title"] == "Ganz oben"

    def test_the_file_stays_pretty_printed_and_unescaped(self, editor, corpus):
        editor.put(
            "/api/corpus/questions/aaaa1111/de/",
            {**QUESTION_DE, "teaser_title": "Höhenmeter"},
            content_type="application/json",
        )
        raw = (corpus / "aaaa1111" / "question.de.json").read_text(encoding="utf-8")
        # Written the way the pipeline writes it, so an edit here shows up in
        # `git diff` as the lines that changed rather than a reformatted file.
        assert '"teaser_title": "Höhenmeter"' in raw
        assert raw.endswith("}\n")

    def test_an_empty_question_is_refused(self, editor):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/de/",
            {**QUESTION_DE, "question_text": "   "},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_saving_meta_needs_the_login(self, corpus, client):
        response = client.put(
            "/api/corpus/questions/aaaa1111/meta/",
            {"difficulty": "hard"},
            content_type="application/json",
        )
        assert response.status_code == 403

    def test_meta_keeps_the_fields_the_editor_does_not_own(self, editor, corpus):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/meta/",
            {
                "difficulty": "hard",
                "major_category": "geography",
                # The pipeline owns these; sending them must change nothing.
                "id": "hijacked",
                "version": 99,
                "languages": [],
            },
            content_type="application/json",
        )
        assert response.status_code == 200
        on_disk = json.loads((corpus / "aaaa1111" / "meta.json").read_text())
        assert on_disk["difficulty"] == "hard"
        assert on_disk["major_category"] == "geography"
        assert on_disk["id"] == "aaaa1111"
        assert on_disk["version"] == 1
        assert on_disk["languages"] == ["de", "en"]

    def test_editing_a_missing_language_is_a_404(self, editor):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/fr/", QUESTION_DE, content_type="application/json"
        )
        assert response.status_code == 404


class TestReviewing:
    def test_a_generated_question_starts_unreviewed_in_the_listing(self, corpus, client):
        (corpus / "bbbb2222" / "meta.json").write_text(
            json.dumps({**META, "id": "bbbb2222", "reviewed": False}), encoding="utf-8"
        )
        index.reload()
        entries = {q["id"]: q for q in client.get("/api/corpus/index/").json()["questions"]}
        # The editor still lists it — it is the only place it can be reviewed.
        assert entries["bbbb2222"]["reviewed"] is False
        # Everything without the key predates the flag and counts as reviewed.
        assert entries["aaaa1111"]["reviewed"] is True

    def test_reviewing_needs_the_login(self, corpus, client):
        response = client.put(
            "/api/corpus/questions/aaaa1111/review/",
            {"reviewed": True},
            content_type="application/json",
        )
        assert response.status_code == 403

    def test_reviewing_flips_the_flag_on_disk(self, editor, corpus):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/review/",
            {"reviewed": False},
            content_type="application/json",
        )
        assert response.status_code == 200
        assert json.loads((corpus / "aaaa1111" / "meta.json").read_text())["reviewed"] is False

    def test_reviewing_leaves_the_rest_of_meta_alone(self, editor, corpus):
        editor.put(
            "/api/corpus/questions/aaaa1111/review/",
            {"reviewed": False},
            content_type="application/json",
        )
        on_disk = json.loads((corpus / "aaaa1111" / "meta.json").read_text())
        assert on_disk["major_category"] == "Geography"
        assert on_disk["created_at"] == META["created_at"]

    def test_a_non_boolean_is_refused(self, editor):
        response = editor.put(
            "/api/corpus/questions/aaaa1111/review/",
            {"reviewed": "yes"},
            content_type="application/json",
        )
        assert response.status_code == 400


class TestGenerationEndpoints:
    def test_the_capability_probe_needs_the_login(self, corpus, client):
        assert client.get("/api/corpus/generate/").status_code == 403

    def test_it_reports_why_generation_is_unavailable(self, editor, settings, tmp_path):
        # A server with no pipeline installed is the ordinary Docker-less case,
        # and "unavailable" without a reason is useless to whoever has to fix it.
        settings.PIPELINE_DIR = tmp_path / "nowhere"
        body = editor.get("/api/corpus/generate/").json()["capability"]
        assert body["available"] is False
        assert any("pipeline is not installed" in reason for reason in body["reasons"])

    def test_it_refuses_to_start_when_unavailable(self, editor, settings, tmp_path):
        settings.PIPELINE_DIR = tmp_path / "nowhere"
        response = editor.post(
            "/api/corpus/generate/",
            {"category": "Geography", "subcategory": "Mountains", "count": 1},
            content_type="application/json",
        )
        assert response.status_code == 409

    def test_a_run_needs_a_category(self, editor):
        response = editor.post(
            "/api/corpus/generate/", {"count": 1}, content_type="application/json"
        )
        assert response.status_code == 400

    def test_the_count_is_capped(self, editor):
        response = editor.post(
            "/api/corpus/generate/",
            {"category": "Geography", "subcategory": "Mountains", "count": 500},
            content_type="application/json",
        )
        assert response.status_code == 400
        assert "between 1 and" in response.json()["detail"]

    def test_categories_come_from_the_pipeline_config(self, editor, settings, tmp_path):
        config = tmp_path / "config"
        config.mkdir()
        (config / "categories.yaml").write_text(
            "categories:\n"
            "  geography:\n"
            "    name: Geography\n"
            "    subcategories:\n"
            "      mountains: Mountains\n"
            "      deserts: Deserts\n",
            encoding="utf-8",
        )
        settings.PIPELINE_DIR = tmp_path

        body = editor.get("/api/corpus/categories/").json()["categories"]
        assert [cat["name"] for cat in body] == ["Geography"]
        subs = {sub["name"]: sub["count"] for sub in body[0]["subcategories"]}
        # Counts come from the corpus, so an empty category is still offered —
        # which is the point, since that is what you would want to generate into.
        assert subs == {"Mountains": 1, "Deserts": 0}
