# Testing

Vitest, 24 test files, 214 tests. Lives under `tests/`. Run via
`npm test` (one-shot) or `npm run test:watch` (TDD loop).

## Test surface

| File | Scope | Tests |
|---|---|---|
| `aged-creditors.test.ts` | aged-creditors service | ~12 |
| `aged-debt.test.ts` | aged-debt service | 6 |
| `approved-emails.test.ts` | approved-emails service | 9 |
| `automation-config.test.ts` | automation-config service | ~8 |
| `change-audit.test.ts` | change-audit service | ~10 |
| `communications.test.ts` | communications service | ~8 |
| `contacts.test.ts` | contacts service | 8 |
| `default-email-ingest.test.ts` | default-email-ingest service | ~6 (or deferred) |
| `global-settings.test.ts` | global-settings service | 11 |
| `health-check.test.ts` | health-check service | 7 |
| `migrations.test.ts` | migrations smoke | 3 |
| `misc-endpoints.test.ts` | misc-endpoints service | ~10 |
| `onboarding.test.ts` | onboarding service | ~6 |
| `opera-contacts.test.ts` | opera-contacts service | ~10 |
| `processed-emails.test.ts` | processed-emails service | 10 |
| `remittance-log.test.ts` | remittance-log service | 7 |
| `security.test.ts` | security service | ~12 |
| `statement-actions.test.ts` | statement-actions service | ~15 |
| `statement-lines.test.ts` | statement-lines service | ~10 |
| `statement-queue.test.ts` | statement-queue service | ~8 |
| `supplier-config.test.ts` | supplier-config service | 8 |
| `supplier-directory.test.ts` | supplier-directory service | ~5 |
| `supplier-list.test.ts` | supplier-list service | 6 |
| `supplier-overrides.test.ts` | supplier-overrides service | ~7 |
| `supplier-queries.test.ts` | supplier-queries service | ~10 |
| `supplier-statements.test.ts` | supplier-statements service | 6 |

Total: 214 tests as of v1.0.0.

## Test philosophy

- Test the **service layer**, not the router. Router is thin glue;
  services hold the logic.
- Don't mock Knex. **Mock the entire `appDb` callable** with a
  minimal in-memory builder. Tests stay fast (no I/O) and decoupled
  from SQL dialect.
- One test file per service. Co-locate the mock builder helper at the
  top of each file (or shared if reused).
- Each test sets up a fresh `state` object — no shared mutation
  between tests.

## The `makeAppDb(state)` mock pattern

Each test file defines a `makeAppDb(state)` factory that returns a
callable object satisfying the Knex query-builder shape used by the
service under test.

Example (`processed-emails.test.ts`):

```ts
interface Row {
  id: number;
  message_id: string;
  supplier_code: string | null;
  subject: string | null;
  processed_at: string;
}

interface MockState {
  rows: Row[];
  nextId: number;
}

function makeAppDb(state: MockState) {
  const db: any = (table: string) => {
    if (table !== 'processed_emails') {
      throw new Error(`Unexpected table: ${table}`);
    }
    let conds: Record<string, unknown> = {};
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    let limitN = Infinity;
    let order: { col: keyof Row; dir: 'asc' | 'desc' } | null = null;

    const builder: any = {
      where: (cond: Record<string, unknown>) => {
        Object.assign(conds, cond);
        return builder;
      },
      andWhere: (col: string, op: string, val: string) => {
        if (col === 'processed_at') {
          if (op === '>=') dateFrom = val;
          if (op === '<=') dateTo = val;
        }
        return builder;
      },
      orderBy: (col: keyof Row, dir: 'asc' | 'desc') => {
        order = { col, dir };
        return builder;
      },
      limit: (n: number) => { limitN = n; return builder; },
      first: () => {
        const found = state.rows.find((r) =>
          Object.entries(conds).every(([k, v]) => (r as any)[k] === v),
        );
        return Promise.resolve(found);
      },
      then: (cb: (rows: Row[]) => unknown) => {
        let rows = state.rows.filter((r) =>
          Object.entries(conds).every(([k, v]) => (r as any)[k] === v),
        );
        // apply dateFrom, dateTo, order, limit ...
        return Promise.resolve(cb(rows.slice(0, limitN)));
      },
      insert: (row: Partial<Row>) => {
        const performInsert = (skipOnConflict: boolean) => {
          // ... returns [{id}] or []
        };
        return {
          returning: (_: string) => Promise.resolve(performInsert(false)),
          onConflict: (_col: string) => ({
            ignore: () => ({
              returning: (__: string) => Promise.resolve(performInsert(true)),
            }),
          }),
        };
      },
    };
    return builder;
  };
  db.fn = { now: () => new Date() };
  return db;
}
```

What the mock supports per file is **just enough** to cover what the
service under test calls. New service code that uses a new Knex
method requires updating the mock (e.g. when the audit pass changed
`recordProcessedEmail` to use `onConflict.ignore()`, the test mock
gained the new chain — see commit d711aa3).

## Migrations test

`tests/migrations.test.ts` runs every `.ts` migration in lexical order
against an in-memory SQLite database. Catches:

- Syntax errors in migration files
- Wrong file ordering (002 references a column 003 creates, etc.)
- Up/down asymmetry
- Knex schema-builder methods that aren't SQLite-compatible

```ts
const MIGRATIONS_DIR = path.resolve(__dirname, '../src/db/migrations');

async function makeDb(): Promise<Knex> {
  return knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
}

describe('migrations', () => {
  it('every migration file in src/db/migrations runs cleanly in order', async () => {
    const db = await makeDb();
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.ts'))
      .sort();
    for (const file of files) {
      const mod = await import(path.join(MIGRATIONS_DIR, file));
      await mod.up(db);
    }
    // verify all expected tables exist
    for (const table of [...]) {
      const exists = await db.schema.hasTable(table);
      expect(exists).toBe(true);
    }
    await db.destroy();
  });

  it('migrations are idempotent (re-run is a no-op)', async () => { ... });
  it('down migrations clean up correctly', async () => { ... });
});
```

## What is NOT tested

- **The router.** Routes call services; service tests cover the
  logic. A few integration tests could be added but aren't.
- **The standalone host.** No tests for `standalone/server.ts` or
  `standalone/auth.ts`. Manual smoke via `npm start`.
- **The frontend.** No frontend test suite. Manual smoke via
  `npm run dev`. Future addition: Vitest + Testing Library.
- **The v2 shim.** No automated test of the shim's Proxy +
  AsyncLocalStorage behavior. Verified by running under SAM.
- **The Anthropic LLM adapter.** No tests against a mocked Anthropic
  SDK. Manual smoke.
- **IMAP adapter.** Deferred (not implemented).

## Running tests

```sh
npm test                              # one-shot
npm run test:watch                    # TDD watcher
npx vitest run tests/foo.test.ts      # single file
npx vitest run -t "specific test"     # by test name
```

CI: tests run on every push (when CI is wired up; not currently).

## Vitest config

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
```

No setup/teardown hooks; tests are self-contained.

## Test naming conventions

- `describe('<serviceName>', () => { ... })` per top-level group
- `describe('<functionName>', () => { ... })` per function-under-test
- `it('returns expected shape when ...', async () => { ... })` per
  scenario

Behavior-style descriptions (not implementation details). Tests are
documentation for the service's contract.

## Coverage gaps to fill (audit follow-up)

From the audit pass:
- Idempotency tests for `extractStatementFromEmail` (currently has
  none — extraction would be re-run if SAM redelivers an email)
- Atomicity tests for `acknowledgeStatement` / `approveStatement`
  (currently no test that proves email-fail + DB-write succeed
  scenarios are handled)
- Race tests for `processStatementEmail` (currently no test that
  proves two concurrent calls don't both insert)

Each gap aligns with a deferred audit-fix item in
[`../superpowers/specs/2026-06-04-audit-fix-status.md`](../superpowers/specs/2026-06-04-audit-fix-status.md).
