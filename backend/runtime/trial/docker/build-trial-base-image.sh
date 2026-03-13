#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
IMAGE_TAG="${1:-${TRIAL_SANDBOX_IMAGE:-openclew/trial-base:latest}}"
BASE_IMAGE="${TRIAL_SANDBOX_BASE_IMAGE:-node:22-bookworm-slim}"
DOCKER_HELPER_PATH="${TRIAL_SANDBOX_DOCKER_HELPER_PATH:-/Applications/Docker.app/Contents/Resources/bin}"
OPENCLAW_CLI_VERSION="${OPENCLAW_CLI_VERSION:-2026.3.12}"

if [ -z "${OPENCLEW_INSTALL_COMMAND:-}" ]; then
  OPENCLEW_INSTALL_COMMAND="npm install -g openclaw@${OPENCLAW_CLI_VERSION}"
fi

if [ -d "${DOCKER_HELPER_PATH}" ]; then
  export PATH="${DOCKER_HELPER_PATH}:${PATH}"
fi

docker build \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "OPENCLEW_INSTALL_COMMAND=${OPENCLEW_INSTALL_COMMAND}" \
  -t "${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"
