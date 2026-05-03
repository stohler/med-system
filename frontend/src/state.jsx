import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, setAuthToken } from "./api";

const AuthContext = createContext(null);

function getJwtExpiryMs(jwt) {
  try {
    const parts = String(jwt || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function isJwtExpired(jwt) {
  const expMs = getJwtExpiryMs(jwt);
  if (expMs == null) return false;
  return expMs <= Date.now();
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("med_token") || "");
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("med_user");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    setAuthToken(token);
    if (token) localStorage.setItem("med_token", token);
    else localStorage.removeItem("med_token");
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem("med_user", JSON.stringify(user));
    else localStorage.removeItem("med_user");
  }, [user]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    setAuthToken("");
  }, []);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const statusCode = error?.response?.status;
        if (statusCode === 401 && token) {
          logoutRef.current();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const check = () => {
      if (isJwtExpired(token)) {
        logout();
      }
    };
    check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(check, 60_000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [token, logout]);

  const value = useMemo(
    () => ({ token, user, login, register, logout }),
    [token, user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
