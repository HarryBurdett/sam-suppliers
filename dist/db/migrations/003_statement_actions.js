export async function up(knex) {
    if (!(await knex.schema.hasColumn('supplier_statements', 'response_text'))) {
        await knex.schema.alterTable('supplier_statements', (table) => {
            table.text('response_text');
            table.string('response_subject', 500);
            table.string('email_pdf_path', 1000);
        });
    }
    if (!(await knex.schema.hasColumn('supplier_contacts_ext', 'is_statement_contact'))) {
        await knex.schema.alterTable('supplier_contacts_ext', (table) => {
            table.boolean('is_statement_contact').defaultTo(false);
            table.boolean('never_communicate').defaultTo(false);
        });
    }
    await knex.schema.createTable('supplier_automation_settings', (table) => {
        table.increments('id').primary();
        table.string('key', 64).notNullable().unique();
        table.text('value');
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
}
export async function down(knex) {
    await knex.schema.dropTableIfExists('supplier_automation_settings');
    if (await knex.schema.hasColumn('supplier_contacts_ext', 'is_statement_contact')) {
        await knex.schema.alterTable('supplier_contacts_ext', (table) => {
            table.dropColumn('never_communicate');
            table.dropColumn('is_statement_contact');
        });
    }
    if (await knex.schema.hasColumn('supplier_statements', 'response_text')) {
        await knex.schema.alterTable('supplier_statements', (table) => {
            table.dropColumn('email_pdf_path');
            table.dropColumn('response_subject');
            table.dropColumn('response_text');
        });
    }
}
//# sourceMappingURL=003_statement_actions.js.map