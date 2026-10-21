#!/usr/bin/env bash
# Local Postgres for development and end-to-end tests, on port 5433.
# Usage: scripts/dev-db.sh up | down | reset
set -euo pipefail

NAME=cynseat-pg
VOLUME=cynseat-pg

up() {
  if ! docker start "$NAME" >/dev/null 2>&1; then
    docker run -d --name "$NAME" \
      -e POSTGRES_USER=cynseat -e POSTGRES_PASSWORD=cynseat -e POSTGRES_DB=cynseat \
      -p 5433:5432 -v "$VOLUME":/var/lib/postgresql/data \
      postgres:17-alpine >/dev/null
  fi
  for _ in $(seq 1 60); do
    if docker exec "$NAME" pg_isready -U cynseat -d cynseat >/dev/null 2>&1; then
      echo "Postgres is ready on localhost:5433"
      return
    fi
    sleep 0.5
  done
  echo "Postgres did not become ready" >&2
  exit 1
}

down() {
  docker stop "$NAME" >/dev/null 2>&1 || true
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    up
    ;;
  *)
    echo "Usage: $0 up|down|reset" >&2
    exit 1
    ;;
esac
