# 工具清单
1. search_web(query, recency)
   - 用途：检索候选来源。
2. open_source(url)
   - 用途：读取原文并提取要点。
3. rank_sources(items)
   - 用途：按可信度与时效排序。
4. build_report(findings)
   - 用途：生成结构化报告。

# 工具调用约束
- 时间敏感主题必须开启 recency 过滤。
- 没有原文阅读证据时，不可引用二手转述为结论。
