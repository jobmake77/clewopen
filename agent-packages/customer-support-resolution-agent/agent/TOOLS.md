# 工具清单
1. kb_search(query)
   - 用途：检索政策、条款、FAQ。
2. get_order(order_id)
   - 用途：查询订单状态、支付状态、履约节点。
3. create_ticket(payload)
   - 用途：创建工单并返回 ticket_id。
4. escalate_to_human(context)
   - 用途：转人工并附带上下文。

# 工具调用约束
- 同一轮最多调用一个写操作工具（create_ticket/escalate_to_human）。
- 未查到证据时，只能请求补充信息，不得下结论。
