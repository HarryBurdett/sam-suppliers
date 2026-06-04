/**
 * Suppliers plugin entry component.
 *
 * Hosts all the ported supplier pages from the legacy frontend behind
 * a top-tab nav. The page set tracks the legacy app's surface area:
 *
 *   Dashboard, Queue, Reconciliations, Directory, Account, Queries,
 *   History, Communications, Aged creditors, Security, Settings.
 *
 * The two detail-only pages (SupplierAccountDetail, SupplierStatementDetail)
 * aren't wired in yet — they require a drill-down navigation pattern
 * the current flat top-tab UI doesn't model.
 *
 * See bank-reconcile/BankReconcile.tsx for the QueryClientProvider
 * pattern.
 */
import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SamPluginContext } from './sam';
import { setSamContext } from './api-shim';
import SupplierAccount from './SupplierAccount';
import SupplierAgedCreditors from './SupplierAgedCreditors';
import SupplierCommunications from './SupplierCommunications';
import SupplierDashboard from './SupplierDashboard';
import SupplierDirectory from './SupplierDirectory';
import SupplierQueries from './SupplierQueries';
import SupplierReconciliations from './SupplierReconciliations';
import SupplierSecurity from './SupplierSecurity';
import SupplierSettings from './SupplierSettings';
import SupplierStatementHistory from './SupplierStatementHistory';
import SupplierStatementQueue from './SupplierStatementQueue';

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

type TabId = (typeof TABS)[number]['id'];

export default function Suppliers({
  context,
}: {
  context: SamPluginContext;
}) {
  const [tab, setTab] = useState<TabId>('dashboard');

  useEffect(() => {
    setSamContext(context);
  }, [context]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="suppliers-app space-y-4">
        <nav className="flex flex-wrap gap-2 border-b border-gray-200 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600'
                  : 'px-4 py-2 text-sm text-gray-500 hover:text-gray-700'
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'dashboard' && <SupplierDashboard />}
        {tab === 'queue' && <SupplierStatementQueue />}
        {tab === 'reconciliations' && <SupplierReconciliations />}
        {tab === 'directory' && <SupplierDirectory />}
        {tab === 'account' && <SupplierAccount />}
        {tab === 'queries' && <SupplierQueries />}
        {tab === 'history' && <SupplierStatementHistory />}
        {tab === 'communications' && <SupplierCommunications />}
        {tab === 'aged' && <SupplierAgedCreditors />}
        {tab === 'security' && <SupplierSecurity />}
        {tab === 'settings' && <SupplierSettings />}
      </div>
    </QueryClientProvider>
  );
}
