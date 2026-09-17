import { human, SYSTEM } from "../domain/workflow/transitions.js";

/** Resolves X-Actor-Id against finops.users. MVP identity boundary, see ADR-005. */
export function actorMiddleware(pool) {
  return async (req, res, next) => {
    const actorId = req.get("x-actor-id");
    if (!actorId) {
      req.actor = SYSTEM;
      return next();
    }
    if (!/^[0-9a-f-]{36}$/i.test(actorId)) return res.status(400).json({ error: "X-Actor-Id ist keine gültige Benutzer-ID" });
    const { rows: [user] } = await pool.query("select id, name, email, role from finops.users where id = $1", [actorId]);
    if (!user) return res.status(400).json({ error: "Unbekannter Akteur" });
    req.actor = human(user.id);
    req.user = user;
    next();
  };
}

export function requireHuman(req, res, next) {
  if (req.actor.type !== "HUMAN") return res.status(400).json({ error: "Diese Aktion erfordert einen Akteur (X-Actor-Id)" });
  next();
}
