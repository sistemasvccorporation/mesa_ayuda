import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "../api/client.js";
import UserPicker from "../components/UserPicker.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

export default function RolesPage() {
  const { user: yo } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const { data } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get("/admin/roles/")).data,
  });

  const admins = (data || []).filter((r) => r.rol === "admin");

  const grant = useMutation({
    mutationFn: (id) => api.post("/admin/roles/", { id_usuario: id, rol: "admin" }),
    onSuccess: () => {
      toast.success("Ya tiene los mismos permisos que tú. Debe volver a entrar para verlos.");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "No se pudo asignar"),
  });

  const revoke = useMutation({
    mutationFn: (id) => api.post("/admin/roles/", { id_usuario: id, rol: "solicitante" }),
    onSuccess: () => {
      toast.success("Se quitaron los permisos de administrador.");
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "No se pudo quitar"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-card border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold">Brindar permisos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Elige un colaborador activo y dale <strong>los mismos permisos que tú</strong>: verá todas las
          solicitudes, podrá asignar encargados y podrá dar permisos a otras personas. No hay rol de técnico
          aquí; eso se define al asignar cada solicitud.
        </p>
        <div className="mt-4">
          <UserPicker label="¿A quién le das tus permisos?" value={selected} onChange={setSelected} />
        </div>
        <button
          disabled={!selected}
          onClick={() => grant.mutate(selected.id_usuario)}
          className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Brindar permisos
        </button>
      </div>
      <div className="rounded-card border border-slate-200 bg-white p-6">
        <h3 className="font-semibold">Quién puede ver y hacer lo mismo que tú</h3>
        <ul className="mt-3 divide-y text-sm">
          {admins.map((r) => (
            <li key={r.id_usuario} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{r.usuario?.nombre_completo || r.id_usuario}</div>
                <div className="text-xs text-slate-500">{r.usuario?.usuario}</div>
              </div>
              {r.id_usuario !== yo?.id_usuario ? (
                <button
                  onClick={() => revoke.mutate(r.id_usuario)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Quitar permisos
                </button>
              ) : (
                <span className="text-xs text-slate-400">Tú</span>
              )}
            </li>
          ))}
          {!admins.length && <li className="py-3 text-slate-400">Aún no hay administradores listados.</li>}
        </ul>
      </div>
    </div>
  );
}
