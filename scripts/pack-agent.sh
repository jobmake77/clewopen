#!/bin/bash

# Agent 包打包脚本

AGENT_DIR="$1"

if [ -z "$AGENT_DIR" ]; then
  echo "用法: ./pack-agent.sh <agent-directory>"
  echo "示例: ./pack-agent.sh agent-packages/example-agent"
  exit 1
fi

if [ ! -d "$AGENT_DIR" ]; then
  echo "错误: 目录不存在: $AGENT_DIR"
  exit 1
fi

if [ ! -f "$AGENT_DIR/manifest.json" ]; then
  echo "错误: 未找到 manifest.json"
  exit 1
fi

# 获取 Agent 名称和版本
AGENT_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$AGENT_DIR/manifest.json" | cut -d'"' -f4)
AGENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$AGENT_DIR/manifest.json" | cut -d'"' -f4)

if [ -z "$AGENT_NAME" ] || [ -z "$AGENT_VERSION" ]; then
  echo "错误: 无法从 manifest.json 读取名称或版本"
  exit 1
fi

# 生成文件名（移除空格和特殊字符）
SAFE_NAME=$(echo "$AGENT_NAME" | tr ' ' '-' | tr -cd '[:alnum:]-')
OUTPUT_FILE="${SAFE_NAME}-${AGENT_VERSION}.zip"

echo "正在打包 Agent: $AGENT_NAME v$AGENT_VERSION"
echo "输出文件: $OUTPUT_FILE"

# 打包
cd "$AGENT_DIR" && zip -r "../../$OUTPUT_FILE" . -x "*.DS_Store" "*.git*"

if [ $? -eq 0 ]; then
  echo "✅ 打包成功: $OUTPUT_FILE"
  echo ""
  echo "文件大小: $(du -h "../../$OUTPUT_FILE" | cut -f1)"
  echo ""
  echo "包含文件:"
  unzip -l "../../$OUTPUT_FILE"
else
  echo "❌ 打包失败"
  exit 1
fi
