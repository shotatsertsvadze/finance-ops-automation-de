import { Router } from "express";
import { requirePermission } from "../auth/authorize.js";
import { cancelChange, proposeChange, rejectChange, verifyChange } from "../domain/bank-changes/changes.js";
import { approveAndRevalidate, revalidateChange } from "../domain/bank-changes/revalidation.js";
import { changeDetail, listChanges } from "../domain/bank-changes/queries.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === "string" && UUID.test(value);

function readRoutes(router, { deps, detail, handle }) {
  router.get(
    "/",
    requirePermission("bank-change:read"),
    handle(async (req, res) => {
      res.json(await listChanges(deps.pool));
    }),
  );

  router.get(
    "/:id",
    requirePermission("bank-change:read"),
    handle(async (req, res) => {
      const change = await detail(req.params.id);
      if (!change) return res.status(404).json({ error: "Änderung der Bankverbindung nicht gefunden", code: "CHANGE_NOT_FOUND" });
      res.json(change);
    }),
  );

  router.post(
    "/",
    requirePermission("bank-change:propose"),
    handle(async (req, res) => {
      const { supplier_id: supplierId, iban, bic, source_invoice_id: sourceInvoiceId, comment } = req.body ?? {};
      if (!isUuid(supplierId)) return res.status(404).json({ error: "Lieferant nicht gefunden", code: "SUPPLIER_NOT_FOUND" });
      if (sourceInvoiceId != null && !isUuid(sourceInvoiceId)) {
        return res.status(400).json({ error: "Die genannte Rechnung gehört nicht zu diesem Lieferanten", code: "SOURCE_INVOICE_MISMATCH" });
      }
      const { change, created } = await proposeChange(deps, {
        supplierId,
        iban: iban == null ? null : String(iban),
        bic: bic == null ? null : String(bic),
        sourceInvoiceId: sourceInvoiceId ?? null,
        reason: comment,
        actor: req.actor,
      });
      res.status(created ? 201 : 200).json(await detail(change.id));
    }),
  );
}

function stepRoutes(router, { deps, detail, handle }) {
  // The number called is not read from the body: it comes from master data.
  router.post(
    "/:id/verify",
    requirePermission("bank-change:verify"),
    handle(async (req, res) => {
      const {
        outcome,
        contacted_role: contactedRole,
        called_at: calledAt,
        iban_read_back: ibanReadBack,
        reference,
        comment,
      } = req.body ?? {};
      await verifyChange(deps, {
        changeId: req.params.id,
        actor: req.actor,
        outcome,
        contactedRole,
        calledAt,
        ibanReadBack: ibanReadBack == null ? null : String(ibanReadBack),
        reference,
        note: comment,
      });
      res.json(await detail(req.params.id));
    }),
  );

  router.post(
    "/:id/approve",
    requirePermission("bank-change:approve"),
    handle(async (req, res) => {
      const { revalidation } = await approveAndRevalidate(deps, {
        changeId: req.params.id,
        actor: req.actor,
        acknowledgeSharedIban: req.body?.acknowledge_shared_iban === true,
        comment: req.body?.comment,
      });
      res.json({ ...(await detail(req.params.id)), revalidation });
    }),
  );

  router.post(
    "/:id/reject",
    requirePermission("bank-change:approve"),
    handle(async (req, res) => {
      await rejectChange(deps, { changeId: req.params.id, actor: req.actor, comment: req.body?.comment });
      res.json(await detail(req.params.id));
    }),
  );

  router.post(
    "/:id/cancel",
    requirePermission("bank-change:propose"),
    handle(async (req, res) => {
      await cancelChange(deps, { changeId: req.params.id, actor: req.actor, comment: req.body?.comment });
      res.json(await detail(req.params.id));
    }),
  );

  // Taking up what the automatic run left: a failure, or an invoice whose
  // question has since been answered.
  router.post(
    "/:id/revalidate",
    requirePermission("invoice:reprocess"),
    handle(async (req, res) => {
      const revalidation = await revalidateChange(deps, req.params.id, req.actor);
      res.json({ ...(await detail(req.params.id)), revalidation });
    }),
  );
}

/** Routes are thin: each step is the domain's, and answers with the change as it now stands. */
export function bankChangesRouter(deps) {
  const router = Router();
  const detail = (id) => changeDetail(deps.pool, id);
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

  router.param("id", (req, res, next, id) => {
    if (!isUuid(id)) return res.status(404).json({ error: "Änderung der Bankverbindung nicht gefunden", code: "CHANGE_NOT_FOUND" });
    next();
  });

  readRoutes(router, { deps, detail, handle });
  stepRoutes(router, { deps, detail, handle });

  return router;
}
