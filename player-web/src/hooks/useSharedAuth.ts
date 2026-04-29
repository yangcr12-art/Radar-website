import { type FormEvent, useEffect, useState } from "react";
import { fetchAuthStatus, loginSharedSession, logoutSharedSession } from "../api/storageClient";
import { setStorageScope } from "../utils/storageScope";

type AuthStatus = "checking" | "anonymous" | "authenticated";

export function useSharedAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authUsername, setAuthUsername] = useState("player");
  const [loginUsername, setLoginUsername] = useState("player");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authHydrationVersion, setAuthHydrationVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadAuthStatus = async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        const usernameHint = String(status?.usernameHint || "player").trim() || "player";
        const currentUsername = String(status?.username || "").trim();
        if (status?.authenticated && currentUsername) {
          setStorageScope(currentUsername);
        } else {
          setStorageScope("anonymous");
        }
        setAuthUsername(currentUsername || usernameHint);
        setLoginUsername(usernameHint);
        setAuthStatus(status?.authenticated ? "authenticated" : "anonymous");
      } catch {
        if (cancelled) return;
        setStorageScope("anonymous");
        setAuthStatus("anonymous");
      }
    };
    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = loginUsername.trim();
    if (!username || !loginPassword) {
      setLoginError("请输入共享账号和密码。");
      return;
    }

    setLoginSubmitting(true);
    setLoginError("");
    try {
      const result = await loginSharedSession(username, loginPassword);
      const nextUsername = String(result?.username || username).trim() || username;
      setStorageScope(nextUsername);
      setAuthUsername(nextUsername);
      setLoginUsername(nextUsername);
      setLoginPassword("");
      setAuthStatus("authenticated");
      setAuthHydrationVersion((prev) => prev + 1);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败。");
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutSharedSession();
    } catch {
      // Ignore logout errors and still force the client back to the login screen.
    }
    setStorageScope("anonymous");
    setAuthStatus("anonymous");
    setLoginPassword("");
    setLoginError("");
    setAuthHydrationVersion((prev) => prev + 1);
  };

  return {
    authStatus,
    authUsername,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    loginSubmitting,
    loginError,
    setLoginError,
    handleLogin,
    handleLogout,
    authHydrationVersion
  };
}

export default useSharedAuth;
