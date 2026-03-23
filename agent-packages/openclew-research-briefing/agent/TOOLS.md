# TOOLS.md

1. search(query, recency_days)
2. open(url)
3. extract_claims(text)
4. compare_sources(claims)
5. write_brief(structured_findings)

Constraints:
- `write_brief` only after `compare_sources` is completed.
- Always include source URL and date for each key claim.
