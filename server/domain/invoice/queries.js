import { openCreditsFor } from "../accounting/netting.js";
import { availableCents } from "../purchase-orders/commitments.js";
import { centsToDecimal, toCents } from "../money.js";

/** Read models for the API. No business logic here. */
/** One page of the list, newest first, and how many there are in all (ADR-066). */
export async function listInvoices(pool, { state, limit = 50, offset = 0 } = {}) {
  const { rows: [count] } = await pool.query(
    "select count(*)::int as total from finops.invoices where ($1::text is null or state = $1::finops.invoice_state)",
    [state ?? null],
  );
  const { rows } = await pool.query(
    `select i.id, i.state, i.review_reason, i.received_at, i.source_channel, i.original_filename,
            i.invoice_number, i.issue_date, i.due_date, i.supplier_name_raw, i.gross_amount, i.currency,
            s.supplier_no, s.legal_name as supplier_name,
            (select count(*) from finops.approval_steps a where a.invoice_id = i.id and a.status = 'PENDING')::int as pending_steps,
            last.action as last_action, last.occurred_at as last_action_at
     from finops.invoices i
     left join finops.suppliers s on s.id = i.supplier_id
     left join lateral (
       select action, occurred_at from finops.audit_events e where e.invoice_id = i.id order by occurred_at desc, id desc limit 1
     ) last on true
     where ($1::text is null or i.state = $1::finops.invoice_state)
     order by i.received_at desc, i.id
     limit $2 offset $3`,
    [state ?? null, limit, offset],
  );
  return { rows, total: count.total };
}

/** Invoices per state, for the navigation. */
export async function countInvoices(pool) {
  const { rows } = await pool.query("select state, count(*)::int as n from finops.invoices group by state order by state");
  return {
    total: rows.reduce((sum, r) => sum + r.n, 0),
    by_state: Object.fromEntries(rows.map((r) => [r.state, r.n])),
  };
}

export async function getInvoiceDetail(pool, id) {
  const { rows: [invoice] } = await pool.query(
    `select i.*, s.supplier_no, s.legal_name as supplier_name, s.status as supplier_status, s.default_cost_center,
            p.po_number, p.remaining_amount as po_remaining_amount, p.approved_amount as po_approved_amount, p.cost_center as po_cost_center,
            d.invoice_number as duplicate_of_number,
            -- What this document has had applied to it, either way round.
            coalesce((
              select sum(a.amount) from finops.credit_applications a
              where (a.invoice_id = i.id or a.credit_note_id = i.id) and a.released_at is null
            ), 0) as credit_applied_amount
     from finops.invoices i
     left join finops.suppliers s on s.id = i.supplier_id
     left join finops.purchase_orders p on p.id = i.purchase_order_id
     left join finops.invoices d on d.id = i.duplicate_of
     where i.id = $1`,
    [id],
  );
  if (!invoice) return null;
  const [lines, results, decision, steps, events, accounting, payment, bankTx, openCredit, poAvailable] = await Promise.all([
    pool.query("select * from finops.invoice_lines where invoice_id = $1 order by line_no", [id]),
    pool.query(
      `select * from finops.validation_results where invoice_id = $1
         and run_no = (select max(run_no) from finops.validation_results where invoice_id = $1)
       order by phase, id`, [id],
    ),
    pool.query("select * from finops.routing_decisions where invoice_id = $1 order by run_no desc limit 1", [id]),
    pool.query(
      `select a.*, u.name as actor_name from finops.approval_steps a left join finops.users u on u.id = a.actor_id
       where a.invoice_id = $1 order by a.step_no`, [id],
    ),
    pool.query(
      `select e.*, u.name as actor_name from finops.audit_events e left join finops.users u on u.id = e.actor_id
       where e.invoice_id = $1 order by e.occurred_at, e.id`, [id],
    ),
    pool.query("select * from finops.accounting_records where invoice_id = $1 order by reverses_document_no nulls first, tax_key", [id]),
    // The latest attempt: a failed one stays on record, a retry supersedes it (ADR-055).
    pool.query("select * from finops.payment_instructions where invoice_id = $1 order by created_at desc limit 1", [id]),
    pool.query("select * from finops.bank_transactions where matched_invoice_id = $1 order by value_date", [id]),
    openCreditCents(pool, invoice),
    invoice.purchase_order_id ? availableCents(pool, invoice.purchase_order_id, id, { lock: false }) : null,
  ]);
  const { file_path, parsed, ...rest } = invoice;
  return {
    ...rest,
    parsed,
    // The domain's own answers, so what the screen offers is what the payment
    // and the PO check will do: credits that would be netted, and the order's
    // capacity net of other invoices' claims.
    open_credit_amount: centsToDecimal(openCredit),
    po_available_amount: centsToDecimal(poAvailable),
    lines: lines.rows,
    validation: { technical: results.rows.filter((r) => r.phase === "TECHNICAL"), business: results.rows.filter((r) => r.phase === "BUSINESS") },
    routing: decision.rows[0] ?? null,
    approval_steps: steps.rows,
    audit_events: events.rows,
    // One line per tax rate (ADR-053); the record is what they share.
    accounting_record: accounting.rows[0] ?? null,
    accounting_lines: accounting.rows.filter((l) => !l.reverses_document_no),
    // Written when a booked invoice is cancelled (ADR-054).
    accounting_reversal: accounting.rows.filter((l) => l.reverses_document_no),
    payment: payment.rows[0] ?? null,
    bank_transactions: bankTx.rows,
  };
}

async function openCreditCents(pool, invoice) {
  const credits = await openCreditsFor(pool, invoice.supplier_id, invoice.currency ?? "EUR", invoice.id, { lock: false });
  return credits.reduce((sum, credit) => sum + toCents(credit.open_amount), 0);
}
