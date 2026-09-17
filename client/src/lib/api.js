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
