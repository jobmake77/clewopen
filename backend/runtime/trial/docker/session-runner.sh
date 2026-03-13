#!/bin/sh
set -eu

ACTION="${1:-run}"
CLI_BIN="${TRIAL_SANDBOX_CLI_BINARY:-}"
AGENT_SOURCE_DIR="${AGENT_DIR:-/workspace/agent}"
REQUEST_FILE="${REQUEST_FILE:-/workspace/state/request.json}"
RESPONSE_FILE="${RESPONSE_FILE:-/workspace/state/response.json}"
STATE_DIR="${STATE_DIR:-/workspace/state}"
LOG_DIR="${LOG_DIR:-/workspace/logs}"
INSTALL_LOG_FILE="${INSTALL_LOG_FILE:-/workspace/logs/install.log}"
EXEC_LOG_FILE="${EXEC_LOG_FILE:-/workspace/logs/execution.log}"

OPENCLAW_ROOT="${TRIAL_OPENCLAW_ROOT:-$STATE_DIR/openclaw}"
OPENCLAW_HOME="${TRIAL_OPENCLAW_HOME:-$OPENCLAW_ROOT/home}"
OPENCLAW_RUNTIME_DIR="${TRIAL_OPENCLAW_RUNTIME_DIR:-$OPENCLAW_ROOT/runtime}"
OPENCLAW_WORKSPACE_DIR="${TRIAL_OPENCLAW_WORKSPACE_DIR:-$OPENCLAW_ROOT/workspace}"
OPENCLAW_AGENT_STATE_DIR="${TRIAL_OPENCLAW_AGENT_STATE_DIR:-$OPENCLAW_ROOT/agent}"
OPENCLAW_CONFIG_FILE="${TRIAL_OPENCLAW_CONFIG_FILE:-$OPENCLAW_HOME/.openclaw/openclaw.json}"
OPENCLAW_AGENT_ID="${TRIAL_OPENCLAW_AGENT_ID:-trial-session}"
OPENCLAW_PROVIDER_ID="${TRIAL_LLM_PROVIDER_ID:-trial-provider}"
OPENCLAW_TIMEOUT_SECONDS="${TRIAL_OPENCLAW_TIMEOUT_SECONDS:-120}"
OPENCLAW_NODE_OPTIONS="${TRIAL_OPENCLAW_NODE_OPTIONS:-}"

log() {
  target_file="$1"
  shift
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >> "$target_file"
}

resolve_cli_bin() {
  if [ -n "$CLI_BIN" ] && command -v "$CLI_BIN" >/dev/null 2>&1; then
    printf '%s' "$CLI_BIN"
    return
  fi

  for candidate in openclaw openclew-cli clewopen; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return
    fi
  done

  echo "OpenClaw CLI is not installed in this image" >&2
  exit 127
}

OPENCLAW_BIN="$(resolve_cli_bin)"
export HOME="$OPENCLAW_HOME"

if [ -n "$OPENCLAW_NODE_OPTIONS" ]; then
  if [ -n "${NODE_OPTIONS:-}" ]; then
    export NODE_OPTIONS="$OPENCLAW_NODE_OPTIONS $NODE_OPTIONS"
  else
    export NODE_OPTIONS="$OPENCLAW_NODE_OPTIONS"
  fi
fi

umask 077

ensure_runtime_dirs() {
  mkdir -p \
    "$STATE_DIR" \
    "$LOG_DIR" \
    "$OPENCLAW_RUNTIME_DIR" \
    "$OPENCLAW_AGENT_STATE_DIR" \
    "$(dirname "$OPENCLAW_CONFIG_FILE")"
}

prepare_runtime_workspace() {
  rm -rf "$OPENCLAW_WORKSPACE_DIR"
  mkdir -p "$OPENCLAW_WORKSPACE_DIR"

  if [ -d "$AGENT_SOURCE_DIR" ] && [ "$(ls -A "$AGENT_SOURCE_DIR" 2>/dev/null)" ]; then
    cp -R "$AGENT_SOURCE_DIR"/. "$OPENCLAW_WORKSPACE_DIR"/
  fi
}

run_openclaw_setup() {
  "$OPENCLAW_BIN" setup --workspace "$OPENCLAW_WORKSPACE_DIR"
}

write_openclaw_config() {
  TRIAL_OPENCLAW_CONFIG_FILE="$OPENCLAW_CONFIG_FILE" \
  TRIAL_OPENCLAW_WORKSPACE_DIR="$OPENCLAW_WORKSPACE_DIR" \
  TRIAL_OPENCLAW_AGENT_STATE_DIR="$OPENCLAW_AGENT_STATE_DIR" \
  TRIAL_OPENCLAW_AGENT_ID="$OPENCLAW_AGENT_ID" \
  TRIAL_OPENCLAW_PROVIDER_ID="$OPENCLAW_PROVIDER_ID" \
  node <<'NODE'
const fs = require('fs')
const path = require('path')

const configPath = process.env.TRIAL_OPENCLAW_CONFIG_FILE
const workspaceDir = process.env.TRIAL_OPENCLAW_WORKSPACE_DIR
const providerId = process.env.TRIAL_OPENCLAW_PROVIDER_ID || 'trial-provider'
const modelId = String(process.env.TRIAL_LLM_MODEL_ID || '').trim()
const apiUrl = String(process.env.TRIAL_LLM_API_URL || '').trim()
const apiKey = String(process.env.TRIAL_LLM_API_KEY || '').trim()
const authType = String(process.env.TRIAL_LLM_AUTH_TYPE || 'bearer').trim().toLowerCase()
const compatibility = String(process.env.TRIAL_LLM_COMPATIBILITY || 'openai').trim().toLowerCase()
const maxTokens = Number.parseInt(String(process.env.TRIAL_LLM_MAX_TOKENS || '4096'), 10)

if (!configPath || !workspaceDir) {
  throw new Error('OpenClaw runtime config paths are missing')
}

if (!modelId) {
  throw new Error('TRIAL_LLM_MODEL_ID is required for OpenClaw sandbox install')
}

if (!apiUrl) {
  throw new Error('TRIAL_LLM_API_URL is required for OpenClaw sandbox install')
}

if (authType !== 'none' && !apiKey) {
  throw new Error('TRIAL_LLM_API_KEY is required for OpenClaw sandbox install')
}

let config = {}
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch {
  config = {}
}

const providerApi = compatibility === 'anthropic' ? 'anthropic-messages' : 'openai-completions'
const modelRef = `${providerId}/${modelId}`
const provider = {
  ...(config.models?.providers?.[providerId] || {}),
  baseUrl: apiUrl,
  api: providerApi,
  models: Array.isArray(config.models?.providers?.[providerId]?.models)
    ? config.models.providers[providerId].models
        .filter((item) => item && item.id !== modelId)
        .concat([
          {
            id: modelId,
            name: `${modelId} (Trial Provider)`,
            contextWindow: 32000,
            maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
            input: ['text'],
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            reasoning: false,
          },
        ])
    : [
        {
          id: modelId,
          name: `${modelId} (Trial Provider)`,
          contextWindow: 32000,
          maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
          input: ['text'],
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          reasoning: false,
        },
      ],
}

if (authType !== 'none') {
  provider.apiKey = authType === 'bearer'
    ? apiKey.replace(/^Bearer\s+/i, '').trim()
    : apiKey
} else {
  delete provider.apiKey
}

config = {
  ...config,
  meta: {
    ...(config.meta || {}),
    lastTouchedAt: new Date().toISOString(),
    lastTouchedVersion: config.meta?.lastTouchedVersion || 'trial-runtime',
  },
  models: {
    ...(config.models || {}),
    mode: config.models?.mode || 'merge',
    providers: {
      ...(config.models?.providers || {}),
      [providerId]: provider,
    },
  },
  agents: {
    ...(config.agents || {}),
    defaults: {
      ...(config.agents?.defaults || {}),
      workspace: workspaceDir,
      model: config.agents?.defaults?.model && typeof config.agents.defaults.model === 'object'
        ? {
            ...config.agents.defaults.model,
            primary: modelRef,
          }
        : { primary: modelRef },
    },
  },
}

fs.mkdirSync(path.dirname(configPath), { recursive: true })
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
NODE
}

agent_exists() {
  TRIAL_OPENCLAW_CONFIG_FILE="$OPENCLAW_CONFIG_FILE" \
  TRIAL_OPENCLAW_AGENT_ID="$OPENCLAW_AGENT_ID" \
  node <<'NODE'
const fs = require('fs')

const configPath = process.env.TRIAL_OPENCLAW_CONFIG_FILE
const agentId = process.env.TRIAL_OPENCLAW_AGENT_ID

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const list = Array.isArray(config?.agents?.list) ? config.agents.list : []
  const found = list.some((item) => item && item.id === agentId)
  process.exit(found ? 0 : 1)
} catch {
  process.exit(1)
}
NODE
}

ensure_agent_registered() {
  if agent_exists; then
    return
  fi

  if [ -z "${TRIAL_LLM_MODEL_ID:-}" ]; then
    echo "TRIAL_LLM_MODEL_ID is required before running openclaw agents add" >&2
    exit 1
  fi

  "$OPENCLAW_BIN" agents add "$OPENCLAW_AGENT_ID" \
    --non-interactive \
    --workspace "$OPENCLAW_WORKSPACE_DIR" \
    --agent-dir "$OPENCLAW_AGENT_STATE_DIR" \
    --model "$OPENCLAW_PROVIDER_ID/$TRIAL_LLM_MODEL_ID"
}

read_request_message() {
  REQUEST_FILE="$REQUEST_FILE" node <<'NODE'
const fs = require('fs')

try {
  const request = JSON.parse(fs.readFileSync(process.env.REQUEST_FILE, 'utf8'))
  const message = String(request?.userMessage || request?.message || '').trim()
  process.stdout.write(message)
} catch (error) {
  console.error(`Failed to read request payload: ${error.message}`)
  process.exit(1)
}
NODE
}

write_response_file() {
  RAW_OUTPUT_FILE="$1" RESPONSE_FILE="$RESPONSE_FILE" node <<'NODE'
const fs = require('fs')

function parseJsonTail(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  for (let index = trimmed.indexOf('{'); index !== -1; index = trimmed.indexOf('{', index + 1)) {
    const candidate = trimmed.slice(index)
    try {
      return JSON.parse(candidate)
    } catch {
      // Keep scanning until the final JSON envelope is found.
    }
  }

  return null
}

const rawPath = process.env.RAW_OUTPUT_FILE
const responsePath = process.env.RESPONSE_FILE
const rawOutput = fs.readFileSync(rawPath, 'utf8')
const parsed = parseJsonTail(rawOutput)
const payloads = Array.isArray(parsed?.payloads) ? parsed.payloads : []
const response = payloads
  .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
  .filter(Boolean)
  .join('\n\n') ||
  (typeof parsed?.summary === 'string' ? parsed.summary.trim() : '') ||
  (typeof parsed?.message === 'string' ? parsed.message.trim() : '') ||
  (parsed ? 'No reply from agent.' : rawOutput.trim())

const usage = parsed?.meta?.agentMeta?.usage || parsed?.meta?.agentMeta?.lastCallUsage || null

fs.writeFileSync(
  responsePath,
  `${JSON.stringify(
    {
      response,
      usage,
      raw: parsed || rawOutput.trim(),
    },
    null,
    2
  )}\n`,
  'utf8'
)
NODE
}

default_install() {
  ensure_runtime_dirs
  prepare_runtime_workspace
  run_openclaw_setup
  write_openclaw_config
  ensure_agent_registered
  write_openclaw_config
}

default_run() {
  ensure_runtime_dirs

  if [ ! -f "$OPENCLAW_CONFIG_FILE" ]; then
    echo "OpenClaw sandbox is not initialized. Run install first." >&2
    exit 1
  fi

  user_message="$(read_request_message)"

  if [ -z "$user_message" ]; then
    echo "Request message is empty" >&2
    exit 1
  fi

  raw_output_file="$OPENCLAW_RUNTIME_DIR/agent-output.json"
  rm -f "$raw_output_file" "$RESPONSE_FILE"

  "$OPENCLAW_BIN" agent \
    --local \
    --agent "$OPENCLAW_AGENT_ID" \
    --session-id "${SESSION_ID:-trial-session}" \
    --message "$user_message" \
    --json \
    --timeout "$OPENCLAW_TIMEOUT_SECONDS" \
    > "$raw_output_file"

  write_response_file "$raw_output_file"
}

case "$ACTION" in
  install)
    log "$INSTALL_LOG_FILE" "starting install action"
    if [ -n "${TRIAL_SANDBOX_CUSTOM_INSTALL_CMD:-}" ]; then
      sh -lc "$TRIAL_SANDBOX_CUSTOM_INSTALL_CMD"
    else
      default_install
    fi
    log "$INSTALL_LOG_FILE" "install action completed"
    ;;
  run)
    log "$EXEC_LOG_FILE" "starting run action"
    if [ -n "${TRIAL_SANDBOX_CUSTOM_RUN_CMD:-}" ]; then
      sh -lc "$TRIAL_SANDBOX_CUSTOM_RUN_CMD"
    else
      default_run
    fi
    log "$EXEC_LOG_FILE" "run action completed"
    ;;
  *)
    echo "unsupported action: $ACTION" >&2
    exit 1
    ;;
esac
