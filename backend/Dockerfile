# Built from the repo root, not from backend/, because the image also carries
# the generation pipeline — see the `backend` service in docker-compose.yml.
FROM python:3.12-slim

# Node, for the `claude` CLI. The generation agent is that CLI: the pipeline
# spawns it, so a backend that is meant to generate needs it on PATH. Debian's
# nodejs is 18, which is the minimum Claude Code supports.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
    && npm install -g @anthropic-ai/claude-code \
    && npm cache clean --force \
    && apt-get purge -y npm \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# uv, to match the pipeline's toolchain.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY backend/pyproject.toml ./
RUN uv pip install --system --no-cache .

# The pipeline, installed onto PATH as `quizthat`. corpus/generation.py runs it
# as a subprocess; it is a separate application and stays one, but it has to be
# *present* for the editor's Generate tab to work at all.
COPY pipeline /pipeline
RUN uv pip install --system --no-cache /pipeline

COPY backend/ .

ENV DJANGO_SETTINGS_MODULE=quizthat_server.settings \
    PYTHONUNBUFFERED=1 \
    QUIZTHAT_PIPELINE_DIR=/pipeline

EXPOSE 8000
# One worker: the relay is a handful of clients per lobby, and SQLite wants a
# single writer. See CLAUDE.md before scaling this out.
CMD ["sh", "-c", "python manage.py migrate --noinput && uvicorn quizthat_server.asgi:application --host 0.0.0.0 --port 8000"]
