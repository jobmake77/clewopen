# 会话记忆字段
- user_id
- order_id
- intent
- severity
- sentiment
- actions_taken
- promised_sla
- escalation_status

# 更新策略
- 每次动作后追加 actions_taken。
- SLA 发生变化时覆盖 promised_sla，并记录变更原因。
