import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiClient, getStoredAccessToken, persistAccessToken, setAccessToken } from "../services/apiClient";
import type { AuthUser, PermissionKey } from "../types";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loginEventKey: string | null;
  refreshEventKey: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasPermission: (permission: PermissionKey) => boolean;
  getAllowedDepartments: (permission: PermissionKey) => string[] | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loginEventKey, setLoginEventKey] = useState<string | null>(null);
  const [refreshEventKey, setRefreshEventKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = getStoredAccessToken();
    setAccessToken(storedToken);
    if (storedToken) {
      setToken(storedToken);
    }
    apiClient
      .getMe()
      .then((res) => {
        setUser(res.user);
        setToken(storedToken || "cookie-session");
        setLoginEventKey(null);
        setRefreshEventKey(`refresh:${Date.now()}:${res.user.id}`);
      })
      .catch(() => {
        setAccessToken(null);
        persistAccessToken(null);
        setToken(null);
        setLoginEventKey(null);
        setRefreshEventKey(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;

    const syncSession = () => {
      if (document.visibilityState === "hidden") return;
      apiClient.getMe().then((res) => setUser(res.user)).catch(() => {});
    };

    window.addEventListener("focus", syncSession);
    document.addEventListener("visibilitychange", syncSession);
    return () => {
      window.removeEventListener("focus", syncSession);
      document.removeEventListener("visibilitychange", syncSession);
    };
  }, [token]);

  async function login(email: string, password: string) {
    const res = await apiClient.login({ email, password });
    const nextToken = String(res.token || "").trim() || null;
    setAccessToken(nextToken);
    persistAccessToken(nextToken);
    setToken(nextToken || "cookie-session");
    setLoginEventKey(`login:${Date.now()}:${res.user.id}`);
    setRefreshEventKey(null);
    try {
      const me = await apiClient.getMe();
      setUser(me.user);
    } catch {
      setUser(res.user);
    }
  }

  function logout() {
    void apiClient.logout().catch(() => undefined).finally(() => {
      setAccessToken(null);
      persistAccessToken(null);
      setToken(null);
      setLoginEventKey(null);
      setRefreshEventKey(null);
      setUser(null);
    });
  }

  async function refreshMe() {
    if (!token && !user) return;
    const res = await apiClient.getMe();
    setUser(res.user);
    const storedToken = getStoredAccessToken();
    setAccessToken(storedToken);
    setToken(storedToken || "cookie-session");
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loginEventKey,
      refreshEventKey,
      loading,
      isAuthenticated: !!user && !!token,
      isAdmin: user?.role === "admin",
      hasPermission: (permission: PermissionKey) =>
        user?.role === "admin" || !!user?.permissions?.some((item) => item.key === permission),
      getAllowedDepartments: (permission: PermissionKey) => {
        if (user?.role === "admin") return null;
        const assignment = user?.permissions?.find((item) => item.key === permission);
        if (!assignment) return [];
        const scoped = Array.from(new Set((assignment.allowed_departments || []).filter(Boolean)));
        if (scoped.length) return scoped;
        return user?.department ? [user.department] : [];
      },
      login,
      logout,
      refreshMe,
    }),
    [user, token, loginEventKey, refreshEventKey, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
