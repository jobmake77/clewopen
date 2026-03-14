#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.trial.yml}"
INFRA_COMPOSE_FILE="${INFRA_COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
HOST_PROJECT_ROOT="${HOST_PROJECT_ROOT:-$ROOT_DIR}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
TRIAL_POOL_NAMESPACE="${TRIAL_POOL_NAMESPACE:-trial-backend-${BACKEND_PORT}}"

export HOST_PROJECT_ROOT

docker compose -f "$COMPOSE_FILE" down

pool_containers="$(docker ps -aq \
  --filter "label=openclew.pool=true" \
  --filter "label=openclew.pool_namespace=${TRIAL_POOL_NAMESPACE}")"

if [[ -n "$pool_containers" ]]; then
  docker rm -f $pool_containers >/dev/null
fi

if [[ "${1:-}" == "--with-infra" ]]; then
  docker compose -f "$INFRA_COMPOSE_FILE" down
fi
