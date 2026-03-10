#!/bin/bash

# manifest.json 验证测试脚本

echo "=== manifest.json 验证功能测试 ==="
echo ""

# 检查是否有测试包
if [ ! -f "Python-代码审查助手-1.0.0.zip" ]; then
  echo "未找到测试包，正在创建..."
  bash scripts/pack-agent.sh agent-packages/example-agent
  echo ""
fi

# 1. 启动后端服务（如果未运行）
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
  echo "后端服务未运行，请先启动:"
  echo "  cd backend && npm run dev"
  exit 1
fi

echo "✅ 后端服务运行中"
echo ""

# 2. 登录获取 Token
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

# 3. 上传 Agent 包（带 manifest 验证）
echo "2. 上传 Agent 包（自动验证 manifest.json）..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:5000/api/agents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "package=@Python-代码审查助手-1.0.0.zip" \
  -F "name=Python 代码审查助手" \
  -F "description=自动审查 Python 代码质量" \
  -F "category=development" \
  -F "version=1.0.0")

echo "$UPLOAD_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_RESPONSE"
echo ""

# 检查是否成功
if echo "$UPLOAD_RESPONSE" | grep -q '"success":true'; then
  echo "✅ 上传成功，manifest.json 验证通过"

  # 提取 manifest 信息
  echo ""
  echo "=== Manifest 信息 ==="
  echo "$UPLOAD_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'validation' in data and 'manifest' in data['validation']:
        manifest = data['validation']['manifest']
        print(f\"名称: {manifest.get('name')}\")
        print(f\"版本: {manifest.get('version')}\")
        print(f\"作者: {manifest.get('author')}\")
        print(f\"分类: {manifest.get('category')}\")
        print(f\"标签: {', '.join(manifest.get('tags', []))}\")
        print(f\"权限: {list(manifest.get('permissions', {}).keys())}\")
        print(f\"依赖: {list(manifest.get('dependencies', {}).keys())}\")
except:
    pass
" 2>/dev/null
else
  echo "❌ 上传失败"
  if echo "$UPLOAD_RESPONSE" | grep -q 'details'; then
    echo ""
    echo "验证错误:"
    echo "$UPLOAD_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'details' in data:
        for error in data['details']:
            print(f\"  - {error}\")
except:
    pass
" 2>/dev/null
  fi
fi

echo ""
echo "=== 测试完成 ==="
