import { useEffect, useState } from "react";
import { getUsers } from "./api.js";

const STORAGE_KEY = "finops.actorId";

/**
 * Who the operator is acting as. This is the MVP identity boundary (ADR-005),
 * not authentication: the server still resolves the id and enforces the role
 * and segregation-of-duties rules on every request.
 */
export function useActor() {
  const [users, setUsers] = useState([]);
  const [actorId, setActorId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    getUsers()
      .then((rows) => {
        setUsers(rows);
        setActorId((current) => (rows.some((u) => u.id === current) ? current : rows[0]?.id ?? ""));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (actorId) localStorage.setItem(STORAGE_KEY, actorId);
  }, [actorId]);

  return { users, actorId, setActorId, actor: users.find((u) => u.id === actorId) ?? null };
}
