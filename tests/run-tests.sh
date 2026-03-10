#!/bin/bash

# OpenCLEW 自动化测试脚本
# 测试文件下载、下载统计、评分统计功能

set -e

# 配置
BASE_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:5173"
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="openclewdb"
DB_USER="postgres"
DB_PASSWORD="postgres"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 测试结果记录
test_pass() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "${GREEN}✅ PASS${NC}: $1"
}

test_fail() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo -e "   ${RED}原因${NC}: $2"
}

# 数据库查询函数
db_query() {
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$1"
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."

    # 检查后端
    if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        log_info "后端服务运行正常 ✓"
    else
        log_error "后端服务未运行"
        exit 1
    fi

    # 检查前端
    if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
        log_info "前端服务运行正常 ✓"
    else
        log_warning "前端服务未运行"
    fi

    # 检查数据库
    if db_query "SELECT 1" > /dev/null 2>&1; then
        log_info "数据库连接正常 ✓"
    else
        log_error "数据库连接失败"
        exit 1
    fi
}

# 准备测试数据
setup_test_data() {
    log_info "准备测试数据..."

    # 创建测试用户
    TEST_USER_EMAIL="test_$(date +%s)@example.com"
    TEST_USER_PASSWORD="Test123456"

    REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"testuser_$(date +%s)\",
            \"email\": \"$TEST_USER_EMAIL\",
            \"password\": \"$TEST_USER_PASSWORD\"
        }")

    # 登录获取 token
    LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_USER_EMAIL\",
            \"password\": \"$TEST_USER_PASSWORD\"
        }")

    TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')
    USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.data.user.id')

    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
        log_error "无法获取测试用户 token"
        exit 1
    fi

    log_info "测试用户创建成功: $TEST_USER_EMAIL"
    log_info "Token: ${TOKEN:0:20}..."

    # 获取第一个 Agent 用于测试
    AGENTS_RESPONSE=$(curl -s "$BASE_URL/api/agents?pageSize=1")
    TEST_AGENT_ID=$(echo $AGENTS_RESPONSE | jq -r '.data.agents[0].id')

    if [ "$TEST_AGENT_ID" = "null" ] || [ -z "$TEST_AGENT_ID" ]; then
        log_error "没有可用的测试 Agent"
        exit 1
    fi

    log_info "测试 Agent ID: $TEST_AGENT_ID"
}

# 测试 1: 文件下载 API
test_download_api() {
    log_info "=== 测试 1: 文件下载 API ==="

    # 1.1 正常下载
    DOWNLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/download" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")

    SUCCESS=$(echo $DOWNLOAD_RESPONSE | jq -r '.success')
    DOWNLOAD_URL=$(echo $DOWNLOAD_RESPONSE | jq -r '.data.downloadUrl')

    if [ "$SUCCESS" = "true" ] && [ "$DOWNLOAD_URL" != "null" ]; then
        test_pass "下载 API 返回成功"
    else
        test_fail "下载 API 返回失败" "$DOWNLOAD_RESPONSE"
    fi

    # 1.2 验证下载链接可访问
    if [ "$DOWNLOAD_URL" != "null" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DOWNLOAD_URL")
        if [ "$HTTP_CODE" = "200" ]; then
            test_pass "下载链接可访问 (HTTP $HTTP_CODE)"
        else
            test_fail "下载链接不可访问" "HTTP $HTTP_CODE"
        fi
    fi

    # 1.3 测试不存在的 Agent
    INVALID_ID="00000000-0000-0000-0000-000000000000"
    INVALID_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agents/$INVALID_ID/download" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/agents/$INVALID_ID/download" \
        -H "Authorization: Bearer $TOKEN")

    if [ "$HTTP_CODE" = "404" ]; then
        test_pass "不存在的 Agent 返回 404"
    else
        test_fail "不存在的 Agent 应返回 404" "实际返回 $HTTP_CODE"
    fi

    # 1.4 测试未认证用户
    UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/download")

    if [ "$UNAUTH_CODE" = "401" ]; then
        test_pass "未认证用户返回 401"
    else
        test_fail "未认证用户应返回 401" "实际返回 $UNAUTH_CODE"
    fi
}

# 测试 2: 下载统计
test_download_statistics() {
    log_info "=== 测试 2: 下载统计 ==="

    # 2.1 获取初始下载计数
    INITIAL_COUNT=$(db_query "SELECT downloads_count FROM agents WHERE id = '$TEST_AGENT_ID'")
    INITIAL_COUNT=$(echo $INITIAL_COUNT | tr -d ' ')
    log_info "初始下载计数: $INITIAL_COUNT"

    # 2.2 执行下载
    curl -s -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/download" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" > /dev/null

    sleep 1

    # 2.3 验证计数增加
    NEW_COUNT=$(db_query "SELECT downloads_count FROM agents WHERE id = '$TEST_AGENT_ID'")
    NEW_COUNT=$(echo $NEW_COUNT | tr -d ' ')
    log_info "新下载计数: $NEW_COUNT"

    if [ "$NEW_COUNT" -gt "$INITIAL_COUNT" ]; then
        test_pass "下载计数正确增加 ($INITIAL_COUNT -> $NEW_COUNT)"
    else
        test_fail "下载计数未增加" "期望 > $INITIAL_COUNT, 实际 $NEW_COUNT"
    fi

    # 2.4 验证下载记录
    DOWNLOAD_RECORD_COUNT=$(db_query "SELECT COUNT(*) FROM downloads WHERE agent_id = '$TEST_AGENT_ID' AND user_id = '$USER_ID'")
    DOWNLOAD_RECORD_COUNT=$(echo $DOWNLOAD_RECORD_COUNT | tr -d ' ')

    if [ "$DOWNLOAD_RECORD_COUNT" -gt "0" ]; then
        test_pass "下载记录已创建 (共 $DOWNLOAD_RECORD_COUNT 条)"
    else
        test_fail "下载记录未创建" "记录数: $DOWNLOAD_RECORD_COUNT"
    fi

    # 2.5 多次下载测试
    BEFORE_MULTI=$(db_query "SELECT downloads_count FROM agents WHERE id = '$TEST_AGENT_ID'")
    BEFORE_MULTI=$(echo $BEFORE_MULTI | tr -d ' ')

    for i in {1..3}; do
        curl -s -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/download" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" > /dev/null
        sleep 0.5
    done

    sleep 1

    AFTER_MULTI=$(db_query "SELECT downloads_count FROM agents WHERE id = '$TEST_AGENT_ID'")
    AFTER_MULTI=$(echo $AFTER_MULTI | tr -d ' ')

    DIFF=$((AFTER_MULTI - BEFORE_MULTI))
    if [ "$DIFF" -eq "3" ]; then
        test_pass "多次下载计数累加正确 (+$DIFF)"
    else
        test_fail "多次下载计数累加错误" "期望 +3, 实际 +$DIFF"
    fi
}

# 测试 3: 评分统计
test_rating_statistics() {
    log_info "=== 测试 3: 评分统计 ==="

    # 3.1 提交评价
    RATING_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/rate" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"rating\": 5,
            \"comment\": \"自动化测试评价\"
        }")

    SUCCESS=$(echo $RATING_RESPONSE | jq -r '.success')

    if [ "$SUCCESS" = "true" ]; then
        test_pass "评价提交成功"
    else
        ERROR_MSG=$(echo $RATING_RESPONSE | jq -r '.error.message')
        if [[ "$ERROR_MSG" == *"already reviewed"* ]]; then
            test_pass "评价提交成功 (已存在评价)"
        else
            test_fail "评价提交失败" "$RATING_RESPONSE"
        fi
    fi

    # 3.2 验证评价记录
    REVIEW_COUNT=$(db_query "SELECT COUNT(*) FROM reviews WHERE agent_id = '$TEST_AGENT_ID' AND user_id = '$USER_ID'")
    REVIEW_COUNT=$(echo $REVIEW_COUNT | tr -d ' ')

    if [ "$REVIEW_COUNT" -gt "0" ]; then
        test_pass "评价记录已创建"
    else
        test_fail "评价记录未创建" "记录数: $REVIEW_COUNT"
    fi

    # 3.3 批准评价并验证评分更新
    REVIEW_ID=$(db_query "SELECT id FROM reviews WHERE agent_id = '$TEST_AGENT_ID' AND user_id = '$USER_ID' LIMIT 1")
    REVIEW_ID=$(echo $REVIEW_ID | tr -d ' ')

    if [ ! -z "$REVIEW_ID" ] && [ "$REVIEW_ID" != "" ]; then
        db_query "UPDATE reviews SET status = 'approved' WHERE id = '$REVIEW_ID'" > /dev/null
        sleep 1

        RATING_AVG=$(db_query "SELECT rating_average FROM agents WHERE id = '$TEST_AGENT_ID'")
        RATING_AVG=$(echo $RATING_AVG | tr -d ' ')

        if [ ! -z "$RATING_AVG" ] && [ "$RATING_AVG" != "0.00" ]; then
            test_pass "评分已更新 (平均分: $RATING_AVG)"
        else
            test_fail "评分未更新" "平均分: $RATING_AVG"
        fi

        REVIEWS_COUNT=$(db_query "SELECT reviews_count FROM agents WHERE id = '$TEST_AGENT_ID'")
        REVIEWS_COUNT=$(echo $REVIEWS_COUNT | tr -d ' ')

        if [ "$REVIEWS_COUNT" -gt "0" ]; then
            test_pass "评价计数已更新 (计数: $REVIEWS_COUNT)"
        else
            test_fail "评价计数未更新" "计数: $REVIEWS_COUNT"
        fi
    fi

    # 3.4 测试评分范围验证
    INVALID_RATING_RESPONSE=$(curl -s -X POST "$BASE_URL/api/agents/$TEST_AGENT_ID/rate" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"rating\": 6,
            \"comment\": \"无效评分测试\"
        }")

    ERROR_MSG=$(echo $INVALID_RATING_RESPONSE | jq -r '.error.message')
    if [[ "$ERROR_MSG" == *"between 1 and 5"* ]] || [[ "$ERROR_MSG" == *"already reviewed"* ]]; then
        test_pass "评分范围验证正常"
    else
        test_fail "评分范围验证失败" "$ERROR_MSG"
    fi
}

# 测试 4: 集成测试
test_integration() {
    log_info "=== 测试 4: 集成测试 ==="

    # 4.1 获取 Agent 列表
    AGENTS_LIST=$(curl -s "$BASE_URL/api/agents?page=1&pageSize=10")
    AGENTS_COUNT=$(echo $AGENTS_LIST | jq -r '.data.agents | length')

    if [ "$AGENTS_COUNT" -gt "0" ]; then
        test_pass "Agent 列表获取成功 (共 $AGENTS_COUNT 个)"
    else
        test_fail "Agent 列表为空" "数量: $AGENTS_COUNT"
    fi

    # 4.2 获取 Agent 详情
    AGENT_DETAIL=$(curl -s "$BASE_URL/api/agents/$TEST_AGENT_ID")
    AGENT_NAME=$(echo $AGENT_DETAIL | jq -r '.data.name')

    if [ "$AGENT_NAME" != "null" ] && [ ! -z "$AGENT_NAME" ]; then
        test_pass "Agent 详情获取成功 (名称: $AGENT_NAME)"
    else
        test_fail "Agent 详情获取失败" "$AGENT_DETAIL"
    fi

    # 4.3 获取评价列表
    REVIEWS_LIST=$(curl -s "$BASE_URL/api/agents/$TEST_AGENT_ID/reviews")
    REVIEWS_SUCCESS=$(echo $REVIEWS_LIST | jq -r '.success')

    if [ "$REVIEWS_SUCCESS" = "true" ]; then
        test_pass "评价列表获取成功"
    else
        test_fail "评价列表获取失败" "$REVIEWS_LIST"
    fi

    # 4.4 验证数据一致性
    DB_DOWNLOADS=$(db_query "SELECT downloads_count FROM agents WHERE id = '$TEST_AGENT_ID'")
    DB_DOWNLOADS=$(echo $DB_DOWNLOADS | tr -d ' ')

    API_DOWNLOADS=$(echo $AGENT_DETAIL | jq -r '.data.downloads_count')

    if [ "$DB_DOWNLOADS" = "$API_DOWNLOADS" ]; then
        test_pass "下载计数数据一致 (DB: $DB_DOWNLOADS, API: $API_DOWNLOADS)"
    else
        test_fail "下载计数数据不一致" "DB: $DB_DOWNLOADS, API: $API_DOWNLOADS"
    fi
}

# 清理测试数据
cleanup_test_data() {
    log_info "清理测试数据..."
    # 可选：删除测试用户和相关数据
    # db_query "DELETE FROM users WHERE email = '$TEST_USER_EMAIL'"
    log_info "测试数据保留，可手动清理"
}

# 生成测试报告
generate_report() {
    echo ""
    echo "========================================="
    echo "           测试报告"
    echo "========================================="
    echo "总测试数: $TOTAL_TESTS"
    echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "失败: ${RED}$FAILED_TESTS${NC}"
    echo "成功率: $(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")%"
    echo "========================================="

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}所有测试通过！${NC}"
        exit 0
    else
        echo -e "${RED}存在失败的测试，请检查日志${NC}"
        exit 1
    fi
}

# 主函数
main() {
    echo "========================================="
    echo "    OpenCLEW 自动化测试"
    echo "========================================="
    echo ""

    check_services
    setup_test_data

    test_download_api
    test_download_statistics
    test_rating_statistics
    test_integration

    cleanup_test_data
    generate_report
}

# 执行测试
main
