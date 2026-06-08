# External Services (the `ctx` surface)

What the plugin reads from `ctx.*`. Every entry here is something
SAM (or the standalone host) must provide for the plugin to work.

## `ctx.appId` — string

Always `"suppliers"` for this plugin. Used in the v2 shim for the
register adapter and in some logger messages.

## `ctx.tenantId` — string

UUID of the SAM tenant (or `"standalone:<companyCode>"` in standalone
mode). Used as a logging tag; not currently used for query scoping
(the per-app DB is already tenant-scoped at the SAM layer).

## `ctx.config` — object

Tenant-scoped config blob. Currently only `{ mailboxes?: string[] }`
is read — by `default-email-ingest.ts` to bootstrap mailbox handlers.

## `ctx.operaType` — `'opera-se' | 'opera-3' | null`

Tells the plugin which Opera variant is active. Used to:
- Pick SQL dialects (currently all reads use SE-style SQL)
- Skip features only available in one variant

## `ctx.db` — object

Four Knex pools / functions:

| Field | Type | Read/Write | Used by |
|---|---|---|---|
| `sam` | `Knex` | read | Cross-app queries (rare; effectively unused by this plugin) |
| `app` | `Knex \| null` | read+write | Every service. Per-app DB (SQLite standalone / MSSQL SAM) |
| `operaSystem` | `Knex \| null` | read | Reserved; unused |
| `getCompanyDb` | `(code: string) => Knex \| null` | read | Opera per-company data (`pname`, `ptran`, etc.) |

`getCompanyDb` returns `null` when no Opera connection exists for the
company — service routes return 503 in that case.

## `ctx.logger` — `AppLogger`

```ts
interface AppLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
```

Used throughout. No structured logging; just stringified messages.

## `ctx.llm` — `SamLlmService | undefined`

```ts
interface SamLlmService {
  chat(req: ChatRequest): AsyncIterable<unknown>;
  stream(req: ChatRequest): AsyncIterable<unknown>;
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  context?: string;
}
```

Chunks yielded by the iterator are:
- bare `string` (legacy)
- `{ text: string }`
- `{ delta: { text: string } }`

`callLlmText` in `services/misc-endpoints.ts` accumulates all three
shapes into a single string.

Usage sites:
- `extractStatementFromText` — single-shot extraction; model
  `claude-sonnet-4`, maxTokens 4000, temperature 0.2
- `previewStatementResponse` — response preview generation

When `ctx.llm` is undefined, dependent routes return
`{ success: false, error: 'ctx.llm not configured' }` (503-style
soft fail).

**Standalone:** `standalone/anthropic-llm-adapter.ts` provides an
implementation backed by the Anthropic Messages API. See
[09-standalone-runtime.md](./09-standalone-runtime.md).

## `ctx.email` — `SamEmailService | undefined`

```ts
interface SamEmailService {
  send(opts: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    senderEmail?: string | null;
  }): Promise<{ success: boolean; error?: string }>;
  isConfigured(): Promise<boolean>;
}
```

Used by:
- `statement-actions.ts` — acknowledge / approve / edit response
- `supplier-queries.ts` — reminder sends
- Remittance route — remittance advice

When undefined, dependent routes return
`{ success: false, error: 'ctx.email not configured' }`.

**Standalone:** no implementation currently. Sends fail at the
`isConfigured()` check or fall through to a noop.

## `ctx.emailIngest` — `SamEmailIngestService | undefined`

```ts
interface SamEmailIngestService {
  claimMailbox(opts: { mailboxEmail: string }): Promise<unknown>;
  releaseMailbox(opts: { mailboxEmail: string }): Promise<void>;
  listMyMailboxes(): Promise<unknown[]>;
  registerHandler(
    mailboxId: string,
    handler: (...args: unknown[]) => unknown,
  ): () => void;
  fetchAttachment(
    msg: unknown,
    attachmentId: string,
  ): Promise<{ bytes: Buffer; name: string; contentType: string }>;
  getAttachmentText(
    msg: unknown,
    attachmentId: string,
    opts?: { maxBytes?: number },
  ): Promise<{ name: string; contentType: string; text: string; truncated: boolean }>;
  onOwnershipChange(fn: (event: unknown) => Promise<void>): () => void;
  onActivityChange(fn: (event: unknown) => Promise<void>): () => void;
}
```

Used at plugin load (`router.ts:155-170`):

```ts
const builtinEmailIngest = ctx.emailIngest
  ? buildDefaultEmailIngest({
      emailIngest: ctx.emailIngest,
      appId: 'suppliers',
      logger: ctx.logger,
    })
  : null;
```

If `ctx.emailIngest` is present AND `ctx.config.mailboxes` is
non-empty, `default-email-ingest.ts`:
1. Calls `listMyMailboxes()` to bootstrap
2. `registerHandler(mailboxId, fn)` for each claimed mailbox
3. Caches each delivered message under a sequential numeric ID
4. Exposes a `fetchAttachment({ emailId, attachmentId? })` wrapper

Routes consume the wrapper via
`ctx.supplierEmailAttachments?.fetchAttachment(...)` (set by the
router at load time as a property on `ctx`).

When undefined, the email-driven extraction path is dead. Manual
upload via `/extract-from-text` still works.

**Standalone:** no implementation currently. See
[`../superpowers/specs/2026-06-04-imap-adapter-design.md`](../superpowers/specs/2026-06-04-imap-adapter-design.md)
for the deferred design.

## `ctx.graph` — `SamGraphService | undefined`

```ts
interface SamGraphService {
  getToken(): Promise<string>;
}
```

Reserved for future direct Microsoft Graph calls (e.g. profile
fetching). Currently unused.

## `ctx.createAIService` — `() => unknown` (optional)

Legacy hook. Currently unused.

## `ctx.setSyncTrigger` — `(handler) => void` (optional)

Hook for SAM to invoke a plugin-defined sync handler at scheduled
intervals. Not wired by the suppliers plugin.

## `req.user` — `Express.Request` augmentation

Set by SAM's authenticate middleware before the plugin router runs.
Plugin reads:

```ts
interface User {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'sam-admin';
  userType: 'sam-admin' | 'tenant-admin' | 'app-user';
  tenantId: string;
  appRole?: string | null;
  permissions: string[];
  tokenType?: string;
}
```

Used in:
- `change-audit.ts:recordChange` — sets `changed_by`
- `security.ts:verifySecurityAlert` — sets `verified_by`
- `statement-actions.ts:approveStatement` — `approved_by`
- Frontend renders some operator info via `/auth/me`

## `req.operaCompany` — `string | undefined`

Set by SAM's company-resolution middleware from the `X-Opera-Company`
header. Used by the `getOperaDb(req, res)` helper to call
`ctx.db.getCompanyDb(req.operaCompany)`.

## `req.standaloneCompany` — `string | undefined`

Standalone-only. Set by `standalone/auth.ts:requireAuth` from the
session cookie's `companyCode`. The dispatcher uses this to route to
the matching per-company plugin instance.

## Plugin-internal additions to `ctx`

The router adds runtime properties to `ctx` after load:

| Property | Set in | Read by |
|---|---|---|
| `supplierEmailAttachments` | `router.ts:156-170` | Email-driven extraction route |

This is the standard pattern for plugin-internal services that don't
belong on the public `AppContext` interface.

## What the plugin DOESN'T use

- `ctx.db.operaSystem` — reserved; never read
- `ctx.graph` — never called
- `ctx.createAIService` — never called
- `ctx.setSyncTrigger` — never registered

These are part of the SAM contract but optional. Removing them from
the local `AppContext` interface declaration would not break the
plugin, but they're kept to match the SAM contract structurally.

## Provider summary

| `ctx.*` field | SAM mode provider | Standalone provider |
|---|---|---|
| `db.app` | SAM provisions per-app MSSQL DB | SQLite file under `<DATA_ROOT>/<code>/suppliers.sqlite` |
| `db.sam` | SAM provides | In-memory SQLite (effectively unused) |
| `db.getCompanyDb` | SAM's Opera connection pool | `standalone/opera-adapter*.ts` |
| `logger` | SAM | `console.log/warn/error/debug` |
| `llm` | SAM's LLM service | `standalone/anthropic-llm-adapter.ts` |
| `email` | SAM's graphEmailService | **not wired** |
| `emailIngest` | SAM's emailIngest service | **not wired** (design at `docs/superpowers/specs/2026-06-04-imap-adapter-design.md`) |
| `graph` | SAM | not wired |
| `req.user` | SAM's authenticate middleware | `standalone/auth.ts:requireAuth` (synthesized) |
| `req.operaCompany` | SAM's company middleware (`X-Opera-Company`) | `standalone/auth.ts` (from session) |
