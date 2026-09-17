/** Read models for the API. No business logic here. */
export async function listInvoices(pool, { state } = {}) {
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
     order by i.received_at desc`,
    [state ?? null],
  );
  return rows;
}

export async function getInvoiceDetail(pool, id) {
  const { rows: [invoice] } = await pool.query(
    `select i.*, s.supplier_no, s.legal_name as supplier_name, s.status as supplier_status, s.default_cost_center,
            p.po_number, p.remaining_amount as po_remaining_amount, p.approved_amount as po_approved_amount, p.cost_center as po_cost_center,
            d.invoice_number as duplicate_of_number,
            -- Available capacity, not the opening balance: other live invoices
            -- may already hold part of this order.
            (p.remaining_amount - coalesce((
              select sum(c.amount) from finops.po_commitments c
              where c.purchase_order_id = p.id and c.status = 'ACTIVE' and c.invoice_id <> i.id
            ), 0)) as po_available_amount
     from finops.invoices i
     left join finops.suppliers s on s.id = i.supplier_id
     left join finops.purchase_orders p on p.id = i.purchase_order_id
     left join finops.invoices d on d.id = i.duplicate_of
     where i.id = $1`,
    [id],
  );
  if (!invoice) return null;
  const [lines, results, decision, steps, events, accounting, payment, bankTx] = await Promise.all([
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
    pool.query("select * from finops.accounting_records where invoice_id = $1", [id]),
    pool.query("select * from finops.payment_instructions where invoice_id = $1", [id]),
    pool.query("select * from finops.bank_transactions where matched_invoice_id = $1 order by value_date", [id]),
  ]);
  const { file_path, parsed, ...rest } = invoice;
  return {
    ...rest,
    parsed,
    lines: lines.rows,
    validation: { technical: results.rows.filter((r) => r.phase === "TECHNICAL"), business: results.rows.filter((r) => r.phase === "BUSINESS") },
    routing: decision.rows[0] ?? null,
    approval_steps: steps.rows,
    audit_events: events.rows,
    accounting_record: accounting.rows[0] ?? null,
    payment: payment.rows[0] ?? null,
    bank_transactions: bankTx.rows,
  };
}
