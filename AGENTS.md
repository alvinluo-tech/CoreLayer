# AGENTS.md

Guidance for AI agents (and contributors) working in this repository.

## Project

**CoreLayer** (codename _Jarvis_) — a local-first desktop Agent OS. Tauri v2 shell + Node daemon sidecar, Hono HTTP, SQLite (drizzle) with optional cloud storage. The daemon lives in `daemon/`, shared packages in `packages/`, the desktop app in `frontend/`.

Key areas: `daemon/src/runtimes/` (agent / coding / tool / memory / scheduler / voice), `daemon/src/capabilities/` + `daemon/src/approvals/` (permission + HITL), `daemon/src/workflow/` (dispatch / slots), `daemon/src/persistence/`.

Run `pnpm typecheck` and `pnpm test` before considering a change done.

---

## Documentation policy

`docs/` is **layered**: some docs are published (tracked in git), the rest are local-only working notes. Decide a doc's tier **before** writing or staging it. The authoritative rules live in `.gitignore` (the `# Docs` section) and `.agents/rules/git-rules.mdc`.

### Published — track and commit these

Durable reference material that helps users and contributors understand the system:

```
docs/ARCHITECTURE.md
docs/DESIGN.md
docs/PRD.md
docs/git-workflow.md
docs/mcp-compatibility-guide.md
docs/architecture/final-*.md              # final-state architecture
docs/architecture/mcp-tool-architecture.md
docs/reviews/**
```

### Local-only — never stage these

Working notes, iteration plans, todos, postmortems, research, and strategy drafts:

```
docs/planning/          docs/superpowers/     docs/bugs/
docs/problems/          docs/audits/          docs/competition/
docs/research/          docs/ideas/           docs/voice-pipeline/
docs/design/
docs/architecture/*todo*.md   *plan*.md   *refactor*.md
docs/architecture/agent-os-*.md   *review*.md   roadmap/   2026-*.md
```

### Rules for agents

- **New doc?** Classify it first. Process / planning / todo / research / postmortem → a local-only path. Durable reference for users → a published path.
- **Do not** `git add` or commit anything under a local-only path.
- **Do not** edit `.gitignore` to publish a working note unless explicitly asked to.
- If you add a **new published path** (a new folder worth tracking), update the `.gitignore` allow-list and the lists above in the same change.

---

## Other local-only directories

Never commit: `.agents/`, `.claude/`, `.codex/`, `.superpowers/`, `.codegraph/`.
