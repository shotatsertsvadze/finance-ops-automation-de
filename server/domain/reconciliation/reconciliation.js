import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { matchTransaction } from "./matching.js";
import { AWAITING_RECONCILIATION_STATES } from "../workflow/states.js";

/**
 * Import a synthetic bank statement. external_id is the bank's own id, so
 * importing the same statement twice adds nothing.
 */
export async function importStatement({ pool }, { statement }) {
  const transactions = statement?.transactions;
  if (!Array.isArray(transactions)) throw new RuleError(400, "STATEMENT_WITHOUT_TRANSACTIONS", "Kontoauszug enthält keine Buchungen");

  return withTransaction(pool, async (client) => {
    let imported = 0;
    for (const tx of transactions) {
      if (!tx.external_id || !tx.value_date || tx.amount === undefined) {
        throw new RuleError(400, "TRANSACTION_INCOMPLETE", "Buchung ohne external_id, Datum oder Betrag");
      }
      const { rowCount } = await client.query(
        `insert into finops.bank_transactions
           (external_id, value_date, amount, currency, counterparty_name, counterparty_iban, reference)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (external_id) do nothing`,
        [tx.external_id, tx.value_date, tx.amount, tx.currency ?? "EUR",
          tx.counterparty_name ?? null, tx.counterparty_iban ?? null, tx.reference ?? null],
      );
      imported += rowCount;
    }
    return { imported, received: transactions.length };
  });
}

/**
 * Match every unmatched transaction against invoices awaiting reconciliation.
 * Re-running is safe: transactions already MATCHED are skipped, and an
 * invoice already RECONCILED is never transitioned again.
 */
export async function runReconciliation({ pool }, { actor }) {
  return withTransaction(pool, async (client) => {
    const { rows: transactions } = await client.query(
      "select * from finops.bank_transactions where status not in ('MATCHED', 'RESOLVED') order by value_date, external_id for update",
    );
    // Compared against what was instructed, not against what the document
    // claimed. An invoice with no instruction was never paid, so an inner join
    // is the rule rather than a convenience.
    const { rows: openPayments } = await client.query(
      `select i.id as invoice_id, p.reference, p.end_to_end_id, p.amount, p.currency, p.creditor_iban
       from finops.invoices i
       join finops.payment_instructions p on p.invoice_id = i.id and p.status = 'EXECUTED'
       where i.state = any($1::finops.invoice_state[])`,
      [AWAITING_RECONCILIATION_STATES],
    );

    const summary = { matched: 0, exceptions: 0, unmatched: 0 };

    for (const tx of transactions) {
      const result = matchTransaction(tx, openPayments);

      if (result.outcome === "MATCHED") {
        await client.query(
          "update finops.bank_transactions set status = 'MATCHED', matched_invoice_id = $2, match_reason = null, matched_at = now() where id = $1",
          [tx.id, result.invoiceId],
        );
        await transition(client, {
          invoiceId: result.invoiceId, to: "RECONCILED", actor, action: "reconciled",
          reason: `Zahlungseingang ${tx.external_id} zugeordnet`,
          evidence: { external_id: tx.external_id, amount: tx.amount, reference: tx.reference },
        });
        // A reconciled payment leaves the candidate pool immediately, so a
        // second transaction cannot close the same invoice in this run.
        openPayments.splice(openPayments.findIndex((p) => p.invoice_id === result.invoiceId), 1);
        summary.matched += 1;
        continue;
      }

      if (result.outcome === "EXCEPTION") {
        await client.query(
          "update finops.bank_transactions set status = 'EXCEPTION', matched_invoice_id = $2, match_reason = $3, matched_at = now() where id = $1",
          [tx.id, result.invoiceId, result.reason],
        );
        if (result.invoiceId) {
          const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1", [result.invoiceId]);
          if (invoice?.state === "PAID") {
            await transition(client, {
              invoiceId: result.invoiceId, to: "RECONCILIATION_EXCEPTION", actor, action: "reconciliation_exception",
              reason: result.reason, reviewReason: result.reason,
              evidence: { external_id: tx.external_id, amount: tx.amount, reference: tx.reference },
            });
          }
        }
        summary.exceptions += 1;
        continue;
      }

      await client.query(
        "update finops.bank_transactions set status = 'UNMATCHED', matched_invoice_id = null, match_reason = null, matched_at = null where id = $1",
        [tx.id],
      );
      summary.unmatched += 1;
    }

    return summary;
  });
}

/** A human closes a reconciliation exception, with a reason. */
export async function resolveReconciliation({ pool }, { invoiceId, actor, comment }) {
  const reason = (comment ?? "").trim();
  if (!reason) throw new RuleError(400, "REASON_REQUIRED", "Für den Abschluss ist eine Begründung erforderlich");

  return withTransaction(pool, async (client) => {
    const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (invoice.state !== "RECONCILIATION_EXCEPTION") {
      throw new TransitionError("NO_OPEN_RECONCILIATION_EXCEPTION", `Rechnung im Status ${invoice.state} hat keine offene Abgleich-Ausnahme`, { state: invoice.state });
    }
    // Closing the invoice without closing its evidence leaves the transaction
    // free to attach itself to a later invoice, so both move together.
    const { rows: consumed } = await client.query(
      `update finops.bank_transactions
         set status = 'RESOLVED', matched_at = now()
       where matched_invoice_id = $1 and status = 'EXCEPTION'
       returning external_id`,
      [invoiceId],
    );

    await transition(client, {
      invoiceId, to: "RECONCILED", actor, action: "reconciliation_resolved", reason,
      evidence: { resolved_transactions: consumed.map((t) => t.external_id) },
    });
  });
}

export async function listBankTransactions(pool) {
  const { rows } = await pool.query(
    `select b.*, i.invoice_number from finops.bank_transactions b
     left join finops.invoices i on i.id = b.matched_invoice_id
     order by b.value_date, b.external_id`,
  );
  return rows;
}
