# AGENTS.md

Project rules for coding agents (Codex, Claude Code and others). `CLAUDE.md`
imports this file; keep both aligned by editing only this one.

## What this is

German finance-operations PoC: XRechnung intake → technical validation →
business validation → deterministic routing → human approval → accounting
handoff → payment status → reconciliation → KPIs. Demo company Nordwerk GmbH,
synthetic data only. Read `README.md` first, then `docs/ARCHITECTURE.md` and
`docs/DECISIONS.md`. Do not reopen a decision recorded in `docs/DECISIONS.md`
without adding a new ADR that supersedes it.

## Commands

```bash
npm install
cp .env.example .env
npm run db:migrate        # applies db/migrations/* to DATABASE_URL
npm run db:seed           # synthetic master data
npm run dev               # API (4400) + Vite (5400)
npm test                  # node --test; DB tests use TEST_DATABASE_URL
npm run test:browser      # the browser suite alone; skips without chromium
npm run build && npm start   # production: one process, API + built client
printf '%s' "$PW" | npm run user:password -- <email>   # replace a demo password
npx playwright install chromium   # once, to stop the browser tests skipping
```

## Rules that hold everything together

- `invoices.state` changes only through `transition()` in
  `server/domain/workflow/transitions.js`. Never `UPDATE invoices SET state` anywhere else.
- Business rules live in `server/domain/`. Routes are thin. No rule inside n8n,
  the client, or SQL triggers.
- Schema changes are new files in `db/migrations/`; never edit an applied one.
- Every check returns a structured `CheckResult`
  (`check, status, severity, expected, actual, reason, recommended_action`).
- Fail closed: missing, malformed or uncertain data routes to review, never to
  approval.
- Intake facts (`received_at`, `source_channel`, `file_sha256`, `file_path`) are
  never derived from document content and never updated.
- German is the product's language: the server, the database and every stored
  string are German. Identifiers and docs are English. The client can also
  display English, from the codes the API sends; add new UI text to both
  dictionaries in `client/src/lib/dictionaries.js`, never inline in a
  component (ADR-034). No emojis anywhere.
- No secrets in the repository. `.env.example` holds placeholders only.
- Wording: see ADR-008. Never claim EN 16931, GoBD or GDPR compliance.
- Tests: add or update a row in `docs/TEST_MATRIX.md` for every behaviour you
  add. Mark it AUTO only if `npm test` runs it.
- Keep functions and files short. Comments only where the why is not obvious.
- Work incrementally: one small change, run `npm test`, then the next.
