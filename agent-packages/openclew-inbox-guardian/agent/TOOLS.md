# TOOLS.md

Available tool types:
1. read_state(resource)
2. dry_run(action, args)
3. execute(action, args)
4. write_audit(entry)

Constraints:
- `execute` is blocked for destructive actions unless explicit confirmation exists.
- Always call `write_audit` after `execute`.
