const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/** The columns of a bank-account change the workflow moves; the proposal itself is fixed. */
export const CHANGE_DECISION_COLUMNS = [
  "state", "verified_by", "verified_at", "decided_by", "decided_at", "decision_reason", "bank_account_id", "revalidated_at",
];

/**
 * What the app's database role may do (ADR-068): everything the app needs, and
 * nothing that would change history. The audit trail can be read and added
 * to, never updated, deleted or truncated; invoices are never deleted, since
 * that would cascade to their trail. Run as the schema owner, after every
 * migration; default privileges cover tables a later migration creates.
 */
export async function grantAppRole(pool, role) {
  if (!IDENTIFIER.test(role)) throw new Error(`Ungültiger Rollenname: ${role}`);
  const statements = [
    `grant usage on schema finops to ${role}`,
    `grant select, insert, update, delete on all tables in schema finops to ${role}`,
    `grant usage, select on all sequences in schema finops to ${role}`,
    `alter default privileges in schema finops grant select, insert, update, delete on tables to ${role}`,
    `alter default privileges in schema finops grant usage, select on sequences to ${role}`,
    `revoke update, delete, truncate on finops.audit_events from ${role}`,
    `revoke delete, truncate on finops.invoices from ${role}`,
    `revoke insert, update, delete, truncate on finops.schema_migrations from ${role}`,
    // Bank-account changes (ADR-077): evidence is written once; a proposal's
    // content never changes, only its state and who decided; a trusted
    // account is added, never altered or removed by the app.
    `revoke update, delete, truncate on finops.bank_change_events, finops.bank_change_verifications, finops.bank_change_revalidations from ${role}`,
    `revoke update, delete, truncate on finops.bank_account_changes, finops.supplier_bank_accounts from ${role}`,
    `grant update (${CHANGE_DECISION_COLUMNS.join(", ")}) on finops.bank_account_changes to ${role}`,
    // The official validator's answers are evidence, written once (ADR-078).
    `revoke update, delete, truncate on finops.official_validations from ${role}`,
    // What was sent to an AI provider and what came back, written once (ADR-080).
    `revoke update, delete, truncate on finops.ai_explanations from ${role}`,
    // AI inquiry drafts and the inquiries people approved, written once (ADR-084).
    `revoke update, delete, truncate on finops.ai_supplier_inquiries, finops.supplier_inquiries from ${role}`,
  ];
  for (const sql of statements) await pool.query(sql);
}
