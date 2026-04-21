import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiClient, setAccessToken } from "../services/apiClient";
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
const TOKEN_KEY = "authToken";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loginEventKey, setLoginEventKey] = useState<string | null>(null);
  const [refreshEventKey, setRefreshEventKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setLoading(false);
      return;
    }

    setAccessToken(savedToken);
    setToken(savedToken);
    setLoginEventKey(null);
    setRefreshEventKey(`refresh:${Date.now()}:${savedToken.slice(0, 12)}`);

    apiClient
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        setAccessToken(null);
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
    sessionStorage.setItem(TOKEN_KEY, res.token);
    setAccessToken(res.token);
    setToken(res.token);
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
    sessionStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setToken(null);
    setLoginEventKey(null);
    setRefreshEventKey(null);
    setUser(null);
  }

  async function refreshMe() {
    if (!token && !sessionStorage.getItem(TOKEN_KEY)) return;
    const res = await apiClient.getMe();
    setUser(res.user);
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
