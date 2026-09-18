/**
 * Builds a minimal, internally consistent XRechnung for tests that need a
 * specific amount. Totals are chained correctly along EN 16931's calculation
 * rules, so the document only fails the check a test is actually about.
 *
 * `netCents` is the line total. Allowances, charges and a prepayment move the
 * later links of the chain, exactly as they would in a real document:
 *   lines - allowances + charges = net, net + VAT = gross,
 *   gross - prepaid + rounding = payable.
 */
const money = (cents) => (cents / 100).toFixed(2);

export function buildInvoiceXml({
  number,
  netCents,
  allowances = [],
  prepaidCents = 0,
  roundingCents = 0,
  po = "PO-2026-0102",
  supplierName = "Berliner Bürobedarf GmbH",
  supplierVat = "DE123456789",
  iban = "DE89370400440532013000",
  issueDate = "2026-09-15",
  dueDate = "2026-10-15",
}) {
  const total = (charge) => allowances.filter((a) => Boolean(a.charge) === charge)
    .reduce((sum, a) => sum + a.amountCents, 0);
  const allowanceTotal = total(false);
  const chargeTotal = total(true);
  const net = netCents - allowanceTotal + chargeTotal;
  const vat = Math.round(net * 0.19);
  const gross = net + vat;
  const payable = gross - prepaidCents + roundingCents;
  const allowanceCharges = allowances.map((a) => `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>${a.charge ? "true" : "false"}</cbc:ChargeIndicator>
    ${a.reasonCode ? `<cbc:AllowanceChargeReasonCode>${a.reasonCode}</cbc:AllowanceChargeReasonCode>` : ""}
    ${a.reason ? `<cbc:AllowanceChargeReason>${a.reason}</cbc:AllowanceChargeReason>` : ""}
    <cbc:Amount currencyID="EUR">${money(a.amountCents)}</cbc:Amount>
    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:AllowanceCharge>`).join("\n  ");
  const optional = (tag, cents) => (cents ? `<cbc:${tag} currencyID="EUR">${money(cents)}</cbc:${tag}>` : "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
             xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
             xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>${number}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>NORDWERK-EINKAUF-01</cbc:BuyerReference>
  <cac:OrderReference><cbc:ID>${po}</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:CityName>Berlin</cbc:CityName><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${supplierVat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Nordwerk GmbH</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>DE999999999</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Nordwerk GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${number}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>${iban}</cbc:ID><cbc:Name>${supplierName}</cbc:Name>
      <cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>Zahlbar innerhalb von 30 Tagen ohne Abzug</cbc:Note></cac:PaymentTerms>
  ${allowanceCharges}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${money(vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${money(net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${money(vat)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${money(netCents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${money(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${money(gross)}</cbc:TaxInclusiveAmount>
    ${optional("AllowanceTotalAmount", allowanceTotal)}
    ${optional("ChargeTotalAmount", chargeTotal)}
    ${optional("PrepaidAmount", prepaidCents)}
    ${optional("PayableRoundingAmount", roundingCents)}
    <cbc:PayableAmount currencyID="EUR">${money(payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${money(netCents)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Leistung laut Bestellung ${po}</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${money(netCents)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</ubl:Invoice>
`;
}
