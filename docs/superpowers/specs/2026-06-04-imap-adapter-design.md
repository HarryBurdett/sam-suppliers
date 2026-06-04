# IMAP Mailbox Adapter — Design Note (deferred to follow-up)

A full implementation of `ctx.emailIngest` for standalone mode is
**deferred** to a separate session. This doc captures the design so
the implementation work can be scheduled with clear scope.

## Why this is harder than bank-rec's IMAP adapter

Bank-rec's [imap-mailbox-adapter.ts](/Users/maccb/bank-rec/standalone/imap-mailbox-adapter.ts)
implements two narrow scan-and-fetch interfaces (`BankMailboxAdapter`,
`EmailAttachmentProvider`) used by bank-rec's `/scan-emails` and
`/preview-from-email` endpoints. The adapter doesn't need to model
ownership transitions or push-notification lifecycle.

Suppliers' [`default-email-ingest.ts`](../../../src/services/default-email-ingest.ts)
wraps SAM's full `ctx.emailIngest` interface, which is much wider:

```ts
interface SamEmailIngestService {
  claimMailbox(opts: { mailboxEmail }): Promise<Mailbox>;
  releaseMailbox(opts: { mailboxEmail }): Promise<void>;
  listMyMailboxes(): Promise<Mailbox[]>;
  registerHandler(mailboxId, handler): () => void;
  fetchAttachment(msg, attachmentId): Promise<{bytes, name, contentType}>;
  getAttachmentText(msg, attachmentId, opts?): Promise<{name, contentType, text, truncated}>;
  onOwnershipChange(fn): () => void;
  onActivityChange(fn): () => void;
}
```

Key differences a standalone IMAP adapter must model:

| SAM concept | Standalone analogue |
|---|---|
| Mailbox ownership (which app "owns" the inbox) | Operator config — `email_provider` settings row per company |
| `registerHandler(mailboxId, fn)` — push-style delivery | Poller running in the background, calling the registered handler on each new INBOX message |
| `onOwnershipChange` — fires when SAM operator reassigns | Fires when operator edits `email_provider` settings row |
| `onActivityChange` — heartbeat / status | Adapter reports IMAP connection state |
| Microsoft Graph attachment fetch | imapflow `download(uid, partId)` |

This isn't 50 LOC of port — it's a few hundred LOC of new infrastructure
(poller, handler registry, change-broadcaster, attachment text
extraction).

## What "deferred" means concretely

- **In SAM mode:** suppliers already works — SAM provides
  `ctx.emailIngest` and the existing `default-email-ingest.ts`
  consumes it. No standalone-mode work needed for SAM deployments.
- **In standalone mode without this adapter:** the suppliers app
  boots, the UI renders, manual statement uploads work, but
  email-driven ingestion paths don't (the
  `/api/supplier-statements/extract-from-email/:email_id` endpoint
  surfaces "ctx.supplierEmailAttachments not configured"). Operators
  who want to test email flows in standalone mode need to either:
  1. Manually upload statement text via `/extract-from-text`
  2. Run against a SAM host that provides `ctx.emailIngest`

## Recommended implementation shape (for the follow-up session)

### Files to create

1. **`standalone/imap-mailbox-adapter.ts`** — implements
   `SamEmailIngestService` directly:
   - Per-company `email_provider` config lookup (already exists in
     bank-rec's adapter, reusable)
   - `imapflow` connection per active mailbox
   - INBOX polling loop (~30s interval, IDLE if supported)
   - Per-mailbox handler registry — keyed on the IMAP UID for each
     delivered message
   - Attachment fetch via `imapflow.download(uid, part)`
   - Plain-text body via `mailparser` (already a bank-rec dep)
   - `onOwnershipChange` / `onActivityChange` — EventEmitter-backed

2. **`standalone/public/email-config.html`** — minimal HTML form for
   IMAP server / port / username / password / from-email per company.
   Stored as `JSON` under `settings.key='email_provider'` (same
   pattern bank-rec uses).

3. **`standalone/server.ts`** — add `GET /auth/email-config` +
   `PUT /auth/email-config` routes (bank-rec has exact precedent —
   server.ts:374-590 in bank-rec v1.2.6, copy + drop the
   bank-specific fields).

### Tests to write

- `imap-mailbox-adapter.test.ts` — fake imapflow, verify:
  - `claimMailbox` writes settings + starts poller
  - `registerHandler` fires on new INBOX message
  - `fetchAttachment` / `getAttachmentText` resolve to expected bytes
  - `onOwnershipChange` fires when settings row changes

### Dependencies to add

- `imapflow` (already a bank-rec dep, ^1.0.171)
- `mailparser` (already a bank-rec dep, ^3.7.1)
- `@types/mailparser` (devDep)

### Estimated effort

- Mailbox + handler infrastructure: 4 hours
- Attachment + text extraction: 2 hours
- Settings UI + auth routes: 2 hours
- Tests: 2–3 hours
- Manual smoke against a real IMAP server: 1 hour

**Total: ~1.5 days of focused work.**

## What I did NOT do in this session

Per the user's prior question on scope and the depth required:

- Did **not** write a half-IMAP adapter — half an adapter that only
  handles attachment fetch but not poll/handler/lifecycle would be
  worse than none (the suppliers default-email-ingest expects the
  full interface; a partial implementation would either crash or
  silently miss inbound mail).
- Did **not** add `imapflow` / `mailparser` deps speculatively.
- Did **not** modify `default-email-ingest.ts` to accept a thinner
  adapter interface — that refactor would be premature without first
  proving the standalone adapter is needed at all (most users will
  deploy via SAM, not standalone).

## Recommended call-to-action

If the user wants email routing to work end-to-end in standalone
mode, spawn a follow-up task: "Implement standalone IMAP adapter
(~1.5 days)". Reference this doc + bank-rec v1.2.6's
imap-mailbox-adapter.ts as the starting point.
