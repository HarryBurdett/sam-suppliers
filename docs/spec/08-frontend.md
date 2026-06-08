# Frontend

React 18 + Vite SPA. Built as a hashed-asset bundle (`index.html` +
`assets/index-HASH.{js,css}`). SAM serves the SPA from
`<plugin-dist>/frontend-dist/` in an iframe at `/apps/suppliers/`.

## Build mode

- **NOT** UMD lib mode. The previous v1.0-era plugin used lib mode +
  `window.__SAM_APPS__` registration. v1.6+ SAM expects a SPA.
- Vite config (`frontend/vite.config.ts`):
  ```ts
  export default defineConfig({
    base: './',                  // relative asset URLs
    plugins: [react()],
    build: { sourcemap: true, minify: 'esbuild' },
  });
  ```
- Tailwind via `postcss.config.cjs` + `tailwind.config.cjs`. CSS scoped
  with `.suppliers-app` wrapper class.

## Entry point

`frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Supplier Reconciliation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

SAM (and standalone) injects `<script>window.__SAM_CONTEXT__ = {...}</script>`
into `<head>` before serving — the SPA reads it at module-init time.

## `frontend/src/index.tsx` — bootstrap

Responsibilities:
1. Read `window.__SAM_CONTEXT__` (injected by host)
2. Fall back to a cookie-auth `api` client if not present (e.g. when
   served directly from the Vite dev server)
3. Call `setSamContext(ctx)` on the api-shim
4. Mount `<Suppliers context={ctx} />` at `#root`

Fallback api implementation rewrites `/api/foo` → `/api/apps/suppliers/foo`
to match SAM's mount-and-strip pattern.

## Page composition — `Suppliers.tsx`

Top-tab nav with 11 tabs:

```ts
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'queue', label: 'Queue' },
  { id: 'reconciliations', label: 'Reconciliations' },
  { id: 'directory', label: 'Directory' },
  { id: 'account', label: 'Account' },
  { id: 'queries', label: 'Queries' },
  { id: 'history', label: 'History' },
  { id: 'communications', label: 'Communications' },
  { id: 'aged', label: 'Aged Creditors' },
  { id: 'security', label: 'Security' },
  { id: 'settings', label: 'Settings' },
] as const;
```

Mounted under a single `QueryClientProvider` (TanStack Query). On
mount, calls `setSamContext(props.context)` so the api-shim has the
api client ready before any page renders.

## Pages

| Component | LOC | Source | Backend endpoints |
|---|---|---|---|
| `SupplierDashboard.tsx` | 457 | port | `/api/supplier-statements/dashboard`, `/api/suppliers/health-check` |
| `SupplierStatementQueue.tsx` | 255 | port | `/api/supplier-statements/queue`, `/api/supplier-statements/:id/{process,acknowledge,approve}` |
| `SupplierReconciliations.tsx` | 195 | port | `/api/supplier-statements/reconciliations` |
| `SupplierAccount.tsx` | 1,342 | port (largest) | many — per-supplier deep view (statement detail, lines, queries, history) |
| `SupplierDirectory.tsx` | 310 | ported in this session | `/api/supplier-directory`, `/api/suppliers/:code` |
| `SupplierQueries.tsx` | 266 | ported in this session | `/api/supplier-queries`, `/api/supplier-queries/:id/{resolve,remind}` |
| `SupplierStatementHistory.tsx` | 186 | ported in this session | `/api/supplier-statements/history` |
| `SupplierCommunications.tsx` | 151 | ported in this session | `/api/supplier-communications` |
| `SupplierAgedCreditors.tsx` | 752 | ported in this session | `/api/creditors/aged/{,/trend,/:account}` |
| `SupplierSecurity.tsx` | 373 | ported in this session | `/api/supplier-security/{alerts,audit,email-flags,approved-senders}` |
| `SupplierSettings.tsx` | 638 | ported in this session | `/api/supplier-settings` (GET + POST) |

Not yet ported (drill-down only — need a nav pattern):

| Legacy file | LOC | Backend ready? |
|---|---|---|
| `SupplierAccountDetail.tsx` | 585 | yes |
| `SupplierStatementDetail.tsx` | 675 | yes |

## Shared components

All under `frontend/src/`:

| Component | Purpose |
|---|---|
| `PageHeader.tsx` | Icon + title + subtitle + action buttons |
| `Card.tsx` | Bordered/shadowed card wrapper |
| `Alert.tsx` | `error \| warning \| info \| success` banner with dismiss |
| `LoadingState.tsx` | Spinner + message |
| `EmptyState.tsx` | Icon + message + optional action |
| `StatusBadge.tsx` | Pill for status enums |
| `HelpPanel.tsx` | Collapsible panel with help sections |

## Shims (host-isolation layer)

| File | Purpose |
|---|---|
| `api-shim.ts` | `apiClient` (axios-style helpers) + `authFetch` (Response-like wrapper). Reads ctx via `setSamContext(ctx)`. Adds `X-Opera-Company` header on every request. Helpers for known endpoints (`reconcileBanks`, `supplierStatementHistory`, `supplierCommunications`, etc.). |
| `router-shim.tsx` | Drop-in replacements for `react-router-dom`: `useSearchParams`, `useNavigate`, `Link`. Lets vendored legacy pages compile without pulling in `react-router-dom`. `useNavigate` fires a `sam:navigate` CustomEvent that SAM's host can intercept. |
| `ui-shim.ts` | Re-exports `Card`, `Alert`, `EmptyState`, `LoadingState`, `PageHeader`, `StatusBadge` so vendored pages can use the legacy `'../components/ui'` import shape (rewritten to `'./ui-shim'`). |
| `useHelp.ts` | Hook returning `{showHelp, setShowHelp}` + F1 keyboard handler. |

## Type bindings

`frontend/src/sam.ts`:

```ts
export interface SamUser {
  userId?: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'user' | 'sam-admin';
  appRole?: string | null;
  appConfig?: Record<string, unknown> | null;
}

export interface SamCompany {
  code: string;
  name?: string;
}

export interface SamApiClient {
  baseUrl: string;
  fetch: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
}

export interface SamPluginContext {
  appId: string;
  user: SamUser | null;
  token: string | null;
  currentCompany: SamCompany | null;
  api: SamApiClient;
  events?: EventTarget;
}
```

These types are duplicated in TypeScript (frontend) vs the backend's
`SamPluginContext` shape — they're not imported from a shared package
because SAM's `@ai-sam/shared` isn't a frontend runtime dependency
(adds bundle weight + version-pin coupling).

## Tailwind setup

```js
// tailwind.config.cjs
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  prefix: '',
  important: '.suppliers-app',  // scopes everything to .suppliers-app wrapper
  theme: { extend: {} },
  plugins: [],
};
```

`index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

The `.suppliers-app` wrapper on the top-level div + the `important:`
config means the plugin's Tailwind utilities don't bleed into SAM's
host page (which has its own Tailwind setup).

## Page conventions

Vendored pages follow a consistent pattern:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon1, Icon2 } from 'lucide-react';
import { authFetch } from './api-shim';
import { PageHeader, Card, Alert, LoadingState } from './ui-shim';
import { HelpPanel } from './HelpPanel';
import { useHelp } from './useHelp';

export default function SupplierXxx() {
  const { showHelp, setShowHelp } = useHelp();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['xxx'],
    queryFn: async () => {
      const res = await authFetch('/api/...');
      if (!res.ok) throw new Error('Failed');
      return (await res.json());
    },
  });
  // ...render
}
```

`useQueryClient` is used in pages that invalidate cache after a
mutation (e.g. `SupplierDirectory.tsx` invalidates supplier list
after adding a contact).

## Path rewrites applied during legacy port

When vendoring a legacy page from
`/Users/maccb/llmragsql/frontend/src/pages/SupplierX.tsx`, apply:

| Legacy import | SAM port import |
|---|---|
| `'../api/client'` | `'./api-shim'` |
| `'../components/ui'` | `'./ui-shim'` |
| `'../components/HelpPanel'` | `'./HelpPanel'` |
| `'../hooks/useHelp'` | `'./useHelp'` |
| `'react-router-dom'` | `'./router-shim'` |

These are mechanical sed substitutions. The page's React code is
otherwise unchanged.

## Frontend `package.json` essentials

```json
{
  "name": "@sqlrag/suppliers-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.40.0",
    "lucide-react": "^0.395.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

React + ReactDOM are direct deps (bundled), NOT peerDependencies.
Previous lib-mode setup had them as peers; the SPA bundles them.

## Frontend `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*"]
}
```

Notes:
- `target: ES2021` — for `String.prototype.replaceAll` used in the
  Settings page's email-preview merge-field substitution
- `noEmit: true` — Vite emits the bundle, tsc just type-checks
- `noUncheckedIndexedAccess: false` — pragmatic; vendored pages
  weren't written with strict index checks

## Build output

```
frontend/dist/
├── index.html                           ← SPA shell (Vite-generated)
├── assets/
│   ├── index-HASH.js                    ← React + all pages + vendor (~327 KB, 88 KB gz)
│   ├── index-HASH.js.map
│   └── index-HASH.css                   ← Tailwind + custom styles (~30 KB, 5 KB gz)
```

Hash changes per content change. Cache-busting works automatically
since the bundle filename is in the index.html's script tag.
