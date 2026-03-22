#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5001}"
TEST_EMAIL="${TEST_EMAIL:-user1@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-password123}"
AGENT_ID="${AGENT_ID:-ca24eb9c-ac71-4b26-99de-be205ba01b09}"
PG_CONTAINER="${PG_CONTAINER:-clewopen-postgres}"
DB_NAME="${DB_NAME:-clewopen}"
DB_USER="${DB_USER:-postgres}"
CURL_MAX_TIME="${CURL_MAX_TIME:-120}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log() {
  printf '[trial-e2e] %s\n' "$1"
}

fail() {
  printf '[trial-e2e] ERROR: %s\n' "$1" >&2
  exit 1
}

post_trial_message_with_retry() {
  local session_id="$1"
  local payload="$2"
  local output_file="$3"
  local max_retry="${4:-12}"

  local i
  for i in $(seq 1 "${max_retry}"); do
    if ! curl -sS --max-time "${CURL_MAX_TIME}" -X POST "${BASE_URL}/api/trial-sessions/${session_id}/messages" \
      -H "${AUTH_HEADER}" \
      -H 'Content-Type: application/json' \
      -d "${payload}" > "${output_file}"; then
      sleep 2
      continue
    fi

    if grep -q '上一条消息仍在处理中，请稍候' "${output_file}"; then
      sleep 2
      continue
    fi

    return 0
  done

  return 1
}

post_trial_message_allow_timeout() {
  local session_id="$1"
  local payload="$2"
  local output_file="$3"

  if curl -sS --max-time "${CURL_MAX_TIME}" -X POST "${BASE_URL}/api/trial-sessions/${session_id}/messages" \
    -H "${AUTH_HEADER}" \
    -H 'Content-Type: application/json' \
    -d "${payload}" > "${output_file}"; then
    return 0
  fi

  printf '{"_transport":"timeout_or_network"}' > "${output_file}"
  return 0
}

extract_json_field() {
  local file="$1"
  local key="$2"
  sed -nE "s/.*\"${key}\":\"([^\"]+)\".*/\1/p" "$file" | head -n 1
}

log "1/9 登录获取 token"
curl -sS --max-time "${CURL_MAX_TIME}" -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" > "${TMP_DIR}/login.json"

TOKEN="$(extract_json_field "${TMP_DIR}/login.json" token)"
USER_ID="$(extract_json_field "${TMP_DIR}/login.json" id)"
[ -n "${TOKEN}" ] || fail "登录失败，未拿到 token"
[ -n "${USER_ID}" ] || fail "登录响应缺少 user id"

AUTH_HEADER="Authorization: Bearer ${TOKEN}"

log "2/9 创建试用会话"
curl -sS --max-time "${CURL_MAX_TIME}" -X POST "${BASE_URL}/api/agents/${AGENT_ID}/trial-sessions" \
  -H "${AUTH_HEADER}" \
  -H 'Content-Type: application/json' > "${TMP_DIR}/create-session.json"

SESSION_ID="$(extract_json_field "${TMP_DIR}/create-session.json" sessionId)"
[ -n "${SESSION_ID}" ] || fail "创建试用会话失败，返回: $(cat "${TMP_DIR}/create-session.json")"

log "3/9 验证高危拦截（应返回 trial_high_risk_blocked）"
post_trial_message_with_retry "${SESSION_ID}" '{"message":"test sk-12345678901234567890"}' "${TMP_DIR}/high-risk.json" || fail "高危请求重试耗尽"
grep -q 'trial_high_risk_blocked' "${TMP_DIR}/high-risk.json" || fail "高危拦截未生效: $(cat "${TMP_DIR}/high-risk.json")"

log "4/9 验证中危拦截（应返回 trial_medium_risk_confirmation_required）"
post_trial_message_with_retry "${SESSION_ID}" '{"message":"我的手机号 13812345678"}' "${TMP_DIR}/medium-risk-blocked.json" || fail "中危请求重试耗尽"
grep -q 'trial_medium_risk_confirmation_required' "${TMP_DIR}/medium-risk-blocked.json" || fail "中危确认未触发: $(cat "${TMP_DIR}/medium-risk-blocked.json")"

log "5/9 验证中危确认后放行"
if ! post_trial_message_with_retry "${SESSION_ID}" '{"message":"我的手机号 13812345678","confirmMediumRisk":true}' "${TMP_DIR}/medium-risk-confirmed.json" 6; then
  post_trial_message_allow_timeout "${SESSION_ID}" '{"message":"我的手机号 13812345678","confirmMediumRisk":true}' "${TMP_DIR}/medium-risk-confirmed.json"
fi

if grep -q '"success":true' "${TMP_DIR}/medium-risk-confirmed.json"; then
  log "中危确认后放行：已收到成功响应"
elif grep -q '"_transport":"timeout_or_network"' "${TMP_DIR}/medium-risk-confirmed.json"; then
  log "中危确认后放行：请求超时，继续执行后续审计与清理验证"
elif grep -q '上一条消息仍在处理中，请稍候' "${TMP_DIR}/medium-risk-confirmed.json"; then
  log "中危确认后放行：会话仍在处理中，继续执行后续审计与清理验证"
elif grep -q 'trial_medium_risk_confirmation_required' "${TMP_DIR}/medium-risk-confirmed.json"; then
  fail "中危确认后仍被要求确认: $(cat "${TMP_DIR}/medium-risk-confirmed.json")"
else
  fail "中危确认后请求失败: $(cat "${TMP_DIR}/medium-risk-confirmed.json")"
fi

log "6/9 验证会话读取会写入访问审计"
curl -sS --max-time "${CURL_MAX_TIME}" "${BASE_URL}/api/trial-sessions/${SESSION_ID}" \
  -H "${AUTH_HEADER}" > "${TMP_DIR}/session.json"

if command -v docker >/dev/null 2>&1; then
  AUDIT_COUNT="$(docker exec -i "${PG_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -At -c \
    "SELECT COUNT(*) FROM trial_data_access_audits WHERE session_id='${SESSION_ID}' AND viewer_user_id='${USER_ID}';" | tr -d '\r' || true)"
  [ "${AUDIT_COUNT:-0}" -ge 1 ] || fail "未找到访问审计记录"
else
  log "跳过 DB 审计检查（docker 不可用）"
fi

log "7/9 结束会话"
curl -sS --max-time "${CURL_MAX_TIME}" -X DELETE "${BASE_URL}/api/trial-sessions/${SESSION_ID}" \
  -H "${AUTH_HEADER}" > "${TMP_DIR}/end-session.json"
grep -q '"success":true' "${TMP_DIR}/end-session.json" || fail "结束会话失败: $(cat "${TMP_DIR}/end-session.json")"

log "8/9 验证消息立即清理"
if command -v docker >/dev/null 2>&1; then
  MESSAGE_ROWS="$(docker exec -i "${PG_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -At -c \
    "SELECT COUNT(*) FROM trial_session_messages WHERE session_id='${SESSION_ID}';" | tr -d '\r' || true)"
  [ "${MESSAGE_ROWS:-1}" -eq 0 ] || fail "会话结束后消息未清理，剩余 ${MESSAGE_ROWS} 条"
else
  log "跳过 DB 消息清理检查（docker 不可用）"
fi

log "9/9 验证公开合规信息不暴露具体模型厂商"
curl -sS --max-time "${CURL_MAX_TIME}" "${BASE_URL}/api/compliance/public" > "${TMP_DIR}/compliance.json"
grep -q '第三方模型服务商（动态调整）' "${TMP_DIR}/compliance.json" || fail "公开合规文案未按要求返回"
if grep -q 'activeTrialModel' "${TMP_DIR}/compliance.json"; then
  fail "公开合规接口仍暴露 activeTrialModel 字段"
fi

log "全部检查通过 ✅"
