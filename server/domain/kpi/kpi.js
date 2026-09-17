import { loadAssumptions } from "../../config/assumptions.js";

/**
 * Operational KPIs, computed from the invoices and their audit events.
 *
 * Nothing here is stored or incremented: a counter that is written separately
 * from the process is a second source of truth and drifts. Every figure is a
 * query over what actually happened.
 */
export async function computeKpis({ pool }, env = process.env) {
  const assumptions = loadAssumptions(env);
  const [volume, automation, exceptions, byReason, risk, workload, cycle] = await Promise.all([
    queryVolume(pool), queryAutomation(pool), queryExceptions(pool), queryExceptionReasons(pool),
    queryRisk(pool), queryWorkload(pool), queryCycle(pool),
  ]);

  const processed = volume.processed;
  const manualTouch = processed - automation.straight_through;
  const clean = Math.max(processed - exceptions.count, 0);

  const hoursSavedRaw =
    (clean * (assumptions.manual_minutes_clean - assumptions.system_minutes_clean) +
      exceptions.count * (assumptions.manual_minutes_exception - assumptions.system_minutes_exception)) / 60;
  const hoursSaved = Math.round(hoursSavedRaw * 10) / 10;

  return {
    generated_at: new Date().toISOString(),
    volume,
    automation: {
      straight_through: automation.straight_through,
      manual_touch: manualTouch,
      stp_rate: ratio(automation.straight_through, processed),
    },
    exceptions: { count: exceptions.count, rate: ratio(exceptions.count, processed), by_reason: byReason },
    risk,
    workload,
    cycle,
    economics: {
      assumptions,
      basis_invoices: processed,
      hours_saved: hoursSaved,
      cost_saved_eur: Math.round(hoursSavedRaw * assumptions.hourly_cost_eur),
      minutes_per_invoice_now: processed === 0 ? 0 : round1(
        (clean * assumptions.system_minutes_clean + exceptions.count * assumptions.system_minutes_exception) / processed,
      ),
    },
  };
}

const ratio = (part, total) => (total === 0 ? 0 : Math.round((part / total) * 10000) / 10000);
const round1 = (n) => Math.round(n * 10) / 10;
const int = (value) => Number(value ?? 0);

async function queryVolume(pool) {
  const { rows: [row] } = await pool.query(
    `select count(*)::int as received,
            count(*) filter (where state <> 'DUPLICATE')::int as processed,
            count(*) filter (where state = 'DUPLICATE')::int as duplicates
     from finops.invoices`,
  );
  return { received: int(row.received), processed: int(row.processed), duplicates: int(row.duplicates) };
}

async function queryAutomation(pool) {
  // "Straight through" means the decision to approve was made without a human,
  // which is exactly the auto_approved event. Later human steps such as the
  // accounting handoff do not retroactively make it manual.
  const { rows: [row] } = await pool.query(
    `select count(distinct e.invoice_id)::int as n
     from finops.audit_events e where e.action = 'auto_approved'`,
  );
  return { straight_through: int(row.n) };
}

async function queryExceptions(pool) {
  const { rows: [row] } = await pool.query(
    "select count(*)::int as n from finops.invoices where had_exception and state <> 'DUPLICATE'",
  );
  return { count: int(row.n) };
}

async function queryExceptionReasons(pool) {
  const { rows } = await pool.query(
    `select coalesce(e.reason, 'UNBEKANNT') as reason, count(distinct e.invoice_id)::int as count
     from finops.audit_events e
     where e.to_state = 'REVIEW_REQUIRED'
     group by 1 order by count desc, reason`,
  );
  return rows.map((r) => ({ reason: r.reason, count: int(r.count) }));
}

async function queryRisk(pool) {
  const failed = async (checkCode) => {
    const { rows: [row] } = await pool.query(
      "select count(distinct invoice_id)::int as n from finops.validation_results where check_code = $1 and status = 'FAILED'",
      [checkCode],
    );
    return int(row.n);
  };
  const { rows: [dup] } = await pool.query(
    "select count(*)::int as n from finops.audit_events where action = 'duplicate_file_detected'",
  );
  const [iban, po, duplicateNumber, buyer] = await Promise.all([
    failed("supplier_iban_match"), failed("po_amount_within_tolerance"),
    failed("duplicate_invoice_number"), failed("buyer_is_us"),
  ]);
  return { duplicate_attempts: int(dup.n), iban_alerts: iban, po_mismatches: po, duplicate_numbers: duplicateNumber, buyer_mismatches: buyer };
}

async function queryWorkload(pool) {
  const { rows: [row] } = await pool.query(
    `select count(*) filter (where state = 'REVIEW_REQUIRED')::int as awaiting_review,
            count(*) filter (where state = 'READY_FOR_APPROVAL')::int as awaiting_approval,
            count(*) filter (where state = 'INFO_REQUESTED')::int as awaiting_information,
            count(*) filter (where state = 'RECONCILIATION_EXCEPTION')::int as reconciliation_exceptions,
            -- Overdue means the supplier has not been paid. Everything from
            -- PAID onwards is settled, including a reconciliation that is
            -- still unclear: that is bookkeeping work, counted on its own
            -- above, not an unpaid bill.
            count(*) filter (
              where due_date is not null and due_date <= current_date + 7
                and state not in ('PAID','RECONCILED','RECONCILIATION_EXCEPTION','REJECTED','DUPLICATE')
            )::int as due_within_7_days,
            count(*) filter (
              where due_date is not null and due_date < current_date
                and state not in ('PAID','RECONCILED','RECONCILIATION_EXCEPTION','REJECTED','DUPLICATE')
            )::int as overdue
     from finops.invoices`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, int(v)]));
}

async function queryCycle(pool) {
  // Medians, not averages: one invoice parked over a weekend should not move
  // the headline. Null when nothing has reached the stage, because "no data"
  // and "instant" are different answers.
  const { rows: [row] } = await pool.query(
    `with review_visits as (
       -- How long an exception sits in the review queue before someone clears
       -- it. Each entry into review is paired with its own exit: an invoice
       -- can enter review more than once, and READY_FOR_APPROVAL ->
       -- INFO_REQUESTED -> REVIEW_REQUIRED puts an earlier approval entry
       -- before a later review entry, which subtracted blindly is negative.
       -- A visit still open has no duration yet and is left out.
       select extract(epoch from (
                (select min(x.occurred_at) from finops.audit_events x
                 where x.invoice_id = e.invoice_id
                   and x.occurred_at > e.occurred_at
                   and x.to_state <> 'REVIEW_REQUIRED')
                - e.occurred_at)) / 3600.0 as hours
       from finops.audit_events e
       where e.to_state = 'REVIEW_REQUIRED'
     ),
     approved as (
       select e.invoice_id,
              min(e.occurred_at) filter (where e.to_state = 'APPROVED') as approved_at,
              min(e.occurred_at) filter (where e.to_state = 'RECEIVED') as received_at,
              min(e.occurred_at) filter (where e.to_state = 'READY_FOR_APPROVAL') as released_at
       from finops.audit_events e group by e.invoice_id
     )
     select count(*) filter (where approved_at is not null)::int as approved_count,
            percentile_cont(0.5) within group (
              order by extract(epoch from (approved_at - received_at)) / 3600.0
            ) filter (where approved_at is not null and received_at is not null) as median_processing_hours,
            -- Split out the human path: the overall median is dominated by
            -- straight-through invoices approved within seconds, which hides
            -- how long a touched invoice actually takes.
            percentile_cont(0.5) within group (
              order by extract(epoch from (approved_at - received_at)) / 3600.0
            ) filter (where approved_at is not null and received_at is not null and released_at is not null)
              as median_processing_hours_touched,
            percentile_cont(0.5) within group (
              order by extract(epoch from (approved_at - released_at)) / 3600.0
            ) filter (where approved_at is not null and released_at is not null) as median_approval_hours,
            (select percentile_cont(0.5) within group (order by hours) from review_visits) as median_review_hours
     from approved`,
  );
  const hours = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100);
  return {
    approved_count: int(row.approved_count),
    median_processing_hours: hours(row.median_processing_hours),
    median_processing_hours_touched: hours(row.median_processing_hours_touched),
    median_approval_hours: hours(row.median_approval_hours),
    median_review_hours: hours(row.median_review_hours),
  };
}
