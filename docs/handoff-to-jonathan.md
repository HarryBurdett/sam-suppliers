# Handoff — sam-suppliers Reproduction Spec

**From:** Harry
**For:** Jonathan
**Repo:** https://github.com/HarryBurdett/sam-suppliers
**Spec location:** [docs/spec/](https://github.com/HarryBurdett/sam-suppliers/tree/main/docs/spec)
**Date:** 2026-06-10

---

## What this is

We've written a detailed reproduction spec for the **supplier
management** SAM plugin — 14 cross-referenced markdown documents
(~3,400 lines) under [`docs/spec/`](https://github.com/HarryBurdett/sam-suppliers/tree/main/docs/spec)
that describe the app in enough detail to rebuild from scratch.

The spec is at v1.0.0 of the implementation. The current code already
works (214/214 tests pass, packages cleanly as a `.sap`, structurally
SAM-compatible at the same level as bank-rec v1.2.6+).

## What we'd like from you

Pick one — they're three different asks:

### Option A — Validation read
Read the spec end-to-end, treat it as a "could I rebuild from this?"
exercise. Flag where the spec is too thin (where you'd need to look at
source) or wrong. **~half a day**, no code changes.

### Option B — Clean-room rewrite
Build a fresh implementation from the spec, treating the existing
source as off-limits (or only-look-when-spec-is-incomplete). Useful if
we want a second-source implementation or want to port to a different
stack. **2–3 weeks** for one engineer. The spec includes a step-by-step
reproduction checklist at [`docs/spec/00-reproduction-checklist.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/spec/00-reproduction-checklist.md).

### Option C — AI agent assisted rebuild
Feed the spec to Claude Code (or equivalent) section-by-section and
have it generate the implementation. Spec is structured for this — each
section is small, has clear contracts, and references cross-section
dependencies explicitly. **1–2 weeks** of agent time + your review.

If you're up for any of these, my preference order is **A → C → B**.
Option A validates the spec before committing larger work; C is the
high-leverage build; B is the fully clean-room version.

---

## Where to start (whichever option)

1. **Read [`docs/spec/README.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/spec/README.md)**
   — index + table of contents. 87 lines, 5 minutes.

2. **Read [`docs/spec/01-overview.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/spec/01-overview.md)**
   — domain model + statement lifecycle. This is the "what does the
   app do" doc. 200 lines.

3. **Skim [`docs/spec/00-reproduction-checklist.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/spec/00-reproduction-checklist.md)**
   — ordered build steps with section pointers.

After that, the spec sections are designed to be read in order (01 →
12) or as a reference (pull individual sections when you need them).

---

## Spec contents

| Section | Lines | When to read |
|---|---|---|
| `README.md` | 87 | Entry point |
| `00-reproduction-checklist.md` | 225 | Build order |
| `01-overview.md` | 200 | Domain & lifecycle |
| `02-architecture.md` | 211 | SAM v1/v2 dual export, run modes |
| `03-manifest.md` | 135 | `manifest.json` field-by-field |
| `04-data-model.md` | 296 | Every table, every column |
| `05-settings.md` | 169 | 30 settings keys + email templates |
| `06-services.md` | 275 | 25 services, signatures, patterns |
| `07-api-endpoints.md` | 373 | All 106 routes |
| `08-frontend.md` | 314 | 11 pages, shims, build config |
| `09-standalone-runtime.md` | 322 | Multi-company host, adapters |
| `10-build-and-package.md` | 262 | tsc + Vite + .sap pipeline |
| `11-external-services.md` | 268 | Every `ctx.*` field |
| `12-testing.md` | 250 | Mock pattern, 214 tests inventory |

**Total: ~3,400 lines of dense reference material.**

---

## What the spec is — and isn't

**Is:**
- Descriptive contracts (endpoints, tables, signatures, lifecycle)
- Build order and verification steps
- Honest about audit-flagged behaviour (we documented known issues
  rather than hiding them)

**Isn't:**
- Line-by-line source. The spec captures **behaviour**, not literal
  TypeScript. An implementer's services will look similar but won't
  be character-identical.
- A user manual. There's no operator guide yet (one of the items
  we've discussed; let me know if needed).
- A test plan beyond what's in `12-testing.md`.

### Where the spec is thin (peek at source for these)

- Service-internal logic for `statement-actions.ts` (519 LOC) and
  the matching engine in `supplier-queries.ts` (327 LOC) — spec gives
  signatures + lifecycle but not algorithms
- The exact LLM extraction prompt (`EXTRACTION_PROMPT` in
  `misc-endpoints.ts`)
- Tailwind-specific page styling — described by intent, not specific
  visual layout

If you go full clean-room (Option B), expect to need source-peeks for
these. If you go AI-agent (Option C), the agent will ask or hallucinate
— flag the spec gaps so it doesn't.

---

## Verification at each phase

The spec is honest about how to verify each phase is correct:

```sh
npm run lint        # tsc --noEmit — must be clean
npm test            # 214 tests must pass (see 12-testing.md)
npm run build       # tsc + vite, both clean
npm run pack:sap    # produces suppliers-1.0.0.sap
```

Phase-by-phase (per the checklist):

- After migrations: `npx vitest run tests/migrations.test.ts`
- After each service: per-file `*.test.ts` matching the count in
  `12-testing.md`
- After router: smoke test against dev-host (`npm run dev`, curl
  each endpoint)
- After frontend: visual check of each tab
- After packaging: install the `.sap` into SAM and confirm
  `/api/apps/suppliers/api/suppliers/status` responds

---

## Known limitations / honest disclosure

The current implementation has 15 audit-flagged findings documented
under [`docs/superpowers/specs/`](https://github.com/HarryBurdett/sam-suppliers/tree/main/docs/superpowers/specs):

- 3 BLOCKER (acknowledge/approve/bulk-approve atomicity holes)
- 1 CRITICAL (extraction not idempotent — burns LLM cost on email
  redelivery)
- 1 HIGH (process-email duplicate-row race)
- 4 MEDIUM/WEAK
- 4 GAP/PARTIAL

Full rollup at [`docs/superpowers/specs/2026-06-04-audit-fix-status.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/superpowers/specs/2026-06-04-audit-fix-status.md).

**If you do Option B (clean-room rewrite):** decide upfront whether
you're reproducing the current behaviour (including these holes) or
fixing them. The spec describes current behaviour. The audit docs say
where the fixes go. ~5–7 days of focused work to address the lot.

**If you do Option C (AI agent):** tell the agent these are
*deliberately deferred fixes to reproduce as-is, not bugs to fix
unprompted* — otherwise the agent will silently fix them and your
implementation will diverge from the spec.

---

## What I can help with

- Answer spec questions while you read
- Patch spec gaps you find
- Provide source-pointers when the spec isn't enough
- Bring you up to speed on the SAM 1.6.x contract (which is well-
  documented in `02-architecture.md` but has its own quirks — same
  shape as gocardless/bank-rec)
- Help with the agent prompts if you go Option C

Best channel: reply via email/Slack with file:line references; I can
turn around answers fast.

---

## One thing to know about the dependencies

This plugin sits between four external services:

| Service | When you'll touch it |
|---|---|
| **SAM v1.6.6+** | At install time. Spec `02-architecture.md` covers the contract; you'll need a SAM host to deploy `.sap` against. |
| **Opera SE (mssql)** | Read-only currently. Spec `09-standalone-runtime.md` covers the adapter. You'll need LAN credentials to test live. |
| **Anthropic Claude API** | LLM extraction. Spec `09-standalone-runtime.md` covers the adapter. You'll need an API key. |
| **An IMAP mailbox** | Only in standalone mode (SAM provides email-ingest in plugin mode). **Deferred** — see [`docs/superpowers/specs/2026-06-04-imap-adapter-design.md`](https://github.com/HarryBurdett/sam-suppliers/blob/main/docs/superpowers/specs/2026-06-04-imap-adapter-design.md) for the design. |

You can stub all four for initial development — `OPERA_ADAPTER=noop`,
no `ANTHROPIC_API_KEY` set, no SAM, no IMAP — the dev-host
(`npm run dev`) runs the UI and most endpoints respond. The
extraction / email / Opera-write paths need the real services to test
end-to-end.

---

## Final note

The spec was written **after** the code was built, as reverse
documentation. We're treating this as a forcing function — "if we
can't reproduce the app from the spec, the spec isn't good enough."
If you find sections that don't actually let you reproduce a piece,
flag them — that's the gap we want to close.

Thanks for taking a look.

Harry
