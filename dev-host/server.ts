/**
 * Local dev host that loads the suppliers SAM plugin standalone.
 *
 * NOT a SAM-compatible host — only enough scaffolding to render the
 * frontend and answer endpoints that don't depend on a real Opera DB.
 * `db.getCompanyDb()` returns null, so any route that touches Opera
 * will surface a 503/null error.
 */
import express from 'express';
import knex, { type Knex } from 'knex';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { AppContext, AppBackendFactory } from '../src/app-context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const FRONTEND_DIST = resolve(repoRoot, 'frontend', 'dist');

function makeInMemoryKnex(): Knex {
  return knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });
}

async function runMigrations(db: Knex): Promise<void> {
  const dir = resolve(repoRoot, 'src/db/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts')).sort();
  for (const file of files) {
    const mod = (await import(resolve(dir, file))) as {
      up: (k: Knex) => Promise<void>;
    };
    await mod.up(db);
    console.log(`  migrated ${file}`);
  }
}

function makeLogger() {
  return {
    info: (msg: string, ...args: unknown[]) => console.log(`[info] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`[warn] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`[error] ${msg}`, ...args),
    debug: (msg: string, ...args: unknown[]) => console.log(`[debug] ${msg}`, ...args),
  };
}

async function main() {
  console.log('[dev-host] booting in-memory SQLite for db.app');
  const appDb = makeInMemoryKnex();
  console.log('[dev-host] running plugin migrations');
  await runMigrations(appDb);

  const samDb = makeInMemoryKnex();

  const ctx: AppContext = {
    appId: 'suppliers',
    tenantId: 'dev-tenant',
    config: { mailboxes: [] },
    operaType: 'opera-se',
    db: {
      sam: samDb,
      app: appDb,
      operaSystem: null,
      getCompanyDb: () => null,
    },
    logger: makeLogger(),
  };

  console.log('[dev-host] loading plugin factory from dist/index.js');
  const pluginMod = (await import(resolve(repoRoot, 'dist/index.js'))) as {
    default: AppBackendFactory;
  };
  const pluginRouter = await pluginMod.default(ctx);

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // SPA's hashed asset bundle (frontend/dist/assets/index-HASH.{js,css}).
  app.use(
    '/assets',
    express.static(resolve(FRONTEND_DIST, 'assets'), {
      etag: true,
      lastModified: true,
    }),
  );

  app.use('/api/apps/suppliers', (req, _res, next) => {
    req.user = {
      userId: 'dev-user',
      email: 'dev@example.com',
      role: 'admin',
      userType: 'tenant-admin',
      tenantId: 'dev-tenant',
      permissions: ['opera:read', 'opera:write', 'sam:config:read'],
    };
    const company = req.header('X-Opera-Company') ?? 'DEMO';
    req.operaCompany = company;
    next();
  });

  app.use('/api/apps/suppliers', pluginRouter);

  // SPA shell with __SAM_CONTEXT__ injection. Mirrors what SAM does in
  // its iframe host — the SPA picks up the context at module-init.
  app.get('/', async (_req, res) => {
    let indexHtml: string;
    try {
      indexHtml = await readFile(resolve(FRONTEND_DIST, 'index.html'), 'utf8');
    } catch (err) {
      res
        .status(500)
        .type('text/plain')
        .send(
          `Failed to read frontend/dist/index.html — run \`npm run build\` first. (${(err as Error).message})`,
        );
      return;
    }
    const samContext = {
      appId: 'suppliers',
      user: {
        userId: 'dev-user',
        email: 'dev@example.com',
        name: 'Dev User',
        role: 'admin',
        userType: 'tenant-admin',
        tenantId: 'dev-tenant',
        permissions: ['opera:read', 'opera:write', 'sam:config:read'],
      },
      token: 'dev-token',
      currentCompany: { code: 'DEMO', name: 'Demo Company' },
    };
    const inject = `<script>window.__SAM_CONTEXT__ = ${JSON.stringify(samContext).replace(/</g, '\\u003c')};</script>`;
    const patched = indexHtml.replace(/<head>/i, `<head>${inject}`);
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.type('html').send(patched);
  });

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[dev-host] unhandled:', err);
      res.status(500).json({ error: err.message });
    },
  );

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`\n[dev-host] http://localhost:${port}`);
    console.log(`[dev-host] plugin API:  /api/apps/suppliers/*`);
    console.log(`[dev-host] SPA shell:   GET /`);
  });
}

main().catch((err) => {
  console.error('[dev-host] failed to start:', err);
  process.exit(1);
});
