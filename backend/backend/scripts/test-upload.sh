#!/bin/bash

# Agent 上传功能测试脚本

echo "=== Agent 上传功能测试 ==="
echo ""

# 1. 登录获取 Token
echo "1. 登录开发者账号..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev1@example.com",
    "password": "password123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo $LOGIN_RESPONSE
  exit 1
fi

echo "✅ 登录成功"
echo ""

# 2. 创建测试 zip 文件
echo "2. 创建测试 Agent 包..."
mkdir -p /tmp/test-agent
echo '{"name": "Test Agent", "version": "1.0.0"}' > /tmp/test-agent/manifest.json
cd /tmp && zip -q test-agent.zip test-agent/manifest.json
echo "✅ 测试包创建成功"
echo ""

# 3. 上传 Agent
echo "3. 上传 Agent..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:5000/api/agents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "package=@/tmp/test-agent.zip" \
  -F "name=测试 Agent" \
  -F "description=这是一个测试 Agent" \
  -F "category=development" \
  -F "version=1.0.0" \
  -F 'price={"type":"free","amount":0}' \
  -F 'tags=["test","demo"]')

echo $UPLOAD_RESPONSE
echo ""

# 4. 清理
rm -rf /tmp/test-agent /tmp/test-agent.zip

echo "=== 测试完成 ==="
