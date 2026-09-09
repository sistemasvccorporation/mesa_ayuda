import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client.js";

export default function UserPicker({ label, value, onChange, placeholder = "Buscar colaborador…" }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["usuarios", debounced],
    queryFn: async () => (await api.get("/usuarios/", { params: { q: debounced, page_size: 300 } })).data,
  });

  const users = data?.results || [];

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium">{label}</label>}
      <input
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-primary focus:ring-2"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="mt-1 text-xs text-slate-500">
        Se listan los usuarios activos de SIGeCom ({data?.count ?? 0}). Puedes filtrar por nombre o usuario.
      </p>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
        {isLoading && <p className="px-3 py-4 text-sm text-slate-400">Cargando usuarios…</p>}
        {isError && <p className="px-3 py-4 text-sm text-red-600">No se pudo cargar la lista.</p>}
        {!isLoading && !users.length && <p className="px-3 py-4 text-sm text-slate-400">No hay usuarios activos para mostrar.</p>}
        {users.map((u) => (
          <button
            type="button"
            key={u.id_usuario}
            onClick={() => {
              onChange(u);
              setQ(u.nombre_completo);
            }}
            className={`block w-full px-3 py-2 text-left text-sm hover:bg-brand-mint ${
              value?.id_usuario === u.id_usuario ? "bg-brand-mint" : ""
            }`}
          >
            <div className="font-medium">{u.nombre_completo}</div>
            <div className="text-xs text-slate-500">
              {u.usuario} · {u.area_nombre || "Sin área"} · {u.rol}
            </div>
          </button>
        ))}
      </div>
      {value && (
        <div className="mt-2 rounded-lg bg-brand-mint px-3 py-2 text-sm">
          Seleccionado: <strong>{value.nombre_completo}</strong>
        </div>
      )}
    </div>
  );
}
