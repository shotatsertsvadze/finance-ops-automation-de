import { Router } from "express";
import multer from "multer";
import { handleUpload, processInvoice } from "../domain/intake/intake.js";
import { getInvoiceDetail, listInvoices } from "../domain/invoice/queries.js";
import { MAX_XML_BYTES } from "../domain/invoice/xml-safety.js";
import { STATES } from "../domain/workflow/states.js";
import { decideApprovalStep, decideReview, requestInfoFromApproval } from "../domain/approvals/approvals.js";
import { requirePermission } from "../auth/authorize.js";
import { createAccountingRecord } from "../domain/accounting/accounting.js";
import { confirmPayment, createPaymentInstruction } from "../domain/payments/payments.js";
import { resolveReconciliation } from "../domain/reconciliation/reconciliation.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_XML_BYTES, files: 1 },
  // Both the filename and the content type come from the caller, so neither
  // is evidence. This is a convenience filter; the real gate is the XML safety
  // check and the parser. Requiring the extension rather than accepting either
  // signal at least keeps the weaker one from overriding the stronger.
  fileFilter: (req, file, cb) => {
    const ok = /\.xml$/i.test(file.originalname);
    cb(ok ? null : new Error("Nur XML-Dateien (XRechnung) werden angenommen"), ok);
  },
});

export function invoicesRouter(deps) {
  const router = Router();

  router.post("/", requirePermission("invoice:upload"), upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Feld 'file' fehlt" });
      const sourceChannel = String(req.body?.source_channel || "UPLOAD").toUpperCase().slice(0, 32);
      const { id } = await handleUpload(deps, { buffer: req.file.buffer, originalFilename: req.file.originalname, sourceChannel, actor: req.actor });
      res.status(201).json(await getInvoiceDetail(deps.pool, id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const state = req.query.state ? String(req.query.state) : undefined;
      if (state && !STATES.includes(state)) return res.status(400).json({ error: "Unbekannter Status" });
      res.json(await listInvoices(deps.pool, { state }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const invoice = await getInvoiceDetail(deps.pool, req.params.id);
      if (!invoice) return res.status(404).json({ error: "Rechnung nicht gefunden" });
      res.json(invoice);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/file", async (req, res, next) => {
    try {
      const { rows: [row] } = await deps.pool.query("select file_path, original_filename from finops.invoices where id = $1", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Rechnung nicht gefunden" });
      res.type("application/xml").set("Content-Disposition", `inline; filename="${row.original_filename.replace(/"/g, "")}"`);
      res.send(await deps.storage.read(row.file_path));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/reprocess", requirePermission("invoice:reprocess"), async (req, res, next) => {
    try {
      await processInvoice(deps, req.params.id, req.actor);
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  const REVIEW_ACTIONS = ["accept", "reject", "request-info", "confirm-duplicate"];

  router.post("/:id/review/:action", requirePermission("review:decide"), async (req, res, next) => {
    try {
      const { action } = req.params;
      if (!REVIEW_ACTIONS.includes(action)) return res.status(400).json({ error: "Unbekannte Entscheidung" });
      // Requesting information is also valid while an invoice waits for
      // approval, and must invalidate approvals already given.
      const invoiceState = await currentState(deps.pool, req.params.id);
      const handler =
        action === "request-info" && invoiceState === "READY_FOR_APPROVAL" ? requestInfoFromApproval : null;
      if (handler) await handler(deps, { invoiceId: req.params.id, actor: req.actor, comment: req.body?.comment });
      else await decideReview(deps, { invoiceId: req.params.id, action, actor: req.actor, comment: req.body?.comment });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/info-received", requirePermission("review:decide"), async (req, res, next) => {
    try {
      await decideReview(deps, { invoiceId: req.params.id, action: "info-received", actor: req.actor, comment: req.body?.comment });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/approvals/:stepNo/:action", requirePermission("approval:decide"), async (req, res, next) => {
    try {
      const { action } = req.params;
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Unbekannte Entscheidung" });
      const stepNo = Number(req.params.stepNo);
      if (!Number.isInteger(stepNo) || stepNo < 1) return res.status(400).json({ error: "Ungültiger Schritt" });
      await decideApprovalStep(deps, {
        invoiceId: req.params.id, stepNo, action, actor: req.actor, user: req.user, comment: req.body?.comment,
      });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/accounting-record", requirePermission("accounting:handoff"), async (req, res, next) => {
    try {
      await createAccountingRecord(deps, { invoiceId: req.params.id, actor: req.actor });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/payment", requirePermission("payment:instruct"), async (req, res, next) => {
    try {
      await createPaymentInstruction(deps, { invoiceId: req.params.id, actor: req.actor });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/payment/confirm", requirePermission("payment:confirm"), async (req, res, next) => {
    try {
      await confirmPayment(deps, { invoiceId: req.params.id, actor: req.actor, providerRef: req.body?.provider_ref });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/reconciliation/resolve", requirePermission("reconciliation:resolve"), async (req, res, next) => {
    try {
      await resolveReconciliation(deps, { invoiceId: req.params.id, actor: req.actor, comment: req.body?.comment });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function currentState(pool, invoiceId) {
  const { rows: [row] } = await pool.query("select state from finops.invoices where id = $1", [invoiceId]);
  return row?.state ?? null;
}
