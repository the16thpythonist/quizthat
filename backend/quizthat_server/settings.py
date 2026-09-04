"""
Django settings for the QuizThat relay.

Deliberately small. This server owns lobbies, a corpus browser and match stats;
it does not own the game. See CLAUDE.md — the session blob it relays is opaque
to it, and one client stays authoritative.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# The repository root, so the corpus can be read from questions/ in place.
# Overridable for the container, where the folder is mounted elsewhere.
REPO_ROOT = Path(os.environ.get("QUIZTHAT_REPO_ROOT", BASE_DIR.parent))

# The same gitignored .env the pipeline reads for its API keys. Secrets belong
# there and not in this file, which is committed.
load_dotenv(REPO_ROOT / ".env")
CORPUS_DIR = Path(os.environ.get("QUIZTHAT_CORPUS_DIR", REPO_ROOT / "questions"))
# The generation pipeline, driven as a subprocess from its own venv — see
# corpus/generation.py for why it is not imported.
PIPELINE_DIR = Path(os.environ.get("QUIZTHAT_PIPELINE_DIR", REPO_ROOT / "pipeline"))

# Development default. Set DJANGO_SECRET_KEY before exposing this anywhere.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-a-secret")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

# Phones join over the LAN by IP, so the host header varies by network.
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "lobbies",
    "corpus",
    "stats",
]

# Sessions, messages and CSRF are here for the corpus browser's edit form — the
# one place this server serves HTML and accepts a non-token POST. The JSON API is
# unaffected: DRF views are csrf_exempt, and with no authentication classes
# configured nothing there consults a cookie.
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "quizthat_server.urls"
ASGI_APPLICATION = "quizthat_server.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_DB_PATH", BASE_DIR / "db.sqlite3"),
        "OPTIONS": {
            # A lobby writes on every intent and snapshot while an SSE stream is
            # reading, so readers must not block on the writer.
            "init_command": "PRAGMA journal_mode=WAL;",
            "timeout": 20,
        },
    }
}

# The game is served from a different origin (the Vite dev server, or nginx),
# and joins happen from phones on the LAN. Nothing here is authenticated by
# cookie — every request carries an opaque bearer token — so credentialless
# cross-origin access is the whole point.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}

# ─── Corpus editor login ────────────────────────────────────────
#
# One shared login for whoever curates the questions — there are no user
# accounts, and this guards exactly one thing: the editor at /corpus/, which
# can rewrite question files. Everything to do with playing a game is open, as
# players and televisions have nobody to sign in as.
#
# Deliberately read from the environment rather than written here: this file is
# committed and pushed, and a password in it would live in the git history for
# good. With QUIZTHAT_ADMIN_PASSWORD unset the editor refuses to open at all,
# so forgetting to configure it fails loudly rather than leaving the corpus
# writable by anyone on the network.
ADMIN_USER = os.environ.get("QUIZTHAT_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("QUIZTHAT_ADMIN_PASSWORD", "")

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO")},
}
