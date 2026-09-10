let queryClient = null;
let aplicarUsuario = null;

export function conectarCache(client) {
  queryClient = client;
}

export function conectarSesion(setUser) {
  aplicarUsuario = setUser;
}

const IGNORAR = /\/auth\/(login|logout|refresh)\//;

const REGLAS = [
  { test: /\/auth\/me/, keys: [["config-mesa"], ["avisos"], ["avisos-resumen"]] },
  { test: /\/admin\/configuracion/, keys: [["config-mesa"]] },
  { test: /\/admin\/roles/, keys: [["roles"]] },
  { test: /\/catalogos\/categorias/, keys: [["categorias"], ["categorias-admin"]] },
  { test: /\/catalogos\/tipos-actividad/, keys: [["tipos"], ["tipos-admin"]] },
  {
    test: /\/solicitudes/,
    keys: [["solicitudes"], ["solicitud"], ["dashboard"], ["avisos"], ["avisos-resumen"]],
  },
  { test: /\/avisos/, keys: [["avisos"], ["avisos-resumen"]] },
];

function esMutacion(method) {
  return ["post", "put", "patch", "delete"].includes(String(method || "").toLowerCase());
}

export function actualizarCacheTrasCambio(response) {
  if (!response?.config || !esMutacion(response.config.method)) return;
  const url = `${response.config.baseURL || ""}${response.config.url || ""}`;
  if (IGNORAR.test(url) || IGNORAR.test(response.config.url || "")) return;

  const data = response.data;
  if (aplicarUsuario && data && typeof data === "object" && data.id_usuario && /\/auth\/me/.test(url + (response.config.url || ""))) {
    aplicarUsuario(data);
  }

  if (!queryClient) return;
  const destino = `${response.config.url || ""} ${url}`;
  const vistas = new Set();
  for (const regla of REGLAS) {
    if (!regla.test.test(destino) && !regla.test.test(response.config.url || "")) continue;
    for (const queryKey of regla.keys) {
      const marca = queryKey.join(":");
      if (vistas.has(marca)) continue;
      vistas.add(marca);
      queryClient.invalidateQueries({ queryKey });
    }
  }
}
