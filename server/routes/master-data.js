import { Router } from "express";
import { requirePermission } from "../auth/authorize.js";

export function masterDataRouter({ pool }) {
  const router = Router();
  router.use(requirePermission("master-data:read"));
  router.get("/suppliers", async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `select s.*, coalesce(json_agg(json_build_object('iban', b.iban, 'status', b.status)) filter (where b.id is not null), '[]') as bank_accounts
         from finops.suppliers s left join finops.supplier_bank_accounts b on b.supplier_id = s.id
         group by s.id order by s.supplier_no`,
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });
  router.get("/purchase-orders", async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `select p.*, s.supplier_no, s.legal_name as supplier_name from finops.purchase_orders p
         join finops.suppliers s on s.id = p.supplier_id order by p.po_number`,
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function usersRouter({ pool }) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try {
      const { rows } = await pool.query("select id, name, email, role from finops.users order by role, name");
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
