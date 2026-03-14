#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.trial.yml}"
INFRA_COMPOSE_FILE="${INFRA_COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-$ROOT_DIR/backend/.env}"
HOST_PROJECT_ROOT="${HOST_PROJECT_ROOT:-$ROOT_DIR}"
TRIAL_SANDBOX_IMAGE="${TRIAL_SANDBOX_IMAGE:-openclew/trial-base:latest}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
TRIAL_POOL_SIZE="${TRIAL_POOL_SIZE:-5}"
TRIAL_POOL_NAMESPACE="${TRIAL_POOL_NAMESPACE:-trial-backend-${BACKEND_PORT}}"
TRIAL_POOL_PREWARM_GATEWAY="${TRIAL_POOL_PREWARM_GATEWAY:-false}"
TRIAL_SANDBOX_FORCE_REBUILD="${TRIAL_SANDBOX_FORCE_REBUILD:-0}"
BACKEND_HEALTH_TIMEOUT_SECONDS="${BACKEND_HEALTH_TIMEOUT_SECONDS:-180}"
TRIAL_POOL_WAIT_TIMEOUT_SECONDS="${TRIAL_POOL_WAIT_TIMEOUT_SECONDS:-240}"
TRIAL_POOL_READY_POLL_INTERVAL_SECONDS="${TRIAL_POOL_READY_POLL_INTERVAL_SECONDS:-3}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_image_runtime_hash() {
  (
    cd "$ROOT_DIR/backend"
    sh "runtime/trial/docker/build-trial-base-image.sh" --print-runtime-hash
  )
}

read_image_runtime_hash() {
  docker image inspect \
    --format '{{ index .Config.Labels "openclew.trial.runtime-hash" }}' \
    "$TRIAL_SANDBOX_IMAGE" 2>/dev/null || true
}

ensure_trial_base_image() {
  local expected_hash current_hash
  expected_hash="$(resolve_image_runtime_hash)"
  current_hash="$(read_image_runtime_hash)"

  if ! docker image inspect "$TRIAL_SANDBOX_IMAGE" >/dev/null 2>&1; then
    echo "Building warm-pool base image: $TRIAL_SANDBOX_IMAGE"
    (
      cd "$ROOT_DIR/backend"
      sh "runtime/trial/docker/build-trial-base-image.sh" "$TRIAL_SANDBOX_IMAGE"
    )
    return
  fi

  if is_truthy "$TRIAL_SANDBOX_FORCE_REBUILD"; then
    echo "Rebuilding warm-pool base image because TRIAL_SANDBOX_FORCE_REBUILD is enabled."
    (
      cd "$ROOT_DIR/backend"
      sh "runtime/trial/docker/build-trial-base-image.sh" "$TRIAL_SANDBOX_IMAGE"
    )
    return
  fi

  if [ -z "$current_hash" ] || [ "$current_hash" = "<no value>" ] || [ "$current_hash" != "$expected_hash" ]; then
    echo "Rebuilding warm-pool base image because runtime assets changed."
    (
      cd "$ROOT_DIR/backend"
      sh "runtime/trial/docker/build-trial-base-image.sh" "$TRIAL_SANDBOX_IMAGE"
    )
    return
  fi

  echo "Warm-pool base image is up to date: $TRIAL_SANDBOX_IMAGE"
}

wait_for_backend_health() {
  local deadline
  deadline=$((SECONDS + BACKEND_HEALTH_TIMEOUT_SECONDS))

  until curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "Backend health check timed out after ${BACKEND_HEALTH_TIMEOUT_SECONDS}s." >&2
      docker compose -f "$COMPOSE_FILE" logs --tail=200 backend || true
      exit 1
    fi
    sleep 2
  done
}

list_pool_containers() {
  docker ps \
    --filter "label=openclew.pool=true" \
    --filter "label=openclew.pool_namespace=${TRIAL_POOL_NAMESPACE}" \
    --format '{{.Names}}'
}

slot_container_name() {
  local slot_index="$1"
  printf 'openclew-trial-pool-%s-slot-%02d' "$TRIAL_POOL_NAMESPACE" "$slot_index"
}

slot_install_log_path() {
  local slot_index="$1"
  printf '%s/backend/.trial-runtime/trial-pool/%s/slot-%02d/logs/install.log' \
    "$ROOT_DIR" \
    "$TRIAL_POOL_NAMESPACE" \
    "$slot_index"
}

is_pool_container_running() {
  local container_name="$1"
  docker ps --filter "name=^${container_name}$" --format '{{.Names}}' | grep -qx "$container_name"
}

is_pool_container_ready() {
  local slot_index="$1"
  local container_name install_log
  container_name="$(slot_container_name "$slot_index")"
  install_log="$(slot_install_log_path "$slot_index")"

  if ! is_pool_container_running "$container_name"; then
    return 1
  fi

  if [[ ! -f "$install_log" ]] || ! grep -q 'install action completed' "$install_log"; then
    return 1
  fi

  if ! is_truthy "$TRIAL_POOL_PREWARM_GATEWAY"; then
    return 0
  fi

  docker exec "$container_name" /bin/sh -lc '
    test -f /workspace/state/openclaw/gateway/state/gateway.pid &&
    curl -fsS http://127.0.0.1:${TRIAL_OPENCLAW_GATEWAY_PORT:-19003}/health >/dev/null
  ' >/dev/null 2>&1
}

print_pool_debug_context() {
  local containers=()

  echo "Warm pool readiness timed out for namespace: ${TRIAL_POOL_NAMESPACE}" >&2
  docker compose -f "$COMPOSE_FILE" logs --tail=200 backend || true

  while IFS= read -r line; do
    [ -n "$line" ] && containers+=("$line")
  done < <(list_pool_containers)

  if [ "${#containers[@]}" -gt 0 ]; then
    echo "Pool containers seen:" >&2
    printf '  %s\n' "${containers[@]}" >&2

    echo "Recent logs from first pool container (${containers[0]}):" >&2
    docker logs --tail=100 "${containers[0]}" >&2 || true
  else
    echo "No pool containers were detected yet." >&2
  fi
}

wait_for_pool_ready() {
  if ! [ "$TRIAL_POOL_SIZE" -gt 0 ] 2>/dev/null; then
    return
  fi

  local deadline ready_count slot_index
  deadline=$((SECONDS + TRIAL_POOL_WAIT_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    ready_count=0

    for ((slot_index = 1; slot_index <= TRIAL_POOL_SIZE; slot_index += 1)); do
      if is_pool_container_ready "$slot_index"; then
        ready_count=$((ready_count + 1))
      fi
    done

    if [ "$ready_count" -ge "$TRIAL_POOL_SIZE" ]; then
      echo "Warm pool ready: ${ready_count}/${TRIAL_POOL_SIZE} slots healthy."
      return
    fi

    sleep "$TRIAL_POOL_READY_POLL_INTERVAL_SECONDS"
  done

  print_pool_debug_context
  exit 1
}

require_command docker
require_command curl

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "Missing backend env file: $BACKEND_ENV_FILE" >&2
  echo "Copy backend/.env.example to backend/.env and fill in the provider config first." >&2
  exit 1
fi

mkdir -p \
  "$ROOT_DIR/backend/.trial-runtime/trial-sessions" \
  "$ROOT_DIR/backend/.trial-runtime/trial-pool" \
  "$ROOT_DIR/backend/storage/agents" \
  "$ROOT_DIR/backend/uploads/agents"

ensure_trial_base_image

export HOST_PROJECT_ROOT
export TRIAL_SANDBOX_IMAGE
export BACKEND_PORT
export TRIAL_POOL_SIZE
export TRIAL_POOL_NAMESPACE
export TRIAL_POOL_PREWARM_GATEWAY

docker compose -f "$INFRA_COMPOSE_FILE" up -d
docker compose -f "$COMPOSE_FILE" up -d --build

wait_for_backend_health
wait_for_pool_ready

echo
echo "Trial stack started."
echo "Backend: http://localhost:${BACKEND_PORT}"
echo "Pool namespace: ${TRIAL_POOL_NAMESPACE}"
echo "Pool status API: http://localhost:${BACKEND_PORT}/api/admin/trial-runtime/pool"
echo "Warm slots: ${TRIAL_POOL_SIZE}"
echo
echo "Use scripts/stop-trial-stack.sh to stop the trial backend."
