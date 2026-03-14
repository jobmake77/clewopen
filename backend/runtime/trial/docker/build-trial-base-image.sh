#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
BASE_IMAGE="${TRIAL_SANDBOX_BASE_IMAGE:-node:22-bookworm-slim}"
DOCKER_HELPER_PATH="${TRIAL_SANDBOX_DOCKER_HELPER_PATH:-/Applications/Docker.app/Contents/Resources/bin}"
OPENCLAW_CLI_VERSION="${OPENCLAW_CLI_VERSION:-2026.3.12}"
SKIP_OS_BOOTSTRAP="${TRIAL_SANDBOX_SKIP_OS_BOOTSTRAP:-0}"
OPENCLEW_INSTALL_COMMAND="${OPENCLEW_INSTALL_COMMAND:-}"

compute_runtime_hash() {
  (
    cd "${SCRIPT_DIR}"
    {
      printf 'BASE_IMAGE=%s\n' "${BASE_IMAGE}"
      printf 'OPENCLAW_CLI_VERSION=%s\n' "${OPENCLAW_CLI_VERSION}"
      printf 'SKIP_OS_BOOTSTRAP=%s\n' "${SKIP_OS_BOOTSTRAP}"
      printf 'OPENCLEW_INSTALL_COMMAND=%s\n' "${OPENCLEW_INSTALL_COMMAND}"

      find Dockerfile session-runner.sh template -type f | LC_ALL=C sort | while IFS= read -r file; do
        printf 'FILE=%s\n' "${file}"
        cat "${file}"
        printf '\n'
      done
    } | if command -v shasum >/dev/null 2>&1; then
      shasum -a 256 | awk '{print $1}'
    else
      sha256sum | awk '{print $1}'
    fi
  )
}

if [ "${1:-}" = "--print-runtime-hash" ]; then
  compute_runtime_hash
  exit 0
fi

IMAGE_TAG="${1:-${TRIAL_SANDBOX_IMAGE:-openclew/trial-base:latest}}"
RUNTIME_HASH="$(compute_runtime_hash)"

if [ -z "${OPENCLEW_INSTALL_COMMAND}" ] && [ "${SKIP_OS_BOOTSTRAP}" != "1" ]; then
  OPENCLEW_INSTALL_COMMAND="npm install -g openclaw@${OPENCLAW_CLI_VERSION}"
fi

if [ -d "${DOCKER_HELPER_PATH}" ]; then
  export PATH="${DOCKER_HELPER_PATH}:${PATH}"
fi

docker build \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "OPENCLEW_INSTALL_COMMAND=${OPENCLEW_INSTALL_COMMAND}" \
  --build-arg "SKIP_OS_BOOTSTRAP=${SKIP_OS_BOOTSTRAP}" \
  --build-arg "TRIAL_RUNTIME_TEMPLATE_HASH=${RUNTIME_HASH}" \
  -t "${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"
