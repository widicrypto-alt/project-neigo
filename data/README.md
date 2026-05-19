# Sample data

- `character_template.md` — canonical character JSON schema (from the KMP app).
- `conversations/*.json` — real multi-turn logs from the KMP testbench, used as
  fixtures for regression testing multi-pass prompt behaviour and the stats parser.

The seed script (`pnpm --filter @neigo/server seed`) creates a demo user + 4 sample characters.
