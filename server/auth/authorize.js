/**
 * What each role may do. The target process says review belongs to accounts
 * payable and finance, and the money path to finance; this is that table, in
 * one place, enforced on the server.
 *
 * Approval steps are deliberately absent: which role may decide a step is a
 * property of the step itself and is enforced in the approvals domain, where
 * segregation of duties lives too.
 */
export const PERMISSIONS = {
  "invoice:upload": ["AP_CLERK", "FINANCE", "MANAGER", "CFO", "ADMIN"],
  "invoice:reprocess": ["AP_CLERK", "FINANCE", "ADMIN"],
  "review:decide": ["AP_CLERK", "FINANCE", "ADMIN"],
  "approval:decide": ["MANAGER", "FINANCE", "CFO"],
  "accounting:handoff": ["FINANCE", "ADMIN"],
  "payment:instruct": ["FINANCE", "ADMIN"],
  "payment:confirm": ["FINANCE", "ADMIN"],
  "bank:import": ["FINANCE", "ADMIN"],
  "reconciliation:run": ["FINANCE", "ADMIN"],
  "reconciliation:resolve": ["FINANCE", "ADMIN"],
};

export function may(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unbekanntes Recht: ${permission}`);
  return allowed.includes(role);
}

/** Express guard. Runs after the session middleware, so req.user is set. */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Nicht angemeldet", code: "NOT_SIGNED_IN" });
    if (!may(req.user.role, permission)) {
      return res.status(403).json({
        error: `Ihre Rolle ${req.user.role} darf diese Aktion nicht ausführen`,
        code: "ROLE_NOT_PERMITTED",
        details: { permission, role: req.user.role, allowed: PERMISSIONS[permission] },
      });
    }
    next();
  };
}

/** What this role may do, so the UI can hide what the server would refuse. */
export function permissionsFor(role) {
  return Object.entries(PERMISSIONS).filter(([, roles]) => roles.includes(role)).map(([name]) => name);
}
