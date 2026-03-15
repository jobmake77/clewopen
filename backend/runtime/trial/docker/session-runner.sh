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
OPENCLAW_MODELS_FILE="${TRIAL_OPENCLAW_MODELS_FILE:-$OPENCLAW_AGENT_STATE_DIR/models.json}"
OPENCLAW_GATEWAY_ROOT="${TRIAL_OPENCLAW_GATEWAY_ROOT:-$OPENCLAW_ROOT/gateway}"
OPENCLAW_GATEWAY_STATE_DIR="${TRIAL_OPENCLAW_GATEWAY_STATE_DIR:-$OPENCLAW_GATEWAY_ROOT/state}"
OPENCLAW_GATEWAY_TMP_DIR="${TRIAL_OPENCLAW_GATEWAY_TMP_DIR:-$OPENCLAW_GATEWAY_ROOT/tmp}"
OPENCLAW_GATEWAY_CONFIG_FILE="${TRIAL_OPENCLAW_GATEWAY_CONFIG_FILE:-$OPENCLAW_GATEWAY_ROOT/openclaw.json}"
OPENCLAW_GATEWAY_PID_FILE="${TRIAL_OPENCLAW_GATEWAY_PID_FILE:-$OPENCLAW_GATEWAY_STATE_DIR/gateway.pid}"
OPENCLAW_GATEWAY_LOG_FILE="${TRIAL_OPENCLAW_GATEWAY_LOG_FILE:-$LOG_DIR/gateway.log}"
OPENCLAW_GATEWAY_PORT="${TRIAL_OPENCLAW_GATEWAY_PORT:-19003}"
OPENCLAW_GATEWAY_STARTUP_TIMEOUT_SECONDS="${TRIAL_OPENCLAW_GATEWAY_STARTUP_TIMEOUT_SECONDS:-60}"
OPENCLAW_TEMPLATE_ROOT="${TRIAL_OPENCLAW_TEMPLATE_ROOT:-/opt/openclew/template}"
OPENCLAW_TEMPLATE_HOME="${TRIAL_OPENCLAW_TEMPLATE_HOME:-$OPENCLAW_TEMPLATE_ROOT/home}"
OPENCLAW_TEMPLATE_WORKSPACE_DIR="${TRIAL_OPENCLAW_TEMPLATE_WORKSPACE_DIR:-$OPENCLAW_TEMPLATE_ROOT/workspace}"
OPENCLAW_AGENT_ID="${TRIAL_OPENCLAW_AGENT_ID:-trial-session}"
OPENCLAW_PROVIDER_ID="${TRIAL_LLM_PROVIDER_ID:-trial-provider}"
OPENCLAW_TIMEOUT_SECONDS="${TRIAL_OPENCLAW_TIMEOUT_SECONDS:-120}"
OPENCLAW_NODE_OPTIONS="${TRIAL_OPENCLAW_NODE_OPTIONS:-}"
OPENCLAW_THINKING_LEVEL="${TRIAL_OPENCLAW_THINKING_LEVEL:-}"
OPENCLAW_VERBOSE="${TRIAL_OPENCLAW_VERBOSE:-on}"
OPENCLAW_USE_CLI_INSTALL="${TRIAL_OPENCLAW_USE_CLI_INSTALL:-false}"
OPENCLAW_POOL_REUSE="${TRIAL_OPENCLAW_POOL_REUSE:-false}"
OPENCLAW_PRESERVE_GATEWAY_ON_POOL_REUSE="${TRIAL_OPENCLAW_PRESERVE_GATEWAY_ON_POOL_REUSE:-false}"

log() {
  target_file="$1"
  shift
  mkdir -p "$(dirname "$target_file")"
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >> "$target_file"
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
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
    "$OPENCLAW_WORKSPACE_DIR" \
    "$OPENCLAW_AGENT_STATE_DIR" \
    "$OPENCLAW_GATEWAY_STATE_DIR" \
    "$OPENCLAW_GATEWAY_TMP_DIR" \
    "$(dirname "$OPENCLAW_GATEWAY_CONFIG_FILE")" \
    "$(dirname "$OPENCLAW_CONFIG_FILE")"
}

prepare_runtime_workspace() {
  rm -rf "$OPENCLAW_WORKSPACE_DIR"
  mkdir -p "$OPENCLAW_WORKSPACE_DIR"

  if [ -d "$OPENCLAW_TEMPLATE_WORKSPACE_DIR" ] && [ "$(ls -A "$OPENCLAW_TEMPLATE_WORKSPACE_DIR" 2>/dev/null)" ]; then
    cp -R "$OPENCLAW_TEMPLATE_WORKSPACE_DIR"/. "$OPENCLAW_WORKSPACE_DIR"/
  fi

  if [ -d "$AGENT_SOURCE_DIR" ] && [ "$(ls -A "$AGENT_SOURCE_DIR" 2>/dev/null)" ]; then
    cp -R "$AGENT_SOURCE_DIR"/. "$OPENCLAW_WORKSPACE_DIR"/
  fi
}

prepare_openclaw_home() {
  rm -rf "$OPENCLAW_HOME"
  mkdir -p "$OPENCLAW_HOME"

  if [ -d "$OPENCLAW_TEMPLATE_HOME" ] && [ "$(ls -A "$OPENCLAW_TEMPLATE_HOME" 2>/dev/null)" ]; then
    cp -R "$OPENCLAW_TEMPLATE_HOME"/. "$OPENCLAW_HOME"/
  fi

  mkdir -p \
    "$(dirname "$OPENCLAW_CONFIG_FILE")" \
    "$(dirname "$OPENCLAW_MODELS_FILE")" \
    "$OPENCLAW_HOME/.openclaw/agents/main/sessions" \
    "$OPENCLAW_HOME/.openclaw/agents/$OPENCLAW_AGENT_ID/sessions"
}

ensure_openclaw_home_dirs() {
  mkdir -p \
    "$OPENCLAW_HOME" \
    "$(dirname "$OPENCLAW_CONFIG_FILE")" \
    "$(dirname "$OPENCLAW_MODELS_FILE")" \
    "$OPENCLAW_HOME/.openclaw/agents/main/sessions" \
    "$OPENCLAW_HOME/.openclaw/agents/$OPENCLAW_AGENT_ID/sessions"
}

run_openclaw_setup() {
  "$OPENCLAW_BIN" setup --workspace "$OPENCLAW_WORKSPACE_DIR"
}

write_openclaw_config() {
  TRIAL_OPENCLAW_CONFIG_FILE="$OPENCLAW_CONFIG_FILE" \
  TRIAL_OPENCLAW_MODELS_FILE="$OPENCLAW_MODELS_FILE" \
  TRIAL_OPENCLAW_GATEWAY_CONFIG_FILE="$OPENCLAW_GATEWAY_CONFIG_FILE" \
  TRIAL_OPENCLAW_WORKSPACE_DIR="$OPENCLAW_WORKSPACE_DIR" \
  TRIAL_OPENCLAW_AGENT_STATE_DIR="$OPENCLAW_AGENT_STATE_DIR" \
  TRIAL_OPENCLAW_AGENT_ID="$OPENCLAW_AGENT_ID" \
  TRIAL_OPENCLAW_PROVIDER_ID="$OPENCLAW_PROVIDER_ID" \
  TRIAL_OPENCLAW_TEMPLATE_CONFIG_FILE="$OPENCLAW_TEMPLATE_HOME/.openclaw/openclaw.json" \
  node <<'NODE'
const fs = require('fs')
const path = require('path')

const configPath = process.env.TRIAL_OPENCLAW_CONFIG_FILE
const modelsPath = process.env.TRIAL_OPENCLAW_MODELS_FILE
const gatewayConfigPath = process.env.TRIAL_OPENCLAW_GATEWAY_CONFIG_FILE
const workspaceDir = process.env.TRIAL_OPENCLAW_WORKSPACE_DIR
const agentStateDir = process.env.TRIAL_OPENCLAW_AGENT_STATE_DIR
const agentId = process.env.TRIAL_OPENCLAW_AGENT_ID || 'trial-session'
const providerId = process.env.TRIAL_OPENCLAW_PROVIDER_ID || 'trial-provider'
const templateConfigPath = process.env.TRIAL_OPENCLAW_TEMPLATE_CONFIG_FILE
const modelId = String(process.env.TRIAL_LLM_MODEL_ID || '').trim()
const apiUrl = String(process.env.TRIAL_LLM_API_URL || '').trim()
const apiKey = String(process.env.TRIAL_LLM_API_KEY || '').trim()
const authType = String(process.env.TRIAL_LLM_AUTH_TYPE || 'bearer').trim().toLowerCase()
const compatibility = String(process.env.TRIAL_LLM_COMPATIBILITY || 'openai').trim().toLowerCase()
const maxTokens = Number.parseInt(String(process.env.TRIAL_LLM_MAX_TOKENS || '4096'), 10)

if (!configPath || !modelsPath || !workspaceDir || !agentStateDir) {
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
  if (templateConfigPath && fs.existsSync(templateConfigPath)) {
    config = JSON.parse(fs.readFileSync(templateConfigPath, 'utf8'))
  } else {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }
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
    list: [
      { id: 'main' },
      {
        id: agentId,
        name: agentId,
        workspace: workspaceDir,
        agentDir: agentStateDir,
        model: modelRef,
      },
    ],
  },
  commands: {
    native: 'auto',
    nativeSkills: 'auto',
    restart: true,
    ownerDisplay: 'raw',
    ...(config.commands || {}),
  },
  gateway: {
    ...(config.gateway || {}),
    mode: 'local',
    http: {
      ...(config.gateway?.http || {}),
      endpoints: {
        ...(config.gateway?.http?.endpoints || {}),
        responses: {
          ...(config.gateway?.http?.endpoints?.responses || {}),
          enabled: true,
        },
      },
    },
  },
}

fs.mkdirSync(path.dirname(configPath), { recursive: true })
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})

if (gatewayConfigPath) {
  fs.mkdirSync(path.dirname(gatewayConfigPath), { recursive: true })
  fs.writeFileSync(gatewayConfigPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
}

fs.mkdirSync(path.dirname(modelsPath), { recursive: true })
fs.writeFileSync(
  modelsPath,
  `${JSON.stringify(
    {
      providers: {
        [providerId]: provider,
      },
    },
    null,
    2
  )}\n`,
  {
    encoding: 'utf8',
    mode: 0o600,
  }
)
NODE
}

gateway_is_healthy() {
  curl -fsS "http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/health" >/dev/null 2>&1
}

read_gateway_pid() {
  if [ -f "$OPENCLAW_GATEWAY_PID_FILE" ]; then
    tr -dc '0-9' < "$OPENCLAW_GATEWAY_PID_FILE"
    return 0
  fi

  return 1
}

remove_gateway_pid() {
  rm -f "$OPENCLAW_GATEWAY_PID_FILE"
}

gateway_process_running() {
  gateway_pid="$(read_gateway_pid 2>/dev/null || true)"
  if [ -z "$gateway_pid" ]; then
    return 1
  fi

  kill -0 "$gateway_pid" >/dev/null 2>&1
}

cleanup_stale_gateway_process() {
  gateway_pid="$(read_gateway_pid 2>/dev/null || true)"
  if [ -n "$gateway_pid" ] && kill -0 "$gateway_pid" >/dev/null 2>&1; then
    kill "$gateway_pid" >/dev/null 2>&1 || true
    wait "$gateway_pid" >/dev/null 2>&1 || true
  fi
  remove_gateway_pid
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

gateway_config_matches_runtime() {
  TRIAL_OPENCLAW_CONFIG_FILE="$OPENCLAW_GATEWAY_CONFIG_FILE" \
  TRIAL_OPENCLAW_PROVIDER_ID="$OPENCLAW_PROVIDER_ID" \
  TRIAL_LLM_MODEL_ID="${TRIAL_LLM_MODEL_ID:-}" \
  TRIAL_LLM_API_URL="${TRIAL_LLM_API_URL:-}" \
  node <<'NODE'
const fs = require('fs')

const configPath = process.env.TRIAL_OPENCLAW_CONFIG_FILE
const providerId = process.env.TRIAL_OPENCLAW_PROVIDER_ID
const modelId = String(process.env.TRIAL_LLM_MODEL_ID || '').trim()
const apiUrl = String(process.env.TRIAL_LLM_API_URL || '').trim()

if (!configPath || !providerId || !modelId || !apiUrl || !fs.existsSync(configPath)) {
  process.exit(1)
}

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const provider = config?.models?.providers?.[providerId]
  const models = Array.isArray(provider?.models) ? provider.models : []
  const hasModel = models.some((item) => item && item.id === modelId)
  const baseUrlMatches = String(provider?.baseUrl || '').trim() === apiUrl
  process.exit(hasModel && baseUrlMatches ? 0 : 1)
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

build_gateway_request_body() {
  REQUEST_FILE="$REQUEST_FILE" TRIAL_OPENCLAW_AGENT_ID="$OPENCLAW_AGENT_ID" node <<'NODE'
const fs = require('fs')

try {
  const request = JSON.parse(fs.readFileSync(process.env.REQUEST_FILE, 'utf8'))
  const message = String(request?.userMessage || request?.message || '').trim()
  if (!message) {
    throw new Error('Request message is empty')
  }

  process.stdout.write(
    JSON.stringify({
      model: `openclaw:${process.env.TRIAL_OPENCLAW_AGENT_ID || 'trial-session'}`,
      input: message,
      stream: true,
    })
  )
} catch (error) {
  console.error(`Failed to build gateway request payload: ${error.message}`)
  process.exit(1)
}
NODE
}

wait_for_gateway_health() {
  attempt=0
  while [ "$attempt" -lt "$OPENCLAW_GATEWAY_STARTUP_TIMEOUT_SECONDS" ]; do
    if gateway_is_healthy; then
      return 0
    fi

    if [ -f "$OPENCLAW_GATEWAY_PID_FILE" ] && ! gateway_process_running; then
      return 1
    fi

    attempt=$((attempt + 1))
    sleep 1
  done

  return 1
}

start_gateway() {
  mkdir -p \
    "$OPENCLAW_GATEWAY_STATE_DIR" \
    "$OPENCLAW_GATEWAY_TMP_DIR" \
    "$(dirname "$OPENCLAW_GATEWAY_CONFIG_FILE")" \
    "$(dirname "$OPENCLAW_GATEWAY_LOG_FILE")"

  if gateway_is_healthy; then
    return 0
  fi

  cp "$OPENCLAW_CONFIG_FILE" "$OPENCLAW_GATEWAY_CONFIG_FILE"

  if [ -f "$OPENCLAW_GATEWAY_PID_FILE" ] && ! gateway_process_running; then
    remove_gateway_pid
  fi

  if gateway_process_running; then
    if wait_for_gateway_health; then
      return 0
    fi
    cleanup_stale_gateway_process
  fi

  export HOME="$OPENCLAW_HOME"
  export TMPDIR="$OPENCLAW_GATEWAY_TMP_DIR"
  export OPENCLAW_STATE_DIR="$OPENCLAW_GATEWAY_STATE_DIR"
  export OPENCLAW_CONFIG_PATH="$OPENCLAW_GATEWAY_CONFIG_FILE"
  export OPENCLAW_SKIP_CHANNELS=1

  nohup "$OPENCLAW_BIN" gateway run \
    --allow-unconfigured \
    --auth none \
    --bind loopback \
    --port "$OPENCLAW_GATEWAY_PORT" \
    --compact >> "$OPENCLAW_GATEWAY_LOG_FILE" 2>&1 </dev/null &
  gateway_pid=$!
  printf '%s\n' "$gateway_pid" > "$OPENCLAW_GATEWAY_PID_FILE"

  if wait_for_gateway_health; then
    return 0
  fi

  cleanup_stale_gateway_process
  return 1
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

function parseSseEvents(raw) {
  return String(raw || '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let event = 'message'
      const dataLines = []

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim() || 'message'
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }

      if (dataLines.length === 0) {
        return null
      }

      const rawPayload = dataLines.join('\n')
      if (rawPayload === '[DONE]') {
        return null
      }

      try {
        return JSON.parse(rawPayload)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function extractResponseTextFromOutput(response) {
  const output = Array.isArray(response?.output) ? response.output : []

  return output
    .map((item) => {
      const content = Array.isArray(item?.content) ? item.content : []
      return content
        .map((part) => {
          if (part?.type === 'output_text' && typeof part.text === 'string') {
            return part.text.trim()
          }

          if (typeof part?.text === 'string') {
            return part.text.trim()
          }

          return ''
        })
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

const rawPath = process.env.RAW_OUTPUT_FILE
const responsePath = process.env.RESPONSE_FILE
const rawOutput = fs.readFileSync(rawPath, 'utf8')
const gatewayEvents = parseSseEvents(rawOutput)
const gatewayCompleted = gatewayEvents.find((event) => event?.type === 'response.completed')
const gatewayFailed = gatewayEvents.find((event) => event?.type === 'response.failed')

if (gatewayEvents.some((event) => String(event?.type || '').startsWith('response.'))) {
  const deltaText = gatewayEvents
    .filter((event) => event?.type === 'response.output_text.delta' && typeof event.delta === 'string')
    .map((event) => event.delta)
    .join('')
  const finalResponse = gatewayCompleted?.response || gatewayFailed?.response || null
  const completedText = extractResponseTextFromOutput(finalResponse)
  const response =
    deltaText.trim() ||
    completedText.trim() ||
    (finalResponse?.error?.message ? String(finalResponse.error.message).trim() : '') ||
    'No response from OpenClaw.'

  fs.writeFileSync(
    responsePath,
    `${JSON.stringify(
      {
        response,
        usage: finalResponse?.usage || null,
        raw: finalResponse || gatewayEvents,
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  process.exit(0)
}

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

run_cli_agent() {
  user_message="$1"
  raw_output_pipe="$2"

  if [ -n "$OPENCLAW_THINKING_LEVEL" ] && [ -n "$OPENCLAW_VERBOSE" ]; then
    "$OPENCLAW_BIN" agent \
      --local \
      --agent "$OPENCLAW_AGENT_ID" \
      --session-id "${SESSION_ID:-trial-session}" \
      --message "$user_message" \
      --json \
      --timeout "$OPENCLAW_TIMEOUT_SECONDS" \
      --thinking "$OPENCLAW_THINKING_LEVEL" \
      --verbose "$OPENCLAW_VERBOSE" \
      > "$raw_output_pipe" 2>&1
    return $?
  fi

  if [ -n "$OPENCLAW_THINKING_LEVEL" ]; then
    "$OPENCLAW_BIN" agent \
      --local \
      --agent "$OPENCLAW_AGENT_ID" \
      --session-id "${SESSION_ID:-trial-session}" \
      --message "$user_message" \
      --json \
      --timeout "$OPENCLAW_TIMEOUT_SECONDS" \
      --thinking "$OPENCLAW_THINKING_LEVEL" \
      > "$raw_output_pipe" 2>&1
    return $?
  fi

  if [ -n "$OPENCLAW_VERBOSE" ]; then
    "$OPENCLAW_BIN" agent \
      --local \
      --agent "$OPENCLAW_AGENT_ID" \
      --session-id "${SESSION_ID:-trial-session}" \
      --message "$user_message" \
      --json \
      --timeout "$OPENCLAW_TIMEOUT_SECONDS" \
      --verbose "$OPENCLAW_VERBOSE" \
      > "$raw_output_pipe" 2>&1
    return $?
  fi

  "$OPENCLAW_BIN" agent \
    --local \
    --agent "$OPENCLAW_AGENT_ID" \
    --session-id "${SESSION_ID:-trial-session}" \
    --message "$user_message" \
    --json \
    --timeout "$OPENCLAW_TIMEOUT_SECONDS" \
    > "$raw_output_pipe" 2>&1
}

run_gateway_stream() {
  raw_output_file="$1"
  raw_output_pipe="$2"
  request_body_file="$OPENCLAW_RUNTIME_DIR/gateway-request.json"
  curl_max_time=$((OPENCLAW_TIMEOUT_SECONDS + 30))

  build_gateway_request_body > "$request_body_file"

  if ! start_gateway; then
    log "$EXEC_LOG_FILE" "openclaw gateway failed to start"
    return 1
  fi

  set +e
  curl -sS -N \
    --max-time "$curl_max_time" \
    -X POST "http://127.0.0.1:$OPENCLAW_GATEWAY_PORT/v1/responses" \
    -H "Content-Type: application/json" \
    -H "x-openclaw-session-key: ${SESSION_ID:-trial-session}" \
    --data-binary "@$request_body_file" \
    > "$raw_output_pipe" 2>>"$EXEC_LOG_FILE"
  curl_exit=$?
  set -e

  if [ "$curl_exit" -eq 0 ]; then
    return 0
  fi

  if ! gateway_is_healthy; then
    cleanup_stale_gateway_process
  fi

  if [ -s "$raw_output_file" ]; then
    log "$EXEC_LOG_FILE" "openclaw gateway stream failed after emitting output"
  else
    log "$EXEC_LOG_FILE" "openclaw gateway stream failed before output"
  fi

  return "$curl_exit"
}

legacy_cli_install() {
  ensure_runtime_dirs
  prepare_runtime_workspace
  run_openclaw_setup
  write_openclaw_config
  ensure_agent_registered
  write_openclaw_config
}

fast_install() {
  ensure_runtime_dirs
  prepare_runtime_workspace
  prepare_openclaw_home
  write_openclaw_config
}

pooled_reuse_install() {
  if \
    is_truthy "$OPENCLAW_PRESERVE_GATEWAY_ON_POOL_REUSE" && \
    gateway_is_healthy && \
    gateway_config_matches_runtime; then
    log "$INSTALL_LOG_FILE" "preserving healthy gateway process for pooled reuse"
  else
    cleanup_stale_gateway_process
  fi
  ensure_runtime_dirs
  prepare_runtime_workspace
  ensure_openclaw_home_dirs
  write_openclaw_config
}

default_install() {
  if is_truthy "$OPENCLAW_POOL_REUSE"; then
    pooled_reuse_install
    return
  fi

  cleanup_stale_gateway_process

  if is_truthy "$OPENCLAW_USE_CLI_INSTALL"; then
    legacy_cli_install
    return
  fi

  fast_install
}

default_prewarm_gateway() {
  ensure_runtime_dirs

  if [ ! -f "$OPENCLAW_CONFIG_FILE" ]; then
    echo "OpenClaw sandbox is not initialized. Run install first." >&2
    exit 1
  fi

  log "$INSTALL_LOG_FILE" "openclaw gateway prewarm starting"
  if start_gateway; then
    log "$INSTALL_LOG_FILE" "openclaw gateway prewarm ready"
    exit 0
  fi

  log "$INSTALL_LOG_FILE" "openclaw gateway prewarm failed"
  exit 1
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
  raw_output_pipe="$OPENCLAW_RUNTIME_DIR/agent-output.pipe"
  rm -f "$raw_output_file" "$raw_output_pipe" "$RESPONSE_FILE"
  mkfifo "$raw_output_pipe"

  tee "$raw_output_file" < "$raw_output_pipe" &
  tee_pid=$!

  log "$EXEC_LOG_FILE" "openclaw agent bootstrap ready"
  log "$EXEC_LOG_FILE" "openclaw gateway stream starting"

  set +e
  run_gateway_stream "$raw_output_file" "$raw_output_pipe"
  agent_exit=$?
  set -e

  if [ "$agent_exit" -ne 0 ] && [ ! -s "$raw_output_file" ]; then
    log "$EXEC_LOG_FILE" "gateway unavailable, falling back to openclaw agent command"
    set +e
    run_cli_agent "$user_message" "$raw_output_pipe"
    agent_exit=$?
    set -e
  fi

  set +e
  wait "$tee_pid"
  tee_exit=$?
  set -e
  rm -f "$raw_output_pipe"

  if [ "$agent_exit" -ne 0 ]; then
    log "$EXEC_LOG_FILE" "openclaw run command failed"
    exit "$agent_exit"
  fi

  if [ "$tee_exit" -ne 0 ]; then
    log "$EXEC_LOG_FILE" "openclaw output tee failed"
    exit "$tee_exit"
  fi

  log "$EXEC_LOG_FILE" "openclaw run command completed"

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
  prewarm-gateway)
    log "$INSTALL_LOG_FILE" "starting prewarm action"
    if [ -n "${TRIAL_SANDBOX_CUSTOM_PREWARM_CMD:-}" ]; then
      sh -lc "$TRIAL_SANDBOX_CUSTOM_PREWARM_CMD"
    else
      default_prewarm_gateway
    fi
    log "$INSTALL_LOG_FILE" "prewarm action completed"
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
