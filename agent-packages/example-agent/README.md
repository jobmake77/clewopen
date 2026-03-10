# Python 代码审查助手

一个专业的 Python 代码质量审查工具，帮助开发者提升代码质量。

## 功能特性

- ✅ PEP 8 代码风格检查
- ✅ 代码复杂度分析
- ✅ 潜在 bug 检测
- ✅ 性能优化建议
- ✅ 安全漏洞扫描
- ✅ 最佳实践建议

## 使用方法

1. 上传 Python 代码文件或粘贴代码片段
2. Agent 自动进行全面分析
3. 获取详细的审查报告
4. 根据建议优化代码

## 审查示例

**输入**:
```python
def calc(x,y):
    return x+y
```

**输出**:
```
问题 1: 函数命名不清晰
- 严重程度: 中
- 位置: 第 1 行
- 建议: 使用更具描述性的函数名，如 calculate_sum
- 修复示例:
  def calculate_sum(x, y):
      return x + y

问题 2: 缺少类型提示
- 严重程度: 低
- 位置: 第 1 行
- 建议: 添加类型提示提高代码可读性
- 修复示例:
  def calculate_sum(x: int, y: int) -> int:
      return x + y

问题 3: 缺少文档字符串
- 严重程度: 中
- 位置: 第 1 行
- 建议: 添加 docstring 说明函数用途
```

## 依赖工具

- pylint: 代码质量检查
- flake8: 代码风格检查
- black: 代码格式化
- mypy: 类型检查

## 许可证

MIT License

## 作者

OpenCLEW Team
