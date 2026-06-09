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
/**
 * Module-level ALS instance. One per plugin process — shared by every
 * request the plugin handles. The store carries the per-request `req`
 * and `ctx` for the Proxy to read.
 */
const als = new AsyncLocalStorage();
/**
 * Build a JS Proxy that satisfies the v1 `AppContext` interface,
 * dispatching property reads to either stable services (captured once)
 * or per-request fields (resolved from ALS).
 *
 * The Proxy is built ONCE per plugin lifecycle. The `stableServices`
 * object is captured by closure and reused on every read. Per-request
 * reads pull from `als.getStore()`.
 */
function buildProxyCtx(opts) {
    const { appId, stableServices } = opts;
    return new Proxy({}, {
        get(_target, prop) {
            if (typeof prop !== 'string')
                return undefined;
            // STABLE — no ALS required.
            switch (prop) {
                case 'appId': return appId;
                case 'logger': return stableServices.logger;
                case 'email': return stableServices.email;
                case 'llm': return stableServices.llm;
                case 'aiCredentials': return stableServices.aiCredentials;
                case 'emailIngest': return stableServices.emailIngest;
                case 'graph': return stableServices.graph;
                case 'createAIService': return stableServices.createAIService;
                case 'setSyncTrigger': return stableServices.setSyncTrigger;
            }
            // PER-REQUEST — must run inside ALS scope.
            const store = als.getStore();
            if (!store) {
                throw new Error(`[sam-v2-shim] ctx.${prop} was read outside an active request scope. ` +
                    `Per-request fields (db, tenantId, operaType, config) can only be ` +
                    `accessed from inside an Express handler. If you've captured ctx in a ` +
                    `setTimeout/setInterval/event-listener that fires after the request ` +
                    `ends, capture the specific value at handler time instead.`);
            }
            const { req, ctx } = store;
            switch (prop) {
                case 'tenantId': return req.user?.tenantId ?? '';
                case 'config': return {}; // v1 plugins read tenant config from their app DB, not from ctx.config
                case 'operaType': return ctx.connection.type;
                case 'db': return ctx.db;
                default: return undefined;
            }
        },
    });
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
export function createV2RegisterAdapter(opts) {
    /**
     * Router cache. `null` until construction; thereafter holds the single
     * Router shared by every request.
     *
     * Concurrency: createRouterV1 is synchronous and idempotent in the
     * v1 plugins, so a (very unlikely) race between two simultaneous
     * first-requests would build the router twice and the loser's copy
     * would be GC'd. No correctness issue. If a future plugin needs
     * async construction, switch this to a Promise-cached pattern.
     */
    let cachedRouter = null;
    return function register(deps) {
        // SAM 1.6.4+: if the loader passes stable services at registration time,
        // build the router immediately so email-folder subscriptions and other
        // startup work (bootstrapFolders, etc.) fire without waiting for the
        // first authenticated request.
        if (deps.stableServices && cachedRouter === null) {
            const proxyCtx = buildProxyCtx({
                appId: opts.appId,
                stableServices: deps.stableServices,
            });
            cachedRouter = opts.createRouterV1(proxyCtx);
        }
        deps.app.use((req, res, next) => {
            // Resolve SAM's per-request handles.
            let ctx;
            let services;
            try {
                ctx = deps.useSamContext(req);
                services = deps.useSamServices(req);
            }
            catch (err) {
                // SAM-admin tokens have no samContext; pass through (handler can
                // decide whether to 401 or serve admin-only paths).
                return next(err);
            }
            // First-request fallback (SAM < 1.6.4 without stableServices):
            // build the inner router with the stable services baked into the Proxy.
            if (cachedRouter === null) {
                const proxyCtx = buildProxyCtx({
                    appId: opts.appId,
                    stableServices: services,
                });
                cachedRouter = opts.createRouterV1(proxyCtx);
            }
            // Dispatch the request inside an ALS scope holding per-request data.
            als.run({ req, ctx }, () => {
                cachedRouter(req, res, next);
            });
        });
    };
}
/**
 * Test-only export: lets unit tests reset the cached router between
 * test cases without restarting the module. Not part of the public
 * runtime API.
 *
 * @internal
 */
export const __TEST_ONLY__ = {
    /**
     * Note: there's no test-only handle on the cached router itself
     * because it's a closure variable inside createV2RegisterAdapter.
     * Each call to createV2RegisterAdapter gets its own cache — tests
     * that need a fresh shim just call createV2RegisterAdapter again.
     */
    als,
};
//# sourceMappingURL=sam-v2-shim.js.map