import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { matchTransaction } from "./matching.js";

/**
 * Import a synthetic bank statement. external_id is the bank's own id, so
 * importing the same statement twice adds nothing.
 */
export async function importStatement({ pool }, { statement }) {
  const transactions = statement?.transactions;
  if (!Array.isArray(transactions)) throw new RuleError(400, "Kontoauszug enthält keine Buchungen");

  return withTransaction(pool, async (client) => {
    let imported = 0;
    for (const tx of transactions) {
      if (!tx.external_id || !tx.value_date || tx.amount === undefined) {
        throw new RuleError(400, "Buchung ohne external_id, Datum oder Betrag");
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
      "select * from finops.bank_transactions where status <> 'MATCHED' order by value_date, external_id for update",
    );
    const { rows: openInvoices } = await client.query(
      "select id, invoice_number, gross_amount, supplier_iban_raw from finops.invoices where state in ('PAID', 'RECONCILIATION_EXCEPTION')",
    );

    const summary = { matched: 0, exceptions: 0, unmatched: 0 };

    for (const tx of transactions) {
      const result = matchTransaction(tx, openInvoices);

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
        // Reconciled invoices leave the candidate pool immediately, so a
        // second transaction cannot close the same invoice in this run.
        openInvoices.splice(openInvoices.findIndex((i) => i.id === result.invoiceId), 1);
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

      await client.query("update finops.bank_transactions set status = 'UNMATCHED', match_reason = null where id = $1", [tx.id]);
      summary.unmatched += 1;
    }

    return summary;
  });
}

/** A human closes a reconciliation exception, with a reason. */
export async function resolveReconciliation({ pool }, { invoiceId, actor, comment }) {
  const reason = (comment ?? "").trim();
  if (!reason) throw new RuleError(400, "Für den Abschluss ist eine Begründung erforderlich");

  return withTransaction(pool, async (client) => {
    const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("Rechnung nicht gefunden");
    if (invoice.state !== "RECONCILIATION_EXCEPTION") {
      throw new TransitionError(`Rechnung im Status ${invoice.state} hat keine offene Abgleich-Ausnahme`, { state: invoice.state });
    }
    await transition(client, {
      invoiceId, to: "RECONCILED", actor, action: "reconciliation_resolved", reason,
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
