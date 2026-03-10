#!/bin/bash

# 快速测试脚本 - 验证基本功能是否正常

BASE_URL="http://localhost:3001"

echo "🔍 OpenCLEW 快速健康检查"
echo "================================"

# 1. 检查后端服务
echo -n "后端服务: "
if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "✅ 运行中"
else
    echo "❌ 未运行"
    exit 1
fi

# 2. 检查 Agent 列表 API
echo -n "Agent 列表 API: "
AGENTS_RESPONSE=$(curl -s "$BASE_URL/api/agents?pageSize=1")
if echo "$AGENTS_RESPONSE" | grep -q '"success":true'; then
    echo "✅ 正常"
else
    echo "❌ 异常"
fi

# 3. 检查数据库连接
echo -n "数据库连接: "
if PGPASSWORD=postgres psql -h localhost -U postgres -d openclewdb -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ 正常"
else
    echo "❌ 异常"
fi

# 4. 统计数据
echo ""
echo "📊 数据统计:"
PGPASSWORD=postgres psql -h localhost -U postgres -d openclewdb -t -c "
SELECT
    'Agents: ' || COUNT(*) FROM agents WHERE deleted_at IS NULL
UNION ALL
SELECT
    'Users: ' || COUNT(*) FROM users WHERE deleted_at IS NULL
UNION ALL
SELECT
    'Downloads: ' || COUNT(*) FROM downloads
UNION ALL
SELECT
    'Reviews: ' || COUNT(*) FROM reviews WHERE deleted_at IS NULL;
" 2>/dev/null || echo "无法获取统计数据"

echo ""
echo "================================"
echo "✅ 快速检查完成"
