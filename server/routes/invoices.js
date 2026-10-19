import { Router } from "express";
import multer from "multer";
import { handleUpload, processInvoice } from "../domain/intake/intake.js";
import { retryOfficialValidation } from "../domain/intake/official-retry.js";
import { countInvoices, getInvoiceDetail, listInvoices } from "../domain/invoice/queries.js";
import { MAX_XML_BYTES } from "../domain/invoice/xml-safety.js";
import { STATES } from "../domain/workflow/states.js";
import { decideApprovalStep, decideReview } from "../domain/approvals/approvals.js";
import { requirePermission } from "../auth/authorize.js";
import { createAccountingRecord } from "../domain/accounting/accounting.js";
import { confirmPayment, createPaymentInstruction, failPayment, retryPayment } from "../domain/payments/payments.js";
import { bookCredit } from "../domain/accounting/credit-notes.js";
import { settleByCredit } from "../domain/accounting/netting.js";
import { resolveReconciliation } from "../domain/reconciliation/reconciliation.js";
import { cancelInvoice } from "../domain/cancellation/cancel.js";
import { currentExplanation, requestExplanation } from "../domain/ai/explanations.js";
import { currentInquiryDraft, requestInquiryDraft } from "../domain/ai/inquiry-drafts.js";
import { approveInquiry, inquiryOverview, markInquirySent } from "../domain/inquiries/inquiries.js";
import { RuleError } from "../domain/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_XML_BYTES, files: 1 },
  // Both the filename and the content type come from the caller, so neither
  // is evidence. This is a convenience filter; the real gate is the XML safety
  // check and the parser. Requiring the extension rather than accepting either
  // signal at least keeps the weaker one from overriding the stronger.
  fileFilter: (req, file, cb) => {
    if (/\.xml$/i.test(file.originalname)) return cb(null, true);
    cb(Object.assign(new Error("Nur XML-Dateien (XRechnung) werden angenommen"), { status: 400, code: "UPLOAD_REJECTED" }), false);
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function invoicesRouter(deps) {
  const router = Router();

  // An id that cannot be a UUID names no invoice. Checked here rather than
  // left to Postgres, whose refused cast would surface as a 500.
  router.param("id", (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(404).json({ error: "Rechnung nicht gefunden", code: "INVOICE_NOT_FOUND" });
    next();
  });
  router.param("inquiryId", (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(404).json({ error: "Rückfrage nicht gefunden", code: "INQUIRY_NOT_FOUND" });
    next();
  });

  // After a validator outage: every invoice stranded without a verdict, once (ADR-078).
  router.post("/official-validation/retry", requirePermission("invoice:reprocess"), async (req, res, next) => {
    try {
      res.json(await retryOfficialValidation(deps, req.actor));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requirePermission("invoice:upload"), upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Feld 'file' fehlt", code: "FILE_FIELD_MISSING" });
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
      if (state && !STATES.includes(state)) return res.status(400).json({ error: "Unbekannter Status", code: "UNKNOWN_STATE_FILTER" });
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: "Seitengröße 1 bis 200, Versatz ab 0", code: "INVALID_PAGE" });
      }
      const { rows, total } = await listInvoices(deps.pool, { state, limit, offset });
      res.set("X-Total-Count", String(total)).json(rows);
    } catch (error) {
      next(error);
    }
  });

  router.get("/counts", async (req, res, next) => {
    try {
      res.json(await countInvoices(deps.pool));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const invoice = await getInvoiceDetail(deps.pool, req.params.id);
      if (!invoice) return res.status(404).json({ error: "Rechnung nicht gefunden", code: "INVOICE_NOT_FOUND" });
      res.json(invoice);
    } catch (error) {
      next(error);
    }
  });

  /**
   * The stored original, byte for byte. Served as source text, never as a type
   * a browser will render: the XML gate decides what we process, not what a
   * browser executes, and a document refused as an invoice can still be a
   * working XHTML page. Rendered inline on this origin its script would run
   * with the session of whoever opened the link.
   */
  router.get("/:id/file", async (req, res, next) => {
    try {
      const { rows: [row] } = await deps.pool.query("select file_path, original_filename from finops.invoices where id = $1", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Rechnung nicht gefunden", code: "INVOICE_NOT_FOUND" });
      const filename = row.original_filename.replace(/["\\\r\n]/g, "");
      res
        .type("text/plain; charset=utf-8")
        .set("Content-Disposition", `inline; filename="${filename}"`)
        .set("Content-Security-Policy", "default-src 'none'; sandbox; frame-ancestors 'none'")
        .set("Referrer-Policy", "no-referrer");
      res.send(await deps.storage.read(row.file_path));
    } catch (error) {
      next(error);
    }
  });

  // An AI explanation of why the invoice stopped: a suggestion beside the
  // evidence, never part of it (ADR-080). The invoice detail does not carry it.
  router.get("/:id/ai-explanation", async (req, res, next) => {
    try {
      res.json(await currentExplanation(deps, req.params.id, req.query.language));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ai-explanation", requirePermission("review:decide"), async (req, res, next) => {
    try {
      res.json(await requestExplanation(deps, req.params.id, req.query.language, req.actor));
    } catch (error) {
      next(error);
    }
  });

  // A supplier inquiry (ADR-084): a draft from the model or the template, a
  // text a person approves, and an inquiry the person sent by hand. Part of
  // the AI features: with them off, nothing is offered.
  const inquiryOn = () => {
    if (!deps.ai?.enabled) throw new RuleError(409, "AI_DISABLED", "KI-Funktionen sind nicht eingeschaltet");
  };
  const inquiryView = async (id) => ({ enabled: true, ...(await inquiryOverview(deps, id)), ai: await currentInquiryDraft(deps, id) });

  router.get("/:id/supplier-inquiry", async (req, res, next) => {
    try {
      res.json(deps.ai?.enabled ? await inquiryView(req.params.id) : { enabled: false });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/supplier-inquiry/draft", requirePermission("review:decide"), async (req, res, next) => {
    try {
      inquiryOn();
      res.json(await requestInquiryDraft(deps, req.params.id, req.actor));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/supplier-inquiry/approve", requirePermission("review:decide"), async (req, res, next) => {
    try {
      inquiryOn();
      const { source, ai_inquiry_id: aiInquiryId, subject, body } = req.body ?? {};
      if (aiInquiryId != null && !UUID.test(String(aiInquiryId))) {
        throw new RuleError(400, "INQUIRY_DRAFT_UNKNOWN", "Kein angenommener KI-Entwurf zu diesem Prüflauf");
      }
      await approveInquiry(deps, req.params.id, { source, aiInquiryId, subject, body }, req.actor);
      res.json(await inquiryView(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/supplier-inquiry/:inquiryId/sent", requirePermission("review:decide"), async (req, res, next) => {
    try {
      inquiryOn();
      await markInquirySent(deps, req.params.id, req.params.inquiryId, req.actor);
      res.json(await inquiryView(req.params.id));
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
      if (!REVIEW_ACTIONS.includes(action)) return res.status(400).json({ error: "Unbekannte Entscheidung", code: "UNKNOWN_DECISION" });
      await decideReview(deps, { invoiceId: req.params.id, action, actor: req.actor, comment: req.body?.comment });
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
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Unbekannte Entscheidung", code: "UNKNOWN_DECISION" });
      const stepNo = Number(req.params.stepNo);
      if (!Number.isInteger(stepNo) || stepNo < 1) return res.status(400).json({ error: "Ungültiger Schritt", code: "INVALID_STEP" });
      const result = await decideApprovalStep(deps, {
        invoiceId: req.params.id, stepNo, action, actor: req.actor, user: req.user, comment: req.body?.comment,
      });
      const detail = await getInvoiceDetail(deps.pool, req.params.id);
      // The signature did not happen and the invoice moved: a refusal that
      // still carries the invoice, so the client shows where it went.
      if (result?.outcome === "ROUTED_TO_REVIEW") {
        return res.status(409).json({
          error: "Rechnung wurde nicht freigegeben: die fachliche Prüfung ist seit der Vorlage fehlgeschlagen",
          code: "BUSINESS_CHECK_FAILED_AT_GATE",
          details: { reasons: result.reasons, review_reason: result.reviewReason },
          invoice: detail,
        });
      }
      res.json(detail);
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

  // What a credit note has instead of a payment instruction.
  router.post("/:id/credit", requirePermission("payment:instruct"), async (req, res, next) => {
    try {
      await bookCredit(deps, { invoiceId: req.params.id, actor: req.actor });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  // What an invoice its credits cover entirely has instead of a payment.
  router.post("/:id/settle-by-credit", requirePermission("payment:instruct"), async (req, res, next) => {
    try {
      await settleByCredit(deps, { invoiceId: req.params.id, actor: req.actor });
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

  // Stopping an approved invoice before money moves (ADR-054).
  router.post("/:id/cancel", requirePermission("invoice:cancel"), async (req, res, next) => {
    try {
      await cancelInvoice(deps, { invoiceId: req.params.id, actor: req.actor, comment: req.body?.comment });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  // The bank did not carry the payment out (ADR-055).
  router.post("/:id/payment/fail", requirePermission("payment:confirm"), async (req, res, next) => {
    try {
      await failPayment(deps, { invoiceId: req.params.id, actor: req.actor, comment: req.body?.comment });
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/payment/retry", requirePermission("payment:instruct"), async (req, res, next) => {
    try {
      await retryPayment(deps, { invoiceId: req.params.id, actor: req.actor });
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
