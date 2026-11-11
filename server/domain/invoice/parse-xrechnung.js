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
  isArray: (name) => ["InvoiceLine", "TaxSubtotal", "PaymentMeans", "AllowanceCharge", "CreditNoteLine"].includes(name),
});

const text = (node) => {
  if (node === undefined || node === null) return null;
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") return node["#text"] ?? null;
  return String(node);
};
const get = (obj, path) => path.split(".").reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), obj);
const str = (obj, path) => text(get(obj, path));

/**
 * One allowance or charge, at document or line level. The indicator decides
 * the sign, so a value that is neither "true" nor "false" is reported as
 * unknown rather than assumed: defaulting it would let a surcharge be
 * subtracted from the amount due.
 */
const allowanceCharge = (node) => {
  const indicator = str(node, "ChargeIndicator");
  return {
    isCharge: indicator === "true" ? true : indicator === "false" ? false : null,
    amount: str(node, "Amount"),
    baseAmount: str(node, "BaseAmount"),
    multiplier: str(node, "MultiplierFactorNumeric"),
    reason: str(node, "AllowanceChargeReason"),
    reasonCode: str(node, "AllowanceChargeReasonCode"),
    taxPercent: str(node, "TaxCategory.Percent"),
  };
};

const UBL_INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const UBL_CREDITNOTE_NS = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
/** UNTDID 1001: the document says we are owed, not that we owe. */
const CREDIT_NOTE_TYPE = "381";
const CII_NS_PREFIX = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice";

/**
 * The namespace the root element is in.
 *
 * The parser strips namespace prefixes so the rest of this file can address
 * elements by local name, which also threw away the only statement the
 * document makes about what it is. Read from the text before that happens:
 * an element called `Invoice` in somebody else's namespace is not an
 * XRechnung, and one in no namespace says nothing at all.
 */
function rootNamespace(xmlText) {
  const head = xmlText.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = head.match(/<\s*([^\s/>!?]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/);
  if (!root) return null;

  const [, qualifiedName, attributes = ""] = root;
  const prefix = qualifiedName.includes(":") ? qualifiedName.split(":")[0] : "";

  for (const [, declared, doubleQuoted, singleQuoted] of attributes.matchAll(
    /xmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    if ((declared ?? "") === prefix) return doubleQuoted ?? singleQuoted ?? null;
  }
  return null;
}

/** The format a document declares itself to be, by namespace and root element. */
function detectFormat(doc, namespace) {
  if (doc.Invoice && namespace === UBL_INVOICE_NS) return "XRECHNUNG_UBL";
  if (doc.CreditNote && namespace === UBL_CREDITNOTE_NS) return "XRECHNUNG_UBL";
  if (doc.CrossIndustryInvoice && (namespace ?? "").startsWith(CII_NS_PREFIX)) return "CII";
  return "UNKNOWN";
}

export function parseInvoiceXml(xmlText) {
  const valid = XMLValidator.validate(xmlText);
  if (valid !== true) throw new InvoiceParseError("NOT_WELL_FORMED", valid.err?.msg ?? "XML nicht wohlgeformt");
  const doc = parser.parse(xmlText);
  const namespace = rootNamespace(xmlText);
  const format = detectFormat(doc, namespace);
  if (format !== "XRECHNUNG_UBL") {
    throw new InvoiceParseError(
      "UNSUPPORTED_FORMAT",
      format === "CII" ? "UN/CEFACT CII wird noch nicht unterstützt" : `Kein UBL-Invoice-Dokument (Namensraum: ${namespace ?? "keiner"})`,
    );
  }
  // One structure for both: a UBL credit note is the same document under
  // different element names, and the rest of this adapter should not care.
  const inv = doc.Invoice ?? doc.CreditNote;
  const typeCode = str(inv, "InvoiceTypeCode") ?? str(inv, "CreditNoteTypeCode");
  // Either shape means the same thing: a CreditNote document, or an Invoice
  // document whose type code says 381.
  const documentType = doc.CreditNote || typeCode === CREDIT_NOTE_TYPE ? "CREDIT_NOTE" : "INVOICE";
  const supplier = get(inv, "AccountingSupplierParty.Party") ?? {};
  const buyer = get(inv, "AccountingCustomerParty.Party") ?? {};
  const paymentMeans = (inv.PaymentMeans ?? [])[0] ?? {};
  const lines = (inv.InvoiceLine ?? inv.CreditNoteLine ?? []).map((line, i) => ({
    lineNo: str(line, "ID") ?? String(i + 1),
    description: str(line, "Item.Name"),
    quantity: str(line, "InvoicedQuantity") ?? str(line, "CreditedQuantity"),
    unitCode: get(line, "InvoicedQuantity.@_unitCode") ?? get(line, "CreditedQuantity.@_unitCode") ?? null,
    unitPrice: str(line, "Price.PriceAmount"),
    // The quantity the price applies to. Absent means one; a price stated per
    // 1000 pieces is not a price per piece.
    baseQuantity: str(line, "Price.BaseQuantity"),
    lineNet: str(line, "LineExtensionAmount"),
    allowanceCharges: (line.AllowanceCharge ?? []).map(allowanceCharge),
  }));
  return {
    format,
    documentType,
    // The invoice this credit note refers to, if it names one.
    creditedInvoice: str(inv, "BillingReference.InvoiceDocumentReference.ID"),
    customizationId: str(inv, "CustomizationID"),
    profileId: str(inv, "ProfileID"),
    invoiceNumber: str(inv, "ID"),
    issueDate: str(inv, "IssueDate"),
    // A UBL CreditNote has no document-level DueDate; its due date (BT-9) is
    // PaymentMeans/PaymentDueDate.
    dueDate: str(inv, "DueDate") ?? (doc.CreditNote ? str(paymentMeans, "PaymentDueDate") : null),
    typeCode,
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
    // The whole of LegalMonetaryTotal, in the order EN 16931 chains it:
    // lines - allowances + charges = net, net + tax = gross,
    // gross - prepaid + rounding = payable.
    totals: {
      lineExtension: str(inv, "LegalMonetaryTotal.LineExtensionAmount"),
      allowanceTotal: str(inv, "LegalMonetaryTotal.AllowanceTotalAmount"),
      chargeTotal: str(inv, "LegalMonetaryTotal.ChargeTotalAmount"),
      taxExclusive: str(inv, "LegalMonetaryTotal.TaxExclusiveAmount"),
      taxAmount: str(inv, "TaxTotal.TaxAmount"),
      taxInclusive: str(inv, "LegalMonetaryTotal.TaxInclusiveAmount"),
      prepaid: str(inv, "LegalMonetaryTotal.PrepaidAmount"),
      rounding: str(inv, "LegalMonetaryTotal.PayableRoundingAmount"),
      payable: str(inv, "LegalMonetaryTotal.PayableAmount"),
    },
    // One entry per rate, as the document states it. The first TaxTotal is
    // the one in document currency; a second, if present, is in tax currency.
    taxSubtotals: ([inv.TaxTotal].flat()[0]?.TaxSubtotal ?? []).map((sub) => ({
      taxable: str(sub, "TaxableAmount"),
      amount: str(sub, "TaxAmount"),
      category: str(sub, "TaxCategory.ID"),
      percent: str(sub, "TaxCategory.Percent"),
    })),
    allowanceCharges: (inv.AllowanceCharge ?? []).map(allowanceCharge),
    lines,
  };
}
