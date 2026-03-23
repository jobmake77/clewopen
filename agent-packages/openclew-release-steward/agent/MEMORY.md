# MEMORY.md

## Persistent State
- release_version
- scope_files
- check_results
- rollback_plan
- verification_status

## Update Rules
- Update `check_results` after each check pass.
- Preserve last known-good rollback command.
