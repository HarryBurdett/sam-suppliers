/**
 * Initial schema for the suppliers per-app database.
 *
 * Mirrors the Python SQLite tables in
 * data/{company}/suppliers/supplier_statements.db plus the extraction
 * cache from supplier_extraction_cache.db.
 *
 * The suppliers app is incomplete in Python. Schema is included
 * for the parts that ARE used; new features added during the TS
 * port will append migrations 002, 003, etc.
 */
import type { Knex } from 'knex';
export declare function up(knex: Knex): Promise<void>;
export declare function down(knex: Knex): Promise<void>;
//# sourceMappingURL=001_initial_schema.d.ts.map