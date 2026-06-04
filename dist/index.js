/**
 * suppliers — SAM plugin entry point.
 *
 * Dual export shape:
 *   - `register({ app, useSamContext, useSamServices })` — SAM v1.6.3+
 *     v2 plugin contract. Used by SAM's plugin loader when
 *     `manifest.samContextVersion === 2`. The shim translates SAM's
 *     per-request context into the v1 AppContext shape this plugin's
 *     existing router code (src/router.ts) expects.
 *   - `default factory(ctx)` — v1 contract, used by the standalone
 *     host in `standalone/server.ts`. Standalone constructs its own
 *     AppContext from local config and passes it directly.
 *
 * Both paths converge on the existing `createRouter(ctx)` factory,
 * which is untouched. See src/_shared/sam-v2-shim.ts for the v2
 * translation mechanics (Proxy + AsyncLocalStorage).
 */
import { createRouter } from './router.js';
import { createV2RegisterAdapter } from './_shared/sam-v2-shim.js';
// ── v2 contract (SAM 1.6.3+) ─────────────────────────────────────────────
export const register = createV2RegisterAdapter({
    appId: 'suppliers',
    createRouterV1: createRouter,
});
// ── v1 contract (kept for standalone host) ────────────────────────────────
const factory = (ctx) => {
    ctx.logger.info(`suppliers plugin loaded for tenant ${ctx.tenantId}`);
    return createRouter(ctx);
};
export default factory;
//# sourceMappingURL=index.js.map