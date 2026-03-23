# 研究记忆字段
- objective
- scope
- constraints
- source_log
- contradictions
- confidence_map

# 更新策略
- 每次新增来源都写入 source_log（含访问时间）。
- 矛盾信息写入 contradictions，避免被后续覆盖。
