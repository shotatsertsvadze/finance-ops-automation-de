import { Router } from "express";
import { EXPORT_PROFILES, exportAccountingCsv } from "../domain/accounting/accounting.js";
import { importStatement, listBankTransactions, runReconciliation } from "../domain/reconciliation/reconciliation.js";
import { requirePermission } from "../auth/authorize.js";
import { computeKpis } from "../domain/kpi/kpi.js";

export function accountingRouter(deps) {
  const router = Router();
  /**
   * The caller states who is reading. The default is the bookkeeping import,
   * which must see identifiers unaltered; `spreadsheet` neutralises cells a
   * spreadsheet would execute, at the cost of an apostrophe the importer would
   * then have to strip (ADR-045).
   */
  router.get("/export", async (req, res, next) => {
    try {
      const profile = req.query.profile ?? "machine";
      if (!EXPORT_PROFILES.includes(profile)) {
        return res.status(400).json({ error: `Unbekanntes Exportprofil: ${profile}`, code: "UNKNOWN_EXPORT_PROFILE" });
      }
      const csv = await exportAccountingCsv(deps, profile);
      const filename = profile === "spreadsheet" ? "buchungssaetze-tabellenkalkulation.csv" : "buchungssaetze.csv";
      res.type("text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="${filename}"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function bankRouter(deps) {
  const router = Router();
  router.post("/import", requirePermission("bank:import"), async (req, res, next) => {
    try {
      res.json(await importStatement(deps, { statement: req.body }));
    } catch (error) {
      next(error);
    }
  });
  router.get("/transactions", async (req, res, next) => {
    try {
      res.json(await listBankTransactions(deps.pool));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function reconciliationRouter(deps) {
  const router = Router();
  router.post("/run", requirePermission("reconciliation:run"), async (req, res, next) => {
    try {
      res.json(await runReconciliation(deps, { actor: req.actor }));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function dashboardRouter(deps) {
  const router = Router();
  router.get("/kpis", async (req, res, next) => {
    try {
      res.json(await computeKpis(deps));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
