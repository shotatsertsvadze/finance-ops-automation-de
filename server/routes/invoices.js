import { Router } from "express";
import multer from "multer";
import { handleUpload, processInvoice } from "../domain/intake/intake.js";
import { getInvoiceDetail, listInvoices } from "../domain/invoice/queries.js";
import { MAX_XML_BYTES } from "../domain/invoice/xml-safety.js";
import { STATES } from "../domain/workflow/states.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_XML_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xml$/i.test(file.originalname) || /xml/i.test(file.mimetype);
    cb(ok ? null : new Error("Nur XML-Dateien (XRechnung) werden angenommen"), ok);
  },
});

export function invoicesRouter(deps) {
  const router = Router();

  router.post("/", upload.single("file"), async (req, res, next) => {
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

  router.post("/:id/reprocess", async (req, res, next) => {
    try {
      await processInvoice(deps, req.params.id, req.actor);
      res.json(await getInvoiceDetail(deps.pool, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
