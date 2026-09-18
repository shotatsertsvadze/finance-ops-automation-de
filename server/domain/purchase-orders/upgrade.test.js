/**
 * Upgrading an installation that already has data.
 *
 * Every other test starts from an empty schema with every migration applied, so
 * none of them can see a migration that forgets existing rows. 0006 created the
 * commitment ledger empty: an installation whose invoices already held purchase
 * -order capacity came out of the upgrade believing every order was untouched.
 *
 * This test builds the "before" state deliberately: migrations up to 0005, a
 * pre-upgrade invoice, then the rest.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "db", "migrations");
const SEED = path.join(MIGRATIONS, "..", "seed", "master_data.sql");

const NAME = "finops_upgrade_test";
/**
 * The same server as the rest of the suite, a different database. Taken from
 * TEST_DATABASE_URL rather than hardcoded to localhost, so host, port and
 * credentials follow wherever the suite is pointed: a local socket that wants
 * no password, or a CI container that insists on one.
 */
const on = (database) => {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) return `postgresql://localhost/${database}`;
  const url = new globalThis.URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};
const ADMIN_URL = process.env.UPGRADE_TEST_ADMIN_URL ?? on("postgres");
const TARGET_URL = on(NAME);

const PO = "PO-2026-0102";            // opens with 500,00
const SUPPLIER = "10000000-0000-0000-0000-000000000001";
const PO_ID = "20000000-0000-0000-0000-000000000102";

let pool;

/** Applies the migrations in (from, to], in filename order. */
async function apply(client, to, from = "0000") {
  const files = (await readdir(MIGRATIONS))
    .filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => f > from && f <= to);
  for (const file of files) await client.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  return files;
}

before(async () => {
  // This test drops a database, so it must not be pointed at either real one.
  for (const [name, value] of [["DATABASE_URL", process.env.DATABASE_URL], ["TEST_DATABASE_URL", process.env.TEST_DATABASE_URL]]) {
    if (value && value.endsWith(`/${NAME}`)) throw new Error(`${name} darf nicht auf ${NAME} zeigen: dieser Test löscht die Datenbank`);
  }
  const admin = new pg.Pool({ connectionString: ADMIN_URL });
  await admin.query(`drop database if exists ${NAME}`);
  await admin.query(`create database ${NAME}`);
  await admin.end();

  pool = new pg.Pool({ connectionString: TARGET_URL });
  await pool.query("create schema if not exists finops");
  await apply(pool, "0005_auth.sql");
  await pool.query(await readFile(SEED, "utf8"));
});

after(async () => {
  await pool?.end();
  const admin = new pg.Pool({ connectionString: ADMIN_URL });
  await admin.query(`drop database if exists ${NAME}`);
  await admin.end();
});

const insertPreUpgradeInvoice = (state, netAmount, grossAmount, number) =>
  pool.query(
    `insert into finops.invoices (state, source_channel, original_filename, file_sha256, file_path,
       file_size_bytes, invoice_number, issue_date, currency, net_amount, vat_amount, gross_amount,
       supplier_id, purchase_order_id)
     values ($1,'EMAIL',$2,$3,$4,1,$5,'2026-08-01','EUR',$6,0,$7,$8,$9)`,
    [state, `${number}.xml`, `hash-${number}`, `/tmp/${number}.xml`, number, netAmount, grossAmount, SUPPLIER, PO_ID],
  );

const activeCommitments = async () => {
  const { rows } = await pool.query(
    `select i.invoice_number, c.amount::text as amount from finops.po_commitments c
     join finops.invoices i on i.id = c.invoice_id
     join finops.purchase_orders p on p.id = c.purchase_order_id
     where p.po_number = $1 and c.status = 'ACTIVE' order by i.invoice_number`,
    [PO],
  );
  return rows;
};

test("invoices that already held capacity before the upgrade are recorded", async () => {
  await insertPreUpgradeInvoice("APPROVED", "319.33", "380.00", "OLD-APPROVED");
  await insertPreUpgradeInvoice("PAID", "100.00", "119.00", "OLD-PAID");
  // These two hold nothing: one never reached a holding state, one was refused.
  await insertPreUpgradeInvoice("REVIEW_REQUIRED", "50.00", "59.50", "OLD-REVIEW");
  await insertPreUpgradeInvoice("REJECTED", "50.00", "59.50", "OLD-REJECTED");

  await apply(pool, "0099_zzz.sql", "0005_auth.sql");

  const held = await activeCommitments();
  assert.deepEqual(held.map((r) => r.invoice_number), ["OLD-APPROVED", "OLD-PAID"],
    "only invoices in capacity-holding states claim the order");
  assert.equal(held.find((r) => r.invoice_number === "OLD-APPROVED").amount, "319.33");
});

test("the order reports the capacity those old invoices leave free", async () => {
  const { rows: [order] } = await pool.query("select remaining_amount from finops.purchase_orders where po_number = $1", [PO]);
  const held = await activeCommitments();
  const committed = held.reduce((sum, row) => sum + Number(row.amount), 0);

  assert.equal(Number(order.remaining_amount), 500);
  assert.equal(committed, 419.33, "319,33 + 100,00 already claimed");
  assert.equal(Number((Number(order.remaining_amount) - committed).toFixed(2)), 80.67,
    "not the full opening balance, which is what the defect reported");
});

test("running the backfill again does not double a claim", async () => {
  const before = await activeCommitments();
  const sql = await readFile(path.join(MIGRATIONS, "0009_backfill_po_commitments.sql"), "utf8");
  await pool.query(sql);

  assert.deepEqual(await activeCommitments(), before, "the repair is safe to re-run");
});
