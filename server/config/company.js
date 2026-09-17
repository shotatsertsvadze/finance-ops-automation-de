/** The buying entity. An invoice addressed to anyone else is not ours to pay. */
export function loadCompany(env = process.env) {
  return {
    legalName: env.COMPANY_LEGAL_NAME?.trim() || "Nordwerk GmbH",
    vatId: (env.COMPANY_VAT_ID?.trim() || "DE999999999").toUpperCase(),
  };
}
