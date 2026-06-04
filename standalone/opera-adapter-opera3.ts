/**
 * Opera 3 (VFP / FoxPro) adapter — SCAFFOLD.
 *
 * Opera 3 stores data as DBF (FoxPro) files on a Windows SMB share.
 * Node has no first-class VFP driver, so production read/write goes
 * through a small out-of-process agent — either a SAM-provided
 * service (in SAM-plugged mode) or a generally-available helper
 * the operator deploys alongside this server (standalone).
 *
 * This file is a *scaffold*: it implements the `OperaAdapter`
 * interface so the rest of the host can already select it, but
 * `getCompanyDb()` returns null with a clear warn log until a real
 * agent is wired in.
 */
import type { Knex } from 'knex';
import type { OperaAdapter } from './opera-adapter.js';
import type { AppLogger } from '../src/app-context.js';

export interface CompanyMapping {
  database: string;
  operaVersion?: string;
}

export interface Opera3AdapterConfig {
  agentUrl: string | null;
  agentKey: string | null;
  dataPath: string | null;
  companies: ReadonlyMap<string, CompanyMapping>;
  logger: AppLogger;
}

export interface Opera3Adapter extends OperaAdapter {
  destroy(): Promise<void>;
}

function isOpera3(version: string | undefined): boolean {
  if (!version) return false;
  const v = version.toLowerCase();
  return v === '3' || v === 'opera-3' || v === 'opera3';
}

export function buildOpera3Adapter(config: Opera3AdapterConfig): Opera3Adapter {
  const companyMap = new Map(config.companies);

  function getCompanyDb(code: string): Knex | null {
    const mapping = companyMap.get(code);
    if (!mapping) return null;
    if (!isOpera3(mapping.operaVersion)) return null;

    if (!config.agentUrl) {
      config.logger.warn(
        `[opera-3] company "${code}" is opera-3 but no OPERA3_AGENT_URL is configured. ` +
          `Opera-backed endpoints will fail until an opera-3 agent is wired in.`,
      );
      return null;
    }
    config.logger.warn(
      `[opera-3] company "${code}" requested but the opera-3 adapter is not yet implemented. ` +
        `agentUrl=${config.agentUrl}; see standalone/opera-adapter-opera3.ts for the integration seam.`,
    );
    return null;
  }

  async function invalidateCompany(
    code: string,
    mapping: CompanyMapping | null,
  ): Promise<void> {
    if (mapping) {
      companyMap.set(code, mapping);
    } else {
      companyMap.delete(code);
    }
  }

  async function destroy(): Promise<void> {
    // No persistent resources yet — agent calls are stateless HTTP.
  }

  return {
    operaType: 'opera-3',
    getCompanyDb,
    invalidateCompany,
    destroy,
  };
}
