FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --upgrade pip setuptools wheel \
  && pip install -r requirements.txt

COPY backend/ ./
# Alembic config and migrations
WORKDIR /app
COPY alembic.ini ./
COPY alembic ./alembic
WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-c", "alembic -c /app/alembic.ini upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]