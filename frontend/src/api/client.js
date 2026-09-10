import axios from "axios";
import { actualizarCacheTrasCambio } from "./cache.js";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["Cache-Control"] = "no-cache";
  config.headers.Pragma = "no-cache";
  const metodo = String(config.method || "get").toLowerCase();
  if (metodo === "get") {
    const params = config.params && typeof config.params === "object" ? config.params : {};
    config.params = { ...params, _: Date.now() };
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    try {
      actualizarCacheTrasCambio(res);
    } catch {
      /* la UI no debe fallar si no se pudo refrescar */
    }
    return res;
  },
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh");
      if (!refresh) {
        localStorage.removeItem("access");
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post("/api/auth/refresh/", { refresh });
        localStorage.setItem("access", data.access);
        if (data.refresh) localStorage.setItem("refresh", data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
