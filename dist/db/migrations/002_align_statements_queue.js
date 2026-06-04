export async function up(knex) {
    const hasStatus = await knex.schema.hasColumn('supplier_statements', 'status');
    if (!hasStatus) {
        await knex.schema.alterTable('supplier_statements', (table) => {
            table.string('status', 32).defaultTo('received').index();
            table.timestamp('received_date').defaultTo(knex.fn.now()).index();
            table.string('sender_email', 200);
            table.string('currency', 3).defaultTo('GBP');
            table.text('error_message');
            table.timestamp('acknowledged_at');
            table.timestamp('processed_at');
            table.string('approved_by', 64);
            table.timestamp('approved_at');
            table.timestamp('sent_at');
        });
    }
    const hasLineStatus = await knex.schema.hasColumn('statement_lines', 'status');
    if (!hasLineStatus) {
        await knex.schema.alterTable('statement_lines', (table) => {
            // Mirror Python's column. 'Agreed', 'Query', 'Posted', 'Pending'.
            table.string('status', 16).defaultTo('Pending');
        });
    }
    await knex.schema.createTable('supplier_queries', (table) => {
        table.increments('id').primary();
        table.string('supplier_code', 32).notNullable();
        table.integer('statement_id');
        table.integer('line_id');
        table.string('reference', 100);
        table.decimal('amount', 12, 2);
        table.string('query_type', 32);
        table.string('status', 16).defaultTo('open'); // open / resolved / cancelled
        table.text('description');
        table.text('resolution_notes');
        table.string('resolved_by', 64);
        table.timestamp('resolved_at');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('reminder_sent_at');
        table.integer('reminder_count').defaultTo(0);
        table.index('supplier_code');
        table.index('status');
        table.index('statement_id');
    });
}
export async function down(knex) {
    await knex.schema.dropTableIfExists('supplier_queries');
    if (await knex.schema.hasColumn('statement_lines', 'status')) {
        await knex.schema.alterTable('statement_lines', (table) => {
            table.dropColumn('status');
        });
    }
    const hasStatus = await knex.schema.hasColumn('supplier_statements', 'status');
    if (hasStatus) {
        await knex.schema.alterTable('supplier_statements', (table) => {
            table.dropColumn('sent_at');
            table.dropColumn('approved_at');
            table.dropColumn('approved_by');
            table.dropColumn('processed_at');
            table.dropColumn('acknowledged_at');
            table.dropColumn('error_message');
            table.dropColumn('currency');
            table.dropColumn('sender_email');
            table.dropColumn('received_date');
            table.dropColumn('status');
        });
    }
}
//# sourceMappingURL=002_align_statements_queue.js.map