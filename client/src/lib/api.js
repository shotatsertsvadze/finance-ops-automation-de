/** Reads the CSRF cookie the server set at login and echoes it in a header. */
function csrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("finops_csrf="))
      ?.split("=")[1] ?? ""
  );
}

let signedOut = () => {};

/**
 * Called when the server no longer knows the session. Pages catch their own
 * errors, so without this an expired session reads as empty data.
 */
export function onSignedOut(handler) {
  signedOut = handler;
}

async function request(path, options = {}) {
  return (await send(path, options)).json();
}

/** The response itself, for the few callers that read a header as well. */
async function send(path, options = {}) {
  const mutating = options.method && options.method !== "GET";
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { ...(mutating ? { "X-CSRF-Token": csrfToken() } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // The German sentence stays the message, so anything that only logs an
    // error still reads. The code and details travel alongside it, so the UI
    // can say the same thing in the reader's language (ADR-042).
    const error = new Error(body.error ?? `Anfrage fehlgeschlagen (${response.status})`);
    error.code = body.code ?? null;
    error.details = body.details ?? null;
    error.status = response.status;
    if (error.code === "NOT_SIGNED_IN") signedOut();
    throw error;
  }
  return response;
}

/** One page of the list, and how many invoices there are in all (ADR-066). */
export async function listInvoices(state, offset = 0) {
  const response = await send(`/invoices?offset=${offset}${state ? `&state=${state}` : ""}`);
  return { rows: await response.json(), total: Number(response.headers.get("X-Total-Count")) };
}
export const countInvoices = () => request("/invoices/counts");
export const getInvoice = (id) => request(`/invoices/${id}`);

// The server takes the actor from the session cookie, so nothing here states
// who is acting.
const actorPost = (path, body) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const login = (email, password) =>
  request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
export const logout = () => actorPost("/auth/logout");
export const getMe = () => request("/auth/me");

export const decideReview = (id, action, comment) => actorPost(`/invoices/${id}/review/${action}`, { comment });

export const reportInfoReceived = (id, comment) => actorPost(`/invoices/${id}/info-received`, { comment });

export const decideStep = (id, stepNo, action, comment) => actorPost(`/invoices/${id}/approvals/${stepNo}/${action}`, { comment });

export const reprocessInvoice = (id) => actorPost(`/invoices/${id}/reprocess`);

// AI explanation (ADR-080): read freely, generated only when a reviewer asks.
export const getAiExplanation = (id, language) => request(`/invoices/${id}/ai-explanation?language=${language}`);
export const requestAiExplanation = (id, language) => actorPost(`/invoices/${id}/ai-explanation?language=${language}`);
export const getSupplierInquiry = (id) => request(`/invoices/${id}/supplier-inquiry`);
export const requestSupplierInquiryDraft = (id) => actorPost(`/invoices/${id}/supplier-inquiry/draft`);
export const approveSupplierInquiry = (id, draft) => actorPost(`/invoices/${id}/supplier-inquiry/approve`, draft);
export const markSupplierInquirySent = (id, inquiryId) => actorPost(`/invoices/${id}/supplier-inquiry/${inquiryId}/sent`);

export const createAccountingRecord = (id) => actorPost(`/invoices/${id}/accounting-record`);
export const instructPayment = (id) => actorPost(`/invoices/${id}/payment`);
export const bookCredit = (id) => actorPost(`/invoices/${id}/credit`);
export const settleByCredit = (id) => actorPost(`/invoices/${id}/settle-by-credit`);
export const confirmPayment = (id) => actorPost(`/invoices/${id}/payment/confirm`);
export const cancelInvoice = (id, comment) => actorPost(`/invoices/${id}/cancel`, { comment });
export const failPayment = (id, comment) => actorPost(`/invoices/${id}/payment/fail`, { comment });
export const retryPayment = (id) => actorPost(`/invoices/${id}/payment/retry`);
export const resolveReconciliation = (id, comment) => actorPost(`/invoices/${id}/reconciliation/resolve`, { comment });

// A new trusted supplier bank account, in three people's steps (ADR-077).
export const listBankChanges = () => request("/bank-changes");
export const getBankChange = (id) => request(`/bank-changes/${id}`);
export const proposeBankChange = (body) => actorPost("/bank-changes", body);
export const verifyBankChange = (id, body) => actorPost(`/bank-changes/${id}/verify`, body);
export const approveBankChange = (id, body) => actorPost(`/bank-changes/${id}/approve`, body);
export const rejectBankChange = (id, comment) => actorPost(`/bank-changes/${id}/reject`, { comment });
export const cancelBankChange = (id, comment) => actorPost(`/bank-changes/${id}/cancel`, { comment });
export const revalidateBankChange = (id) => actorPost(`/bank-changes/${id}/revalidate`);

export const listBankTransactions = () => request("/bank/transactions");
export const getKpis = () => request("/dashboard/kpis");
export const runReconciliation = () => actorPost("/reconciliation/run");
export const importBankStatement = (statement) => actorPost("/bank/import", statement);

export function uploadInvoice(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("source_channel", "UPLOAD");
  return request("/invoices", { method: "POST", body: form });
}
