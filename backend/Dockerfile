FROM ghcr.io/astral-sh/uv:0.11.11 AS uv

FROM python:3.13-slim
WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_PROJECT_ENVIRONMENT=/app/backend/.venv
ENV LOCALGROWTH_DATA_DIR=/data

COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN uv sync --frozen --no-dev
RUN addgroup --system localgrowth \
    && adduser --system --ingroup localgrowth --no-create-home localgrowth \
    && mkdir -p /data \
    && chown localgrowth:localgrowth /data

EXPOSE 8000
USER localgrowth
CMD ["/app/backend/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
