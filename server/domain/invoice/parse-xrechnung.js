import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * UBL 2.1 Invoice adapter for XRechnung. Returns a format-neutral structure;
 * a CII adapter would produce the same shape. Values stay strings here;
 * interpretation (numbers, dates) is the validator's job.
 */
export class InvoiceParseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ["InvoiceLine", "TaxSubtotal", "PaymentMeans"].includes(name),
});

const text = (node) => {
  if (node === undefined || node === null) return null;
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") return node["#text"] ?? null;
  return String(node);
};
const get = (obj, path) => path.split(".").reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), obj);
const str = (obj, path) => text(get(obj, path));

export function detectFormat(doc) {
  if (doc.Invoice) return "XRECHNUNG_UBL";
  if (doc.CrossIndustryInvoice) return "CII";
  return "UNKNOWN";
}

export function parseInvoiceXml(xmlText) {
  const valid = XMLValidator.validate(xmlText);
  if (valid !== true) throw new InvoiceParseError("NOT_WELL_FORMED", valid.err?.msg ?? "XML nicht wohlgeformt");
  const doc = parser.parse(xmlText);
  const format = detectFormat(doc);
  if (format !== "XRECHNUNG_UBL") {
    throw new InvoiceParseError("UNSUPPORTED_FORMAT", format === "CII" ? "UN/CEFACT CII wird noch nicht unterstützt" : "Kein UBL-Invoice-Dokument");
  }
  const inv = doc.Invoice;
  const supplier = get(inv, "AccountingSupplierParty.Party") ?? {};
  const buyer = get(inv, "AccountingCustomerParty.Party") ?? {};
  const paymentMeans = (inv.PaymentMeans ?? [])[0] ?? {};
  const lines = (inv.InvoiceLine ?? []).map((line, i) => ({
    lineNo: str(line, "ID") ?? String(i + 1),
    description: str(line, "Item.Name"),
    quantity: str(line, "InvoicedQuantity"),
    unitCode: get(line, "InvoicedQuantity.@_unitCode") ?? null,
    unitPrice: str(line, "Price.PriceAmount"),
    lineNet: str(line, "LineExtensionAmount"),
  }));
  return {
    format,
    customizationId: str(inv, "CustomizationID"),
    profileId: str(inv, "ProfileID"),
    invoiceNumber: str(inv, "ID"),
    issueDate: str(inv, "IssueDate"),
    dueDate: str(inv, "DueDate"),
    typeCode: str(inv, "InvoiceTypeCode"),
    currency: str(inv, "DocumentCurrencyCode"),
    buyerReference: str(inv, "BuyerReference"),
    poReference: str(inv, "OrderReference.ID"),
    supplier: {
      name: str(supplier, "PartyLegalEntity.RegistrationName") ?? str(supplier, "PartyName.Name"),
      vatId: str(supplier, "PartyTaxScheme.CompanyID"),
      country: str(supplier, "PostalAddress.Country.IdentificationCode"),
      city: str(supplier, "PostalAddress.CityName"),
      email: str(supplier, "Contact.ElectronicMail") ?? str(supplier, "EndpointID"),
    },
    buyer: {
      name: str(buyer, "PartyLegalEntity.RegistrationName") ?? str(buyer, "PartyName.Name"),
      vatId: str(buyer, "PartyTaxScheme.CompanyID"),
    },
    payment: {
      meansCode: str(paymentMeans, "PaymentMeansCode"),
      iban: str(paymentMeans, "PayeeFinancialAccount.ID")?.replace(/\s+/g, "").toUpperCase() ?? null,
      bic: str(paymentMeans, "PayeeFinancialAccount.FinancialInstitutionBranch.ID"),
      reference: str(paymentMeans, "PaymentID"),
      terms: str(inv, "PaymentTerms.Note"),
    },
    totals: {
      lineExtension: str(inv, "LegalMonetaryTotal.LineExtensionAmount"),
      taxExclusive: str(inv, "LegalMonetaryTotal.TaxExclusiveAmount"),
      taxAmount: str(inv, "TaxTotal.TaxAmount"),
      taxInclusive: str(inv, "LegalMonetaryTotal.TaxInclusiveAmount"),
      payable: str(inv, "LegalMonetaryTotal.PayableAmount"),
    },
    lines,
  };
}
