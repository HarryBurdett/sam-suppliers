function emptySummaryBuckets() {
    return {
        days_90: 0,
        days_60: 0,
        days_30: 0,
        current: 0,
        total: 0,
        unallocated: 0,
    };
}
function emptyTrendBuckets() {
    return {
        days_90: 0,
        days_60: 0,
        days_30: 0,
        current: 0,
        days_120_plus: 0,
        total: 0,
        unallocated: 0,
    };
}
function parseDate(v) {
    if (!v)
        return null;
    if (v instanceof Date)
        return Number.isNaN(v.getTime()) ? null : v;
    if (typeof v !== 'string')
        return null;
    const s = v.trim().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const d = new Date(`${s}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    // dd/mm/yyyy fallback
    const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) {
        const d = new Date(`${m2[3]}-${m2[2]}-${m2[1]}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}
function daysBetween(a, b) {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / 86_400_000);
}
function lastDayOfMonth(year, month) {
    // month is 1-based here
    const next = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    return new Date(next.getTime() - 86_400_000);
}
function classifyAging(daysOld) {
    if (daysOld <= 30)
        return 'current';
    if (daysOld <= 60)
        return 'days_30';
    if (daysOld <= 90)
        return 'days_60';
    if (daysOld <= 120)
        return 'days_90';
    return 'days_120_plus';
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
export async function getAgedCreditorsSummary(operaDb) {
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        let periodLabel = '30 Days';
        let periodMode = 'days';
        let periodDays = 30;
        try {
            const pparm = (await operaDb('pparm')
                .select('pp_period', 'pp_percday')
                .first());
            if (pparm) {
                const pp = (pparm.pp_period ?? '').toString().trim();
                const pd = Number(pparm.pp_percday ?? 0) || 0;
                if (pp) {
                    periodLabel = pp;
                    if (pp.toLowerCase().includes('month'))
                        periodMode = 'months';
                    else if (pd > 0)
                        periodDays = Math.floor(pd);
                }
            }
        }
        catch {
            // pparm not available — use defaults
        }
        const rows = (await operaDb({ p: 'ptran' })
            .innerJoin({ n: 'pname' }, 'n.pn_account', 'p.pt_account')
            .select(operaDb.raw('RTRIM(p.pt_account) AS account'), operaDb.raw('RTRIM(n.pn_name) AS name'), 'n.pn_currbal', 'p.pt_trbal', 'p.pt_trdate', 'p.pt_dueday', operaDb.raw('RTRIM(p.pt_trtype) AS pt_trtype'), operaDb.raw('RTRIM(p.pt_paid) AS pt_paid'), operaDb.raw("RTRIM(ISNULL(p.pt_fcurr, '')) AS pt_fcurr"), operaDb.raw('ISNULL(p.pt_fcrate, 0) AS pt_fcrate'), operaDb.raw('ISNULL(p.pt_fcbal, 0) AS pt_fcbal'), operaDb.raw('ISNULL(p.pt_fcdec, 0) AS pt_fcdec'))
            .whereRaw('p.pt_trbal <> 0')
            .andWhereRaw('n.pn_currbal <> 0')
            .orderBy('p.pt_account'));
        if (!rows.length) {
            return {
                success: true,
                summary: emptySummaryBuckets(),
                suppliers: [],
                period_mode: periodMode,
                period_label: periodLabel,
                column_labels: {
                    days_90: '90+ Days',
                    days_60: '60 Days',
                    days_30: '30 Days',
                    current: 'Current',
                },
            };
        }
        const supplierData = new Map();
        const summary = emptySummaryBuckets();
        for (const r of rows) {
            const account = (r.account ?? '').trim();
            const name = (r.name ?? '').trim();
            const balance = Number(r.pt_trbal ?? 0);
            const currbal = Number(r.pn_currbal ?? 0);
            const ageDate = parseDate(r.pt_trdate) ?? today;
            let bucket;
            if (periodMode === 'months') {
                const monthsOld = (today.getUTCFullYear() - ageDate.getUTCFullYear()) * 12 +
                    (today.getUTCMonth() - ageDate.getUTCMonth());
                if (monthsOld <= 0)
                    bucket = 'current';
                else if (monthsOld === 1)
                    bucket = 'days_30';
                else if (monthsOld === 2)
                    bucket = 'days_60';
                else
                    bucket = 'days_90';
            }
            else {
                const daysOld = Math.max(0, daysBetween(ageDate, today));
                if (daysOld < periodDays)
                    bucket = 'current';
                else if (daysOld < periodDays * 2)
                    bucket = 'days_30';
                else if (daysOld < periodDays * 3)
                    bucket = 'days_60';
                else
                    bucket = 'days_90';
            }
            const fcCurr = (r.pt_fcurr ?? '').trim();
            const fcRate = Number(r.pt_fcrate ?? 0);
            let fcBal = Number(r.pt_fcbal ?? 0);
            const fcDec = Math.floor(Number(r.pt_fcdec ?? 0));
            if (fcDec > 0 && fcBal !== 0)
                fcBal = fcBal / Math.pow(10, fcDec);
            let s = supplierData.get(account);
            if (!s) {
                s = {
                    account,
                    name,
                    days_90: 0,
                    days_60: 0,
                    days_30: 0,
                    current: 0,
                    balance: currbal,
                    unallocated: 0,
                    currency: fcCurr || 'GBP',
                    fc_rate: fcCurr ? fcRate : 0,
                    fc_balance: 0,
                };
                supplierData.set(account, s);
            }
            // Increment the bucket. The bucket key is one of the four
            // summary keys for this path.
            const sAsRec = s;
            sAsRec[bucket] = (sAsRec[bucket] ?? 0) + balance;
            if (fcCurr)
                s.fc_balance += fcBal;
        }
        const suppliers = [];
        for (const s of supplierData.values()) {
            const agingSum = s.days_90 + s.days_60 + s.days_30 + s.current;
            s.unallocated = round2(s.balance - agingSum);
            s.days_90 = round2(s.days_90);
            s.days_60 = round2(s.days_60);
            s.days_30 = round2(s.days_30);
            s.current = round2(s.current);
            s.balance = round2(s.balance);
            s.fc_balance = round2(s.fc_balance);
            suppliers.push(s);
            summary.days_90 += s.days_90;
            summary.days_60 += s.days_60;
            summary.days_30 += s.days_30;
            summary.current += s.current;
            summary.total += s.balance;
            summary.unallocated += s.unallocated;
        }
        summary.days_90 = round2(summary.days_90);
        summary.days_60 = round2(summary.days_60);
        summary.days_30 = round2(summary.days_30);
        summary.current = round2(summary.current);
        summary.total = round2(summary.total);
        summary.unallocated = round2(summary.unallocated);
        suppliers.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
        const columnLabels = periodMode === 'months'
            ? {
                days_90: '3 Months+',
                days_60: '2 Months',
                days_30: '1 Month',
                current: 'Current',
            }
            : {
                days_90: `${periodDays * 3}+ Days`,
                days_60: `${periodDays * 2} Days`,
                days_30: `${periodDays} Days`,
                current: 'Current',
            };
        return {
            success: true,
            summary,
            suppliers,
            period_mode: periodMode,
            period_label: periodLabel,
            column_labels: columnLabels,
        };
    }
    catch (err) {
        return {
            success: false,
            summary: emptySummaryBuckets(),
            suppliers: [],
            period_mode: 'days',
            period_label: '30 Days',
            column_labels: {},
            error: err?.message ?? String(err),
        };
    }
}
export async function getAgedCreditorsTrend(operaDb, months = 6) {
    try {
        const m = Math.min(24, Math.max(1, Math.floor(months)));
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const monthEnds = [];
        for (let i = 0; i < m; i++) {
            let mm = today.getUTCMonth() + 1 - i;
            let yy = today.getUTCFullYear();
            while (mm <= 0) {
                mm += 12;
                yy -= 1;
            }
            monthEnds.push(lastDayOfMonth(yy, mm));
        }
        monthEnds.reverse();
        const earliest = new Date(monthEnds[0].getTime() - 365 * 86_400_000);
        const rows = (await operaDb('ptran')
            .select('pt_trdate', 'pt_trvalue', 'pt_trbal', 'pt_trtype')
            .whereRaw('pt_trbal <> 0')
            .andWhere('pt_trdate', '>=', earliest.toISOString().slice(0, 10)));
        const trend = [];
        for (const monthEnd of monthEnds) {
            const buckets = emptyTrendBuckets();
            for (const r of rows ?? []) {
                const trDate = parseDate(r.pt_trdate);
                const balance = Number(r.pt_trbal ?? 0);
                if (!trDate || balance === 0)
                    continue;
                if (trDate > monthEnd)
                    continue;
                const daysOld = Math.max(0, daysBetween(trDate, monthEnd));
                const bucket = classifyAging(daysOld);
                const bAsRec = buckets;
                bAsRec[bucket] = (bAsRec[bucket] ?? 0) + balance;
                buckets.total += balance;
            }
            const ymd = monthEnd.toISOString().slice(0, 7);
            trend.push({
                month: ymd,
                current: round2(buckets.current),
                days_30: round2(buckets.days_30),
                days_60: round2(buckets.days_60),
                days_90: round2(buckets.days_90),
                days_120_plus: round2(buckets.days_120_plus),
                total: round2(buckets.total),
                unallocated: 0,
            });
        }
        return { success: true, trend };
    }
    catch (err) {
        return {
            success: false,
            trend: [],
            error: err?.message ?? String(err),
        };
    }
}
export async function getAgedCreditorsDetail(operaDb, account) {
    const acct = (account ?? '').trim();
    if (!acct)
        return { success: false, error: 'account required' };
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const nameRow = (await operaDb('pname')
            .select(operaDb.raw('RTRIM(pn_name) AS name'))
            .where('pn_account', acct)
            .first());
        if (!nameRow?.name) {
            return {
                success: false,
                error: `Supplier account '${acct}' not found`,
            };
        }
        const supplierName = nameRow.name.trim();
        const rows = (await operaDb('ptran')
            .select(operaDb.raw('RTRIM(pt_trref) AS ref'), 'pt_trdate', operaDb.raw('pt_trbal AS amount'), 'pt_trtype')
            .where('pt_account', acct)
            .andWhereRaw('pt_trbal <> 0')
            .orderBy('pt_trdate'));
        const aging = {
            current: [],
            days_30: [],
            days_60: [],
            days_90: [],
            days_120_plus: [],
        };
        const totals = emptyTrendBuckets();
        for (const r of rows ?? []) {
            const trDate = parseDate(r.pt_trdate);
            if (!trDate)
                continue;
            const amount = Number(r.amount ?? 0);
            const daysOld = Math.max(0, daysBetween(trDate, today));
            const bucket = classifyAging(daysOld);
            aging[bucket].push({
                ref: (r.ref ?? '').trim(),
                date: trDate.toISOString().slice(0, 10),
                amount: round2(amount),
                days_old: daysOld,
            });
            const tAsRec = totals;
            tAsRec[bucket] = (tAsRec[bucket] ?? 0) + amount;
            totals.total += amount;
        }
        totals.current = round2(totals.current);
        totals.days_30 = round2(totals.days_30);
        totals.days_60 = round2(totals.days_60);
        totals.days_90 = round2(totals.days_90);
        totals.days_120_plus = round2(totals.days_120_plus);
        totals.total = round2(totals.total);
        return {
            success: true,
            supplier: { account: acct, name: supplierName },
            aging,
            totals,
        };
    }
    catch (err) {
        return {
            success: false,
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=aged-creditors.js.map