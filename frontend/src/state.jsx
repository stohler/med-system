import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "./api";

const AuthContext = createContext(null);

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

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setAuthToken("");
  };

  const value = useMemo(() => ({ token, user, login, register, logout }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
