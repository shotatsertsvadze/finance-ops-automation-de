// Reads the test API as Jonas: all invoices that arrived through the form,
// their state and routing, and whether the IBAN invoice offers an inquiry.
const BASE = "http://127.0.0.1:4401";
const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "jonas.weber@nordwerk.example", password: "nordwerk-demo" }) });
const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]);
const get = async (p) => (await fetch(`${BASE}/api${p}`, { headers: { cookie: cookies.join("; ") } })).json();

const res = await fetch(`${BASE}/api/invoices?limit=200`, { headers: { cookie: cookies.join("; ") } });
const rows = await res.json();
console.log("invoices in test DB:", res.headers.get("x-total-count"), "| listed:", rows.length, "| has source_channel:", "source_channel" in (rows[0] ?? {}));
for (const row of rows.filter((x) => x.source_channel === "FORM")) {
  const d = await get(`/invoices/${row.id}`);
  console.log(`${d.invoice_number} | ${d.gross_amount} | state ${d.state} | decision ${d.routing?.decision ?? "-"} | steps ${(d.approval_steps ?? []).map((s) => s.required_role).join("+") || "-"} | created ${d.received_at}`);
  if (d.routing?.decision === "REVIEW") {
    const inq = await get(`/invoices/${row.id}/supplier-inquiry`);
    console.log("   supplier inquiry:", JSON.stringify({ enabled: inq.enabled ?? inq.ai?.enabled, eligible: inq.eligible ?? inq.ai?.eligible, code: inq.code ?? inq.ai?.code, draft: inq.draft ?? inq.ai?.draft ?? null }));
  }
}
