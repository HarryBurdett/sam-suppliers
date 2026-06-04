export async function up(knex) {
    if (!(await knex.schema.hasColumn('supplier_change_audit', 'verified'))) {
        await knex.schema.alterTable('supplier_change_audit', (table) => {
            table.boolean('verified').defaultTo(false).index();
            table.string('verified_by', 64);
            table.timestamp('verified_at');
        });
    }
}
export async function down(knex) {
    if (await knex.schema.hasColumn('supplier_change_audit', 'verified')) {
        await knex.schema.alterTable('supplier_change_audit', (table) => {
            table.dropColumn('verified_at');
            table.dropColumn('verified_by');
            table.dropColumn('verified');
        });
    }
}
//# sourceMappingURL=004_security_audit.js.map