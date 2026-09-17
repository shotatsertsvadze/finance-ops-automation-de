import { useCallback, useEffect, useState } from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "./api.js";

/**
 * The signed-in user, as the server reports it. Nothing about identity is kept
 * client-side: this only mirrors what the session cookie already proves.
 */
export function useSession() {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [checked, setChecked] = useState(false);

  const adopt = (body) => {
    setUser(body.user);
    setPermissions(body.permissions ?? []);
  };

  useEffect(() => {
    getMe()
      .then(adopt)
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const body = await loginRequest(email, password);
    adopt(body);
    return body.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => {});
    setUser(null);
    setPermissions([]);
  }, []);

  // The server decides; this only hides what it would refuse.
  const may = useCallback((permission) => permissions.includes(permission), [permissions]);

  return { user, permissions, may, checked, login, logout };
}
