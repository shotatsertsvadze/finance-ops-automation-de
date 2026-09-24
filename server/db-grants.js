const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

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
  ];
  for (const sql of statements) await pool.query(sql);
}
