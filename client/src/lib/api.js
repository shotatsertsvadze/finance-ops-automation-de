async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Anfrage fehlgeschlagen (${response.status})`);
  }
  return response.json();
}

export const listInvoices = (state) => request(`/invoices${state ? `?state=${state}` : ""}`);
export const getInvoice = (id) => request(`/invoices/${id}`);
export const getUsers = () => request("/users");
export const getMeta = () => request("/meta/states");

const actorPost = (path, actorId, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(actorId ? { "x-actor-id": actorId } : {}) },
    body: JSON.stringify(body ?? {}),
  });

export const decideReview = (id, action, actorId, comment) =>
  actorPost(`/invoices/${id}/review/${action}`, actorId, { comment });

export const reportInfoReceived = (id, actorId, comment) =>
  actorPost(`/invoices/${id}/info-received`, actorId, { comment });

export const decideStep = (id, stepNo, action, actorId, comment) =>
  actorPost(`/invoices/${id}/approvals/${stepNo}/${action}`, actorId, { comment });

export const reprocessInvoice = (id, actorId) => actorPost(`/invoices/${id}/reprocess`, actorId);

export function uploadInvoice(file, actorId) {
  const form = new FormData();
  form.append("file", file);
  form.append("source_channel", "UPLOAD");
  return request("/invoices", {
    method: "POST",
    body: form,
    headers: actorId ? { "x-actor-id": actorId } : {},
  });
}
