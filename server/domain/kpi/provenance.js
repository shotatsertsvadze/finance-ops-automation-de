/**
 * Where each dashboard figure comes from (ADR-079). A reader must be able to
 * tell a count over the demo's synthetic invoices from a modelled input, and
 * both from a customer's measured baseline or a pilot result. There are none
 * of those yet, so they say "nicht gemessen" rather than borrow a number.
 */
export const SOURCE_TYPES = ["SYNTHETIC", "ASSUMPTION", "CUSTOMER_BASELINE", "PILOT_RESULT"];

const SOURCES = {
  // The PoC holds synthetic data only. Run on a pilot's real invoices, these
  // figures would be PILOT_RESULT, with the period they cover.
  SYNTHETIC: {
    label: "Synthetische Demo-Daten", available: true, period: null,
    explanation: "Korrekt berechnet, aber aus den synthetischen Demo-Rechnungen und ihrem Prüfprotokoll; kein realer Prozess",
  },
  ASSUMPTION: {
    label: "Modellannahme", available: true, period: null,
    explanation: "Szenario-Eingabe aus docs/IST_PROCESS.md, nicht gemessen",
  },
  CUSTOMER_BASELINE: {
    label: "Kunden-Baseline", available: false, period: null,
    explanation: "Nicht gemessen: keine Ausgangswerte eines Kunden erfasst",
  },
  PILOT_RESULT: {
    label: "Pilot-Ergebnis", available: false, period: null,
    explanation: "Nicht gemessen: kein Pilotbetrieb",
  },
};

const DEMO = ["SYNTHETIC"];
const MODELLED = ["SYNTHETIC", "ASSUMPTION"];

/** Each block of the KPI response, and each economics figure, with the sources it rests on. */
const FIGURES = {
  volume: DEMO,
  automation: DEMO,
  exceptions: DEMO,
  risk: DEMO,
  workload: DEMO,
  cycle: DEMO,
  "economics.assumptions": ["ASSUMPTION"],
  "economics.basis_invoices": DEMO,
  "economics.hours_saved": MODELLED,
  "economics.cost_saved_eur": MODELLED,
  "economics.minutes_per_invoice_now": MODELLED,
};

export const provenance = () => ({ sources: SOURCES, figures: FIGURES });
