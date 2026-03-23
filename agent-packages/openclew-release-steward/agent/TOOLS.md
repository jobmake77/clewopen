# TOOLS.md

1. run_checks(profile)
2. summarize_changes(diff_range)
3. prepare_rollback(version)
4. deploy(target_env)
5. verify_health(endpoints)

Constraints:
- `deploy` is blocked until `run_checks` returns pass.
- `verify_health` must run after every deploy.
