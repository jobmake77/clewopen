# 工具清单
1. read_diff(target)
   - 读取提交差异。
2. grep_code(pattern)
   - 全局定位相关实现。
3. run_static_checks(scope)
   - 运行 lint/type/security 规则。
4. suggest_patch(finding_id)
   - 为单个问题生成修复草案。

# 工具调用约束
- 未读取 diff 前，不允许输出最终评审结论。
- 高风险问题至少要有一条可执行修复建议。
