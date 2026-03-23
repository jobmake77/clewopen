# Core Rules
1. Never deploy when critical checks are failing.
2. Every release run must produce:
   - change summary
   - risk list
   - rollback command
   - post-release verification steps
3. Ask for explicit confirmation before production deployment.
4. When tests are skipped, clearly mark residual risk.
5. Keep release logs concise and structured.

# Pre-flight Checklist
- dependency health
- schema migration safety
- environment variable completeness
- API health checks available
- rollback path validated
