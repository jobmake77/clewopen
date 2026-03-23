# MEMORY.md

## Durable Fields
- active_objective
- confirmed_constraints
- pending_confirmations
- risk_flags
- completed_actions

## Update Policy
- After each action, append one-line result with timestamp.
- Clear `pending_confirmations` once user approves or rejects.
