export async function getCreditorsDashboard(operaDb) {
    try {
        const rows = (await operaDb.raw(`SELECT
         COUNT(*) AS total_suppliers,
         SUM(ISNULL(pn_currbal, 0)) AS total_outstanding
       FROM pname WITH (NOLOCK)
       WHERE pn_dormant = 0 OR pn_dormant IS NULL`));
        const r = rows[0];
        const overdueRows = (await operaDb.raw(`SELECT COUNT(DISTINCT pt_account) AS overdue
       FROM ptran WITH (NOLOCK)
       WHERE pt_trbal > 0
         AND pt_dueday < GETDATE()`));
        return {
            success: true,
            total_suppliers: Number(r?.total_suppliers ?? 0),
            total_outstanding: Number(r?.total_outstanding ?? 0),
            overdue_count: Number(overdueRows[0]?.overdue ?? 0),
        };
    }
    catch (err) {
        return {
            success: false,
            total_suppliers: 0,
            total_outstanding: 0,
            overdue_count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function getCreditorsReport(operaDb) {
    try {
        const rows = (await operaDb.raw(`SELECT
         RTRIM(pn_account) AS account,
         RTRIM(pn_name) AS name,
         ISNULL(pn_currbal, 0) AS current_balance,
         pn_credlim AS credit_limit,
         RTRIM(ISNULL(pn_email, '')) AS contact_email
       FROM pname WITH (NOLOCK)
       WHERE (pn_dormant = 0 OR pn_dormant IS NULL)
         AND pn_currbal <> 0
       ORDER BY pn_name`));
        return { success: true, suppliers: rows ?? [] };
    }
    catch (err) {
        return {
            success: false,
            suppliers: [],
            error: err?.message ?? String(err),
        };
    }
}
export async function searchCreditors(operaDb, query) {
    if (!query || query.length < 2) {
        return { success: true, suppliers: [] };
    }
    try {
        const pattern = `%${query.toUpperCase()}%`;
        const rows = (await operaDb.raw(`SELECT TOP 50
         RTRIM(pn_account) AS account,
         RTRIM(pn_name) AS name,
         ISNULL(pn_currbal, 0) AS current_balance,
         pn_credlim AS credit_limit,
         RTRIM(ISNULL(pn_email, '')) AS contact_email
       FROM pname WITH (NOLOCK)
       WHERE (UPPER(pn_account) LIKE ? OR UPPER(pn_name) LIKE ?)
         AND (pn_dormant = 0 OR pn_dormant IS NULL)
       ORDER BY pn_name`, [pattern, pattern]));
        return { success: true, suppliers: rows ?? [] };
    }
    catch (err) {
        return {
            success: false,
            suppliers: [],
            error: err?.message ?? String(err),
        };
    }
}
export async function getCreditorsSupplier(operaDb, account) {
    try {
        const rows = (await operaDb.raw(`SELECT TOP 1
         RTRIM(pn_account) AS account,
         RTRIM(pn_name) AS name,
         ISNULL(pn_currbal, 0) AS current_balance,
         pn_credlim AS credit_limit,
         RTRIM(ISNULL(pn_email, '')) AS contact_email
       FROM pname WITH (NOLOCK)
       WHERE RTRIM(pn_account) = ?`, [account]));
        if (!rows[0])
            return { success: false, error: 'Supplier not found' };
        return { success: true, supplier: rows[0] };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function getCreditorsSupplierTransactions(operaDb, account) {
    try {
        const rows = (await operaDb.raw(`SELECT TOP 200
         pt_trdate AS date,
         RTRIM(pt_trref) AS reference,
         RTRIM(pt_trtype) AS type,
         pt_trvalue AS value,
         pt_trbal AS balance,
         RTRIM(ISNULL(pt_memo, '')) AS comment
       FROM ptran WITH (NOLOCK)
       WHERE RTRIM(pt_account) = ?
       ORDER BY pt_trdate DESC`, [account]));
        return {
            success: true,
            transactions: rows.map((r) => ({
                date: r.date instanceof Date
                    ? r.date.toISOString().slice(0, 10)
                    : String(r.date ?? '').slice(0, 10),
                reference: r.reference ?? '',
                type: r.type ?? '',
                value: Number(r.value ?? 0),
                balance: Number(r.balance ?? 0),
                comment: r.comment ?? '',
            })),
        };
    }
    catch (err) {
        return {
            success: false,
            transactions: [],
            error: err?.message ?? String(err),
        };
    }
}
// ---------------------------------------------------------------------
// Supplier-statement extras (PDF, response, status)
// ---------------------------------------------------------------------
export async function getStatementPdf(appDb, statementId) {
    try {
        const row = (await appDb('supplier_statements')
            .where({ id: statementId })
            .select('pdf_path')
            .first());
        if (!row?.pdf_path) {
            return { success: false, error: 'No PDF stored for this statement' };
        }
        return {
            success: true,
            pdf_path: row.pdf_path,
            filename: row.pdf_path.split(/[/\\]/).pop() ?? '',
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
async function callLlmText(llm, prompt, context) {
    const stream = llm.chat({
        messages: [{ role: 'user', content: `${prompt}\n\n${context}` }],
        model: 'claude-sonnet-4',
        maxTokens: 4000,
        temperature: 0.2,
    });
    const buf = [];
    for await (const chunk of stream) {
        if (typeof chunk === 'string')
            buf.push(chunk);
        else if (chunk && typeof chunk === 'object') {
            const c = chunk;
            if (typeof c.text === 'string')
                buf.push(c.text);
            else if (c.delta?.text)
                buf.push(c.delta.text);
        }
    }
    return buf.join('').trim();
}
export async function previewStatementResponse(appDb, llm, statementId) {
    if (!llm)
        return { success: false, error: 'ctx.llm not configured' };
    try {
        const stmt = (await appDb('supplier_statements')
            .where({ id: statementId })
            .first());
        if (!stmt)
            return { success: false, error: 'Statement not found' };
        const lines = (await appDb('statement_lines')
            .where({ statement_id: statementId })
            .select('reference', 'amount', 'status'));
        const queries = lines.filter((l) => l.status === 'Query');
        const context = `Supplier: ${stmt.supplier_code}\n` +
            `Statement date: ${stmt.statement_date}\n` +
            `Closing balance: £${Number(stmt.closing_balance ?? 0).toFixed(2)}\n` +
            `Lines flagged for query: ${queries.length}\n\n` +
            queries
                .map((q) => `  - ${q.reference} £${Number(q.amount).toFixed(2)}`)
                .join('\n');
        const body = await callLlmText(llm, 'Draft a polite, professional reply to this supplier statement explaining the queries we have. UK accounting tone, plain text, no salutation/sign-off.', context);
        return {
            success: true,
            body,
            subject: `Statement Reconciled — ${stmt.supplier_code}`,
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function sendUpdatedStatementStatus(appDb, statementId, status, by) {
    try {
        const updated = await appDb('supplier_statements')
            .where({ id: statementId })
            .update({
            status,
            updated_at: appDb.fn.now(),
        });
        if (!updated)
            return { success: false, error: 'Statement not found' };
        await appDb('supplier_communications').insert({
            supplier_code: '',
            channel: 'system',
            subject: `Statement status updated to ${status}`,
            content: `Statement ${statementId} updated by ${by}`,
            sent_at: appDb.fn.now(),
        });
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
const EXTRACTION_PROMPT = `You are a supplier-statement parser. Extract the
following from this document and return ONLY a JSON object:

{
  "supplier_code": "<supplier account if visible>",
  "statement_date": "<YYYY-MM-DD>",
  "opening_balance": <number or null>,
  "closing_balance": <number or null>,
  "currency": "GBP",
  "lines": [
    {
      "line_date": "<YYYY-MM-DD>",
      "reference": "<invoice/credit/payment reference>",
      "description": "<short>",
      "amount": <signed number — invoices positive, payments negative>
    }
  ]
}`;
export async function extractStatementFromText(llm, content) {
    if (!llm)
        return { success: false, error: 'ctx.llm not configured' };
    try {
        const raw = await callLlmText(llm, EXTRACTION_PROMPT, content);
        const cleaned = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        const parsed = JSON.parse(cleaned);
        const lines = Array.isArray(parsed.lines)
            ? parsed.lines.map((l) => ({
                line_date: typeof l.line_date === 'string' ? l.line_date : null,
                reference: typeof l.reference === 'string' ? l.reference : '',
                description: typeof l.description === 'string' ? l.description : '',
                amount: Number(l.amount ?? 0),
            }))
            : [];
        return {
            success: true,
            extraction: {
                supplier_code: typeof parsed.supplier_code === 'string' ? parsed.supplier_code : null,
                statement_date: typeof parsed.statement_date === 'string' ? parsed.statement_date : null,
                opening_balance: typeof parsed.opening_balance === 'number' ? parsed.opening_balance : null,
                closing_balance: typeof parsed.closing_balance === 'number' ? parsed.closing_balance : null,
                currency: typeof parsed.currency === 'string' ? parsed.currency : 'GBP',
                lines,
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
// ---------------------------------------------------------------------
// process-email + reconcile + reconciliations
// ---------------------------------------------------------------------
export async function processStatementEmail(appDb, emailId) {
    // Look for existing statement record linked to this email; if not,
    // mark as queued for processing. The actual extraction happens via
    // extract-from-email + the existing process flow.
    if (!Number.isFinite(emailId) || emailId <= 0) {
        return { success: false, error: 'invalid email_id' };
    }
    try {
        const existing = (await appDb('supplier_statements')
            .where({ source: 'email', source_ref: emailId.toString() })
            .first());
        if (existing?.id) {
            return { success: true, statement_id: existing.id };
        }
        return {
            success: false,
            error: 'No statement record found for this email. Use /api/supplier-statements/extract-from-email first to create one.',
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function reconcileStatementByEmail(appDb, emailId) {
    if (!Number.isFinite(emailId) || emailId <= 0) {
        return { success: false, error: 'invalid email_id' };
    }
    try {
        const existing = (await appDb('supplier_statements')
            .where({ source: 'email', source_ref: emailId.toString() })
            .first());
        if (!existing)
            return { success: false, error: 'No statement found for email' };
        return {
            success: true,
            statement_id: existing.id,
            status: existing.status,
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function listReconciliations(appDb) {
    try {
        const rows = (await appDb('supplier_statements as ss')
            .leftJoin('statement_lines as sl', 'sl.statement_id', 'ss.id')
            .whereIn('ss.status', ['reconciled', 'approved', 'sent', 'queued'])
            .groupBy('ss.id')
            .select('ss.id', 'ss.supplier_code', 'ss.statement_date', 'ss.status', 'ss.approved_at', appDb.raw("SUM(CASE WHEN sl.status = 'Agreed' THEN 1 ELSE 0 END) AS matched_count"), appDb.raw("SUM(CASE WHEN sl.status = 'Query' THEN 1 ELSE 0 END) AS query_count"))
            .orderBy('ss.statement_date', 'desc'));
        return {
            success: true,
            reconciliations: rows.map((r) => ({
                id: Number(r.id),
                supplier_code: r.supplier_code,
                statement_date: r.statement_date instanceof Date
                    ? r.statement_date.toISOString().slice(0, 10)
                    : String(r.statement_date ?? '').slice(0, 10),
                status: r.status ?? '',
                matched_count: Number(r.matched_count ?? 0),
                query_count: Number(r.query_count ?? 0),
                approved_at: r.approved_at
                    ? r.approved_at instanceof Date
                        ? r.approved_at.toISOString()
                        : String(r.approved_at)
                    : null,
            })),
        };
    }
    catch (err) {
        return {
            success: false,
            reconciliations: [],
            error: err?.message ?? String(err),
        };
    }
}
export async function getFlaggedEmails(appDb) {
    try {
        // Use change-audit rows with field_name = 'pn_email' as the
        // canonical "flagged email" set — matches Python's behaviour
        // which derives email flags from the change audit.
        const rows = (await appDb('supplier_change_audit')
            .where({ changed_field: 'pn_email', verified: false })
            .orderBy('changed_at', 'desc')
            .select('id', 'supplier_code', 'new_value', 'changed_by', 'changed_at'));
        return {
            success: true,
            flags: rows.map((r) => ({
                id: Number(r.id),
                supplier_code: r.supplier_code,
                email_address: r.new_value ?? '',
                flag_type: 'email_changed',
                flagged_at: r.changed_at instanceof Date
                    ? r.changed_at.toISOString()
                    : String(r.changed_at),
            })),
        };
    }
    catch (err) {
        return { success: false, flags: [], error: err?.message ?? String(err) };
    }
}
// ---------------------------------------------------------------------
// supplier/account/* — single-supplier lookups
// ---------------------------------------------------------------------
export async function getSupplierAccountByCode(operaDb, account) {
    try {
        const rows = (await operaDb.raw(`SELECT TOP 1
         RTRIM(pn_account) AS account,
         RTRIM(pn_name) AS name,
         RTRIM(ISNULL(pn_email, '')) AS email,
         RTRIM(ISNULL(pn_teleno, '')) AS phone,
         RTRIM(ISNULL(pn_addr1, '')) AS address
       FROM pname WITH (NOLOCK)
       WHERE RTRIM(pn_account) = ?`, [account]));
        if (!rows[0])
            return { success: false, error: 'Supplier not found' };
        return { success: true, supplier: rows[0] };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function getFirstSupplierAccount(operaDb) {
    try {
        const rows = (await operaDb.raw(`SELECT TOP 1
         RTRIM(pn_account) AS account,
         RTRIM(pn_name) AS name,
         RTRIM(ISNULL(pn_email, '')) AS email,
         RTRIM(ISNULL(pn_teleno, '')) AS phone,
         RTRIM(ISNULL(pn_addr1, '')) AS address
       FROM pname WITH (NOLOCK)
       WHERE pn_dormant = 0 OR pn_dormant IS NULL
       ORDER BY pn_account`));
        if (!rows[0])
            return { success: false, error: 'No suppliers found' };
        return { success: true, supplier: rows[0] };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=misc-endpoints.js.map