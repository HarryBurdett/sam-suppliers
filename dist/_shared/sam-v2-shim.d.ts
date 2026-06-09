/**
 * SAM v2 plugin contract adapter — bridges SAM v1.6.3+'s per-request
 * `register({ app, useSamContext, useSamServices })` contract to this
 * plugin's existing v1 `createRouter(ctx: AppContext)` factory.
 *
 * Why this exists: SAM 1.6 introduced multi-connection, where different
 * users on the same SAM install can be logged into different Opera
 * installations. Per-request resolution of the connection-scoped `ctx`
 * lets the same plugin code serve all of them. v1 plugins (this one,
 * as of writing) capture `ctx` once at startup, which doesn't work in
 * a multi-connection world. The "right" fix would be to rewrite every
 * route handler to call `useSamContext(req)` directly — but that's
 * 3,950 lines of mechanical edits with non-zero risk of accidental
 * behaviour change in tested business logic. This shim avoids that
 * entirely by making `ctx.X` resolve through SAM's per-request hooks
 * via a JavaScript Proxy + AsyncLocalStorage.
 *
 * Architecture: two flavours of ctx field, handled differently inside
 * the Proxy.
 *
 *   STABLE services (logger / email / llm / emailIngest / graph /
 *   createAIService / setSyncTrigger, plus appId): SAM-wide singletons.
 *   Same value for every request. Captured ONCE from `useSamServices(req)`
 *   on the first request, then reused. Reads don't require an ALS scope.
 *
 *   PER-REQUEST fields (db / tenantId / operaType / config): vary by
 *   connection / user. Resolved through ALS from the current request's
 *   `useSamContext(req)` + `req.user`. Reads outside an ALS scope throw
 *   a clear error to catch any handler that captures ctx in a late-firing
 *   callback (e.g. setTimeout after res.json) — none currently exist
 *   per the Phase 1 safety audit, but the guard is cheap insurance.
 *
 * Router lifecycle: `createRouterV1(proxyCtx)` is deferred until the
 * first incoming request, at which point SAM's `useSamServices(req)`
 * is callable. The resulting Router is cached and reused for every
 * subsequent request, identical to v1's "build once, dispatch many"
 * shape — just shifted one request later.
 *
 * Standalone host: completely unaffected. It imports the v1 `default
 * factory` export from src/index.ts, which calls `createRouter(ctx)`
 * directly without going through this shim.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Router, Request } from 'express';
import type { Knex } from 'knex';
import type { AppContext } from '../app-context.js';
/**
 * Structural typing for SAM 1.6.3+ runtime contracts. Declared locally
 * rather than imported from `@ai-sam/shared` because this plugin does
 * NOT take a runtime dependency on the SAM monorepo — same pattern
 * `app-context.ts` uses. The standalone host doesn't have @ai-sam/shared
 * available either, so locally-declared structural types let one source
 * tree compile in both contexts.
 *
 * If SAM evolves these shapes in a future release we're not pinned to
 * a specific version — TypeScript checks the structural subset we care
 * about and the runtime accepts anything compatible.
 */
export interface SamConnection {
    id: string;
    slug: string;
    name: string;
    type: 'opera-se' | 'opera-3';
}
export interface SamContext {
    connection: SamConnection;
    db: {
        sam: Knex;
        app: Knex;
        operaSystem: Knex | null;
        getCompanyDb: (code: string) => Knex | null;
    };
    operaAgent: unknown;
}
export interface SamServicesShape {
    logger: AppContext['logger'];
    email?: AppContext['email'];
    llm?: AppContext['llm'];
    aiCredentials?: AppContext['aiCredentials'];
    emailIngest?: AppContext['emailIngest'];
    graph?: AppContext['graph'];
    createAIService?: AppContext['createAIService'];
    setSyncTrigger?: AppContext['setSyncTrigger'];
}
export type UseSamContextFn = (req: Request) => SamContext;
export type UseSamServicesFn = (req: Request) => SamServicesShape;
interface AlsStore {
    req: Request;
    ctx: SamContext;
}
/**
 * Public entry — builds the v2 `register({ app, useSamContext,
 * useSamServices })` function this plugin exports for SAM 1.6.3+.
 *
 * Usage from src/index.ts:
 *   export const register = createV2RegisterAdapter({
 *     appId: 'suppliers',
 *     createRouterV1: createRouter,
 *   });
 */
export declare function createV2RegisterAdapter(opts: {
    appId: string;
    createRouterV1: (ctx: AppContext) => Router;
}): (deps: {
    app: Router;
    useSamContext: UseSamContextFn;
    useSamServices: UseSamServicesFn;
    /** SAM 1.6.4+: stable services built at load time so the plugin can
     *  eagerly bootstrap (e.g. email-folder subscriptions) without waiting
     *  for the first authenticated request. */
    stableServices?: SamServicesShape;
}) => void;
/**
 * Test-only export: lets unit tests reset the cached router between
 * test cases without restarting the module. Not part of the public
 * runtime API.
 *
 * @internal
 */
export declare const __TEST_ONLY__: {
    /**
     * Note: there's no test-only handle on the cached router itself
     * because it's a closure variable inside createV2RegisterAdapter.
     * Each call to createV2RegisterAdapter gets its own cache — tests
     * that need a fresh shim just call createV2RegisterAdapter again.
     */
    als: AsyncLocalStorage<AlsStore>;
};
export {};
//# sourceMappingURL=sam-v2-shim.d.ts.map