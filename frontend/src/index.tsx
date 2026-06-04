/**
 * Suppliers plugin — SPA entry.
 *
 * Mounted by SAM in an iframe at /apps/suppliers/. SAM serves the
 * built `index.html` and hashed assets — see
 * ai-sam/packages/backend/src/index.ts:157-177.
 *
 * Context comes from `window.__SAM_CONTEXT__` when SAM injects it into
 * the iframe HTML before this script runs. When that's absent (e.g.
 * standalone dev), a cookie-auth fallback is constructed so /api calls
 * still work against the same-origin backend.
 */
import { createRoot } from 'react-dom/client';
import './index.css';
import Suppliers from './Suppliers';
import { setSamContext } from './api-shim';
import type { SamApiClient, SamPluginContext } from './sam';

declare global {
  interface Window {
    __SAM_CONTEXT__?: SamPluginContext;
  }
}

const APP_ID = 'suppliers';

function buildFallbackApi(): SamApiClient {
  // SAM's plugin router uses internalApiPrefix="/api": a browser
  // request to /api/apps/<appId>/X causes SAM to set req.url = /api/X
  // before forwarding to the plugin router. So callers that use paths
  // like '/api/supplier-statements/...' must NOT include the /api
  // prefix in the browser URL — SAM adds it. Strip any leading /api
  // before prepending the app mount path so the URL stays
  // single-prefixed.
  return {
    baseUrl: `/api/apps/${APP_ID}`,
    fetch: async <T = unknown>(
      path: string,
      options: RequestInit = {},
    ): Promise<T> => {
      const stripped = path.startsWith('/api/') ? path.slice(4) : path;
      const tail = stripped.startsWith('/') ? stripped : `/${stripped}`;
      const url = `/api/apps/${APP_ID}${tail}`;
      const res = await fetch(url, { credentials: 'include', ...options });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep as text
        }
        let msg: string = `HTTP ${res.status}`;
        if (parsed && typeof parsed === 'object') {
          const err = (parsed as { error?: unknown }).error;
          if (typeof err === 'string' && err) msg = err;
        } else if (typeof parsed === 'string' && parsed) {
          msg = parsed;
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
    },
  };
}

// SAM injects the full context object (including an `api` SAM client)
// into window.__SAM_CONTEXT__ before this script loads. The standalone
// dev host injects everything EXCEPT `api`, because JSON-serialised
// injection can't carry functions — the standalone relies on this SPA
// to build the cookie-auth fallback at module init. Merge so:
//   - SAM-injected context (with api):       use as-is
//   - Standalone-injected context (no api):  graft the fallback api on
//   - No injection at all (unit harness):    full fallback
const injected = window.__SAM_CONTEXT__;
const ctx: SamPluginContext = injected
  ? { ...injected, api: injected.api ?? buildFallbackApi() }
  : {
      appId: APP_ID,
      user: null,
      token: null,
      currentCompany: null,
      api: buildFallbackApi(),
    };

setSamContext(ctx);

const rootEl = document.getElementById('root');
if (!rootEl) {
  // eslint-disable-next-line no-console
  console.error(`[${APP_ID}] #root element not found in index.html`);
} else {
  createRoot(rootEl).render(<Suppliers context={ctx} />);
}
