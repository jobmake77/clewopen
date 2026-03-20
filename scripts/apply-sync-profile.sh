#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-$ROOT_DIR/backend/.env}"
PROFILE="${1:-daily}"

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "Missing env file: $BACKEND_ENV_FILE" >&2
  echo "Create it from backend/.env.example first." >&2
  exit 1
fi

set_kv() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ ("^" k "=") {
      print k "=" v
      done = 1
      next
    }
    { print }
    END {
      if (!done) print k "=" v
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

apply_daily() {
  set_kv "$BACKEND_ENV_FILE" "SYNC_INTERVAL_MINUTES" "1440"
  set_kv "$BACKEND_ENV_FILE" "SYNC_RUN_ON_START" "true"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_MAX_PAGES" "10"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_PER_PAGE" "100"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_REQUEST_INTERVAL_MS" "1500"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_MAX_REQUESTS_PER_RUN" "120"
  set_kv "$BACKEND_ENV_FILE" "SYNC_OPENCLAW_BATCH_SIZE" "120"
  set_kv "$BACKEND_ENV_FILE" "SYNC_OPENCLAW_BOOTSTRAP_MULTIPLIER" "3"
}

apply_backfill() {
  set_kv "$BACKEND_ENV_FILE" "SYNC_INTERVAL_MINUTES" "60"
  set_kv "$BACKEND_ENV_FILE" "SYNC_RUN_ON_START" "true"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_MAX_PAGES" "10"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_PER_PAGE" "100"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_REQUEST_INTERVAL_MS" "1200"
  set_kv "$BACKEND_ENV_FILE" "SYNC_GITHUB_MAX_REQUESTS_PER_RUN" "240"
  set_kv "$BACKEND_ENV_FILE" "SYNC_OPENCLAW_BATCH_SIZE" "300"
  set_kv "$BACKEND_ENV_FILE" "SYNC_OPENCLAW_BOOTSTRAP_MULTIPLIER" "6"
}

case "$PROFILE" in
  daily)
    apply_daily
    ;;
  backfill)
    apply_backfill
    ;;
  *)
    echo "Unknown profile: $PROFILE" >&2
    echo "Usage: bash scripts/apply-sync-profile.sh [daily|backfill]" >&2
    exit 1
    ;;
esac

echo "Applied sync profile '$PROFILE' to $BACKEND_ENV_FILE"
echo "Current sync settings:"
grep -E '^SYNC_|^GITHUB_TOKEN=' "$BACKEND_ENV_FILE" || true
