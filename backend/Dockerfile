FROM ghcr.io/astral-sh/uv:0.11.11 AS uv

FROM python:3.13-slim
WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_PROJECT_ENVIRONMENT=/app/backend/.venv
ENV SOCIUM_DATA_DIR=/data

COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN uv sync --frozen --no-dev
RUN addgroup --system socium \
    && adduser --system --ingroup socium --no-create-home socium \
    && mkdir -p /data \
    && chown socium:socium /data

EXPOSE 8000
USER socium
CMD ["/app/backend/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
