import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const EVENTOS_USUARIO = [
  { id: "enviado", label: "Cuando se registra / envía la solicitud" },
  { id: "asignado", label: "Cuando se asigna un encargado" },
  { id: "en_atencion", label: "Cuando entra en atención o se reabre" },
  { id: "pendiente_usuario", label: "Cuando se espera una respuesta suya" },
  { id: "derivado", label: "Cuando se deriva a otro encargado" },
  { id: "atendido", label: "Cuando se marca como resuelta" },
  { id: "cerrado", label: "Cuando se cierra" },
  { id: "cancelado", label: "Cuando se cancela" },
];

const VACIO = {
  correo_destino: "",
  smtp_host: "",
  smtp_puerto: 587,
  smtp_usuario: "",
  smtp_clave: "",
  smtp_tls: true,
  smtp_ssl: false,
  correo_remitente: "",
  avisar_solicitante: true,
  avisar_solicitante_eventos: EVENTOS_USUARIO.map((e) => e.id),
};

export default function ConfiguracionPage() {
  const { user, loadMe } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(VACIO);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["config-mesa", user?.id_usuario],
    queryFn: async () =>
      (
        await api.get("/admin/configuracion/", {
          params: { usuario: user.id_usuario, _: Date.now() },
        })
      ).data,
    enabled: Boolean(user?.id_usuario),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!data) return;
    if (user?.id_usuario && data.id_usuario && Number(data.id_usuario) !== Number(user.id_usuario)) {
      return;
    }
    setForm({
      correo_destino: data.correo_destino || "",
      smtp_host: data.smtp_host || "",
      smtp_puerto: data.smtp_puerto || 587,
      smtp_usuario: data.smtp_usuario || "",
      smtp_clave: "",
      smtp_tls: data.smtp_tls !== false,
      smtp_ssl: Boolean(data.smtp_ssl),
      correo_remitente: data.correo_remitente || "",
      avisar_solicitante: data.avisar_solicitante !== false,
      avisar_solicitante_eventos: Array.isArray(data.avisar_solicitante_eventos)
        ? data.avisar_solicitante_eventos
        : EVENTOS_USUARIO.map((e) => e.id),
    });
  }, [data, user?.id_usuario]);

  const guardar = useMutation({
    mutationFn: (payload) => api.patch("/admin/configuracion/", payload),
    onSuccess: (res) => {
      const saved = res.data;
      toast.success("Se guardó tu configuración. Los avisos saldrán con tu correo.");
      qc.setQueryData(["config-mesa", user?.id_usuario], saved);
      loadMe?.();
    },
    onError: (e) => toast.error(e.response?.data?.detail || "No se pudo guardar"),
  });

  const probar = useMutation({
    mutationFn: () =>
      api.post("/admin/configuracion/probar/", {
        correo: form.correo_destino || user?.correo,
        smtp_host: form.smtp_host,
        smtp_puerto: form.smtp_puerto,
        smtp_usuario: form.smtp_usuario,
        smtp_clave: form.smtp_clave,
        smtp_tls: form.smtp_tls,
        smtp_ssl: form.smtp_ssl,
        correo_remitente: form.correo_remitente,
      }),
    onSuccess: (res) => toast.success(`Correo de prueba enviado a ${(res.data.enviado_a || []).join(", ")}`),
    onError: (e) => toast.error(e.response?.data?.detail || "No se pudo enviar la prueba"),
  });

  function set(k, v) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "correo_destino") {
        const prev = (f.correo_destino || "").trim();
        if (!(f.smtp_usuario || "").trim() || f.smtp_usuario.trim() === prev) next.smtp_usuario = v;
        if (!(f.correo_remitente || "").trim() || f.correo_remitente.trim() === prev) next.correo_remitente = v;
      }
      return next;
    });
  }

  function usarMiCorreo() {
    const correo = (data?.correo_sugerido || user?.correo || "").trim();
    if (!correo) {
      toast.error("Tu usuario SIGeCom no tiene correo. Escríbelo arriba y guarda.");
      return;
    }
    setForm((f) => ({
      ...f,
      correo_destino: correo,
      smtp_usuario: correo,
      correo_remitente: correo,
    }));
  }

  function presetOffice() {
    setForm((f) => ({ ...f, smtp_host: "smtp.office365.com", smtp_puerto: 587, smtp_tls: true, smtp_ssl: false }));
  }

  function presetCpanel() {
    setForm((f) => ({ ...f, smtp_host: "mail.vc-corporation.com", smtp_puerto: 465, smtp_tls: false, smtp_ssl: true }));
  }

  function presetGmail() {
    setForm((f) => ({ ...f, smtp_host: "smtp.gmail.com", smtp_puerto: 587, smtp_tls: true, smtp_ssl: false }));
  }

  function toggleEvento(id) {
    setForm((f) => {
      const tiene = f.avisar_solicitante_eventos.includes(id);
      return {
        ...f,
        avisar_solicitante_eventos: tiene
          ? f.avisar_solicitante_eventos.filter((e) => e !== id)
          : [...f.avisar_solicitante_eventos, id],
      };
    });
  }

  function onSave() {
    const destino = (form.correo_destino || "").trim();
    const payload = {
      ...form,
      correo_destino: destino,
      smtp_usuario: (form.smtp_usuario || "").trim() || destino,
      correo_remitente: (form.correo_remitente || "").trim() || destino,
    };
    if (!payload.smtp_clave) delete payload.smtp_clave;
    guardar.mutate(payload);
  }

  if (isLoading) return <p>Cargando…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">Configuración de correo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Esta ficha es solo de <strong>{data?.usuario_nombre || user?.nombre_completo}</strong>
          {data?.usuario ? ` (${data.usuario})` : user?.correo ? ` (${user.correo})` : ""}. Otro administrador entra con
          su usuario y ve la suya, no la tuya.
        </p>
        {isFetching ? <p className="mt-1 text-xs text-slate-400">Actualizando tu configuración…</p> : null}
      </div>

      {data && !data.smtp_listo && (
        <div className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Aún no tienes configurado el envío SMTP. Mientras tanto, cuando cambies una solicitud verás el aviso{" "}
          <strong>«El correo no fue enviado»</strong>. Completa servidor, tu correo y la clave, y guarda.
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Bandeja de la mesa</h3>
              <button type="button" className="text-xs font-medium text-brand-primary hover:underline" onClick={usarMiCorreo}>
                Usar mi correo SIGeCom{user?.correo ? ` (${user.correo})` : ""}
              </button>
            </div>
            <label className="block text-sm font-medium">
              Correo donde llegan las solicitudes
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                type="email"
                value={form.correo_destino}
                onChange={(e) => set("correo_destino", e.target.value)}
                placeholder="tu.correo@vc-corporation.com"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Llegan a <strong>tu</strong> bandeja. El correo de otro admin no se mezcla con el tuyo.
            </p>
          </section>

          <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold">Avisos al usuario de la solicitud</h3>
                <p className="mt-1 text-sm text-slate-500">
                  El correo llega al contacto de cada ticket (el que el usuario indicó al registrarla, o el de su cuenta SIGeCom).
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 self-start text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-primary"
                  checked={form.avisar_solicitante}
                  onChange={(e) => set("avisar_solicitante", e.target.checked)}
                />
                Activado
              </label>
            </div>
            <div className={`grid gap-2 sm:grid-cols-2 ${form.avisar_solicitante ? "" : "pointer-events-none opacity-50"}`}>
              {EVENTOS_USUARIO.map((ev) => (
                <label key={ev.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-brand-primary"
                    checked={form.avisar_solicitante_eventos.includes(ev.id)}
                    onChange={() => toggleEvento(ev.id)}
                  />
                  <span>{ev.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Servidor de envío (SMTP)</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" className="rounded-full bg-brand-primary px-3 py-1 font-medium text-white" onClick={presetCpanel}>
                  cPanel V&C
                </button>
                <button type="button" className="rounded-full bg-slate-100 px-3 py-1 font-medium" onClick={presetOffice}>
                  Office 365
                </button>
                <button type="button" className="rounded-full bg-slate-100 px-3 py-1 font-medium" onClick={presetGmail}>
                  Gmail
                </button>
              </div>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              El correo corporativo de V&C sale por cPanel. Servidor: <strong>mail.vc-corporation.com</strong>, puerto{" "}
              <strong>465</strong> con SSL. Usuario y remitente: el correo completo de ese admin (ej. ronaldo.roman@vc-corporation.com).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Servidor
                <input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="mail.vc-corporation.com" />
              </label>
              <label className="text-sm font-medium">
                Puerto
                <input className="mt-1 w-full rounded-lg border px-3 py-2" type="number" value={form.smtp_puerto} onChange={(e) => set("smtp_puerto", Number(e.target.value) || 587)} />
              </label>
              <label className="flex items-end gap-4 pb-2 text-sm">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={form.smtp_tls} onChange={(e) => set("smtp_tls", e.target.checked)} /> TLS
                </span>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={form.smtp_ssl} onChange={(e) => set("smtp_ssl", e.target.checked)} /> SSL
                </span>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Usuario SMTP (normalmente tu correo)
                <input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.smtp_usuario} onChange={(e) => set("smtp_usuario", e.target.value)} placeholder={user?.correo || ""} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Contraseña o contraseña de aplicación
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  type="password"
                  autoComplete="new-password"
                  value={form.smtp_clave}
                  onChange={(e) => set("smtp_clave", e.target.value)}
                  placeholder={data?.smtp_clave_configurada ? "••••••••  (deja vacío para no cambiarla)" : "Clave del buzón en cPanel / webmail"}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Es la contraseña de esa cuenta de correo en cPanel (webmail), no la de SIGeCom. Si antes usabas Office 365, escríbela de nuevo y guarda.
                </p>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Remitente (From)
                <input className="mt-1 w-full rounded-lg border px-3 py-2" type="email" value={form.correo_remitente} onChange={(e) => set("correo_remitente", e.target.value)} placeholder="El mismo correo corporativo" />
              </label>
            </div>
          </section>

          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" disabled={probar.isPending || guardar.isPending} onClick={() => probar.mutate()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {probar.isPending ? "Enviando…" : "Enviar correo de prueba"}
            </button>
            <button type="button" disabled={guardar.isPending || probar.isPending} onClick={onSave} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {guardar.isPending ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
