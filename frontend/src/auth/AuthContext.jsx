import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client.js";
import { conectarSesion } from "../api/cache.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  async function loadMe() {
    const token = localStorage.getItem("access");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me/");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    conectarSesion(setUser);
    return () => conectarSesion(null);
  }, []);

  async function login(usuario, password) {
    const { data } = await api.post("/auth/login/", { usuario, password });
    localStorage.setItem("access", data.access);
    localStorage.setItem("refresh", data.refresh);
    qc.clear();
    try {
      const me = await api.get("/auth/me/");
      setUser(me.data);
      return me.data;
    } catch {
      setUser(data.user);
      return data.user;
    }
  }

  async function logout() {
    const refresh = localStorage.getItem("refresh");
    try {
      await api.post("/auth/logout/", { refresh });
    } catch {
      /* ignore */
    }
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    qc.clear();
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      loadMe,
      isAdmin: user?.rol === "admin",
      isTecnico: user?.rol === "tecnico" || user?.rol === "admin",
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
