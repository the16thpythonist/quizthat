FROM python:3.12-slim

# uv, to match the pipeline's toolchain.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

COPY . .

ENV DJANGO_SETTINGS_MODULE=quizthat_server.settings \
    PYTHONUNBUFFERED=1

EXPOSE 8000
# One worker: the relay is a handful of clients per lobby, and SQLite wants a
# single writer. See CLAUDE.md before scaling this out.
CMD ["sh", "-c", "python manage.py migrate --noinput && uvicorn quizthat_server.asgi:application --host 0.0.0.0 --port 8000"]
