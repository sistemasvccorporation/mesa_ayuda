import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { FileDown, Loader2 } from "lucide-react";
import UserPicker from "../components/UserPicker.jsx";
import { avisarCorreo } from "../utils/correo.js";

const PRIORIDAD = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };

export default function DetalleSolicitudPage() {
  const { id } = useParams();
  const { isAdmin, isTecnico, user } = useAuth();
  const qc = useQueryClient();
  const [encargado, setEncargado] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [interno, setInterno] = useState(false);
  const [archivosComentario, setArchivosComentario] = useState([]);

  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const enviandoRef = useRef(false);

  function liberar() {
    enviandoRef.current = false;
  }

  function intentar(fn) {
    if (enviandoRef.current) return false;
    enviandoRef.current = true;
    fn();
    return true;
  }

  const { data: s, isLoading } = useQuery({
    queryKey: ["solicitud", id],
    queryFn: async () => (await api.get(`/solicitudes/${id}/`)).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["solicitud", id] });
    qc.invalidateQueries({ queryKey: ["solicitudes"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["avisos"] });
    qc.invalidateQueries({ queryKey: ["avisos-resumen"] });
  };

  const asignar = useMutation({
    mutationFn: () => api.post(`/solicitudes/${id}/asignar/`, { id_encargado: encargado.id_usuario, motivo }),
    onSuccess: (res) => {
      toast.success("Encargado asignado. El ticket quedó en Asignado.");
      avisarCorreo(res.data);
      setMotivo("");
      refresh();
    },
    onError: (e) => toast.error(detalleError(e) || "No se pudo asignar"),
    onSettled: liberar,
  });

  const derivar = useMutation({
    mutationFn: () => api.post(`/solicitudes/${id}/derivar/`, { id_encargado: encargado.id_usuario, motivo }),
    onSuccess: (res) => {
      toast.success("Solicitud derivada al nuevo encargado");
      avisarCorreo(res.data);
      setMotivo("");
      refresh();
    },
    onError: (e) => toast.error(detalleError(e) || "No se pudo derivar"),
    onSettled: liberar,
  });

  const transicionar = useMutation({
    mutationFn: (accion) => api.post(`/solicitudes/${id}/transicion/`, { estado: accion.codigo, motivo }),
    onSuccess: (res, accion) => {
      toast.success(accion.etiqueta || "Acción aplicada");
      avisarCorreo(res.data);
      setMotivo("");
      refresh();
    },
    onError: (e) => toast.error(detalleError(e) || "No se pudo completar la acción"),
    onSettled: liberar,
  });

  const comentar = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("cuerpo", comentario);
      form.append("es_interno", interno ? "true" : "false");
      archivosComentario.forEach((f) => form.append("files", f));
      return api.post(`/solicitudes/${id}/comentarios/`, form);
    },
    onSuccess: () => {
      setComentario("");
      setArchivosComentario([]);
      refresh();
    },
    onError: (e) => toast.error(detalleError(e) || "No se pudo publicar"),
    onSettled: liberar,
  });

  const tomar = useMutation({
    mutationFn: () => api.post(`/solicitudes/${id}/asignar/`, { tomar: true }),
    onSuccess: (res) => {
      toast.success("Tomaste esta solicitud");
      avisarCorreo(res.data);
      refresh();
    },
    onError: (e) => toast.error(detalleError(e) || "No se pudo tomar"),
    onSettled: liberar,
  });

  if (isLoading || !s) return <p>Cargando…</p>;

  const puedeAsignar = (isAdmin || isTecnico) && !["cerrado", "cancelado"].includes(s.estado_codigo);
  const acciones = Array.isArray(s.acciones) ? s.acciones : [];
  const esFinal = ["cerrado", "cancelado"].includes(s.estado_codigo);

  const ocupado =
    transicionar.isPending || asignar.isPending || derivar.isPending || comentar.isPending || tomar.isPending || descargandoPdf;

  function ejecutar(accion) {
    if (ocupado || enviandoRef.current) return;
    if (accion.requiere_motivo && !motivo.trim()) {
      toast.error("Escribe el motivo o la nota de resolución antes de continuar.");
      return;
    }
    intentar(() => transicionar.mutate(accion));
  }

  async function onDescargarPdf() {
    if (ocupado) return;
    setDescargandoPdf(true);
    try {
      await descargarPdfTicket(s);
    } finally {
      setDescargandoPdf(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <div className="min-w-0 space-y-6">
        <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-slate-400">{s.codigo}</p>
              <h2 className="text-xl font-bold sm:text-2xl">{s.categoria_nombre}</h2>
              <p className="text-sm text-slate-500">{s.tipo_nombre}</p>
            </div>
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: s.estado_color }}>
                {s.estado_nombre}
              </span>
              <SlaBadge solicitud={s} />
              {s.confirmado_solicitante_en && (
                <span className="text-[11px] font-medium text-emerald-700">Confirmado por el solicitante</span>
              )}
              <button
                type="button"
                disabled={ocupado}
                onClick={onDescargarPdf}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {descargandoPdf ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Generando PDF…
                  </>
                ) : (
                  <>
                    <FileDown size={14} /> Descargar ticket PDF
                  </>
                )}
              </button>
            </div>
          </div>
          <dl className="mt-6 grid gap-3 text-sm md:grid-cols-2">
            <Item k="Solicitante" v={s.solicitante_nombre} />
            <Item k="Área" v={s.area_nombre} />
            <Item k="Encargado" v={s.asignado_nombre || "Sin asignar"} />
            <Item k="Prioridad" v={PRIORIDAD[s.prioridad] || s.prioridad} />
            <Item k="Correo" v={s.email_contacto} />
            <Item k="Teléfono" v={s.telefono_contacto} />
            <Item k="Límite SLA" v={s.fecha_limite ? new Date(s.fecha_limite).toLocaleString("es-PE") : "Sin SLA"} />
            <Item k="Registrado" v={s.fecha_registro ? new Date(s.fecha_registro).toLocaleString("es-PE") : "—"} />
          </dl>
          {s.requerimiento?.trim() ? (
            <p className="mt-6 whitespace-pre-wrap rounded-lg bg-brand-mint p-4 text-sm">{s.requerimiento}</p>
          ) : null}
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Adjuntos</h3>
            {(s.adjuntos || []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No se adjuntó ningún archivo.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(s.adjuntos || []).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="break-all font-medium text-brand-charcoal">{a.nombre_original}</div>
                      <div className="text-xs text-slate-500">{tamanoLegible(a.tamano_bytes)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => abrirAdjunto(s.id, a, false)} className="flex-1 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white sm:flex-none sm:py-1.5">
                        Ver
                      </button>
                      <button type="button" onClick={() => abrirAdjunto(s.id, a, true)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium sm:flex-none sm:py-1.5">
                        Descargar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="font-semibold">Comentarios</h3>
          <ul className="mt-3 space-y-3">
            {(s.comentarios || []).map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="text-xs text-slate-400">
                  {c.autor_nombre} {c.es_interno ? "· interno" : ""} · {new Date(c.fecha).toLocaleString("es-PE")}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.cuerpo}</p>
                {(c.adjuntos || []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.adjuntos.map((a) => (
                      <li key={a.id}>
                        <button type="button" className="text-xs font-medium text-brand-primary" onClick={() => abrirAdjunto(s.id, a, false)}>
                          {a.nombre_original}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {!s.comentarios?.length && <p className="text-sm text-slate-400">Aún no hay comentarios.</p>}
          </ul>
          {!esFinal && (
            <>
              <textarea
                className="mt-4 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Escribe un comentario para dejar constancia en el ticket."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf"
                className="mt-2 w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs"
                onChange={(e) => setArchivosComentario(Array.from(e.target.files || []))}
              />
              {archivosComentario.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">{archivosComentario.map((f) => f.name).join(", ")}</p>
              )}
              {user?.rol !== "solicitante" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} /> Solo visible para el equipo
                </label>
              )}
              <button
                type="button"
                disabled={!comentario.trim() || ocupado}
                onClick={() => {
                  if (ocupado || !comentario.trim()) return;
                  intentar(() => comentar.mutate());
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {comentar.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Publicando…
                  </>
                ) : (
                  "Publicar comentario"
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="font-semibold">Acciones</h3>
          <p className="mt-1 text-xs text-slate-500">
            El estado cambia según lo que hagas: tomar, resolver, esperar al usuario o cerrar. No se elige el código a mano.
          </p>
          {acciones.some((a) => a.requiere_motivo) && (
            <textarea
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Motivo o nota (obligatorio para resolver, cerrar, cancelar o reabrir)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          )}
          <div className="mt-3 flex flex-col gap-2">
            {acciones.map((accion) => {
              const este =
                transicionar.isPending &&
                transicionar.variables?.codigo === accion.codigo &&
                transicionar.variables?.etiqueta === accion.etiqueta;
              return (
                <button
                  key={accion.codigo + accion.etiqueta}
                  type="button"
                  disabled={ocupado}
                  onClick={() => ejecutar(accion)}
                  className={`${claseAccion(accion.variante)} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {este ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Enviando…
                    </>
                  ) : (
                    accion.etiqueta
                  )}
                </button>
              );
            })}
            {!acciones.length && (
              <p className="text-xs text-slate-400">
                {esFinal ? "Esta solicitud ya está cerrada o cancelada." : "No hay acciones disponibles para tu rol en este momento."}
              </p>
            )}
          </div>
        </div>

        {puedeAsignar && (
          <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="font-semibold">Encargado</h3>
            <p className="mb-3 mt-1 text-xs text-slate-500">Asignar deja el ticket en Asignado. Derivar exige un motivo.</p>
            <UserPicker value={encargado} onChange={setEncargado} />
            <textarea
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Nota de asignación o motivo de derivación"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={!encargado || ocupado}
                onClick={() => {
                  if (!encargado || ocupado) return;
                  intentar(() => asignar.mutate());
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {asignar.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Asignando…
                  </>
                ) : (
                  "Asignar a este usuario"
                )}
              </button>
              <button
                type="button"
                disabled={!encargado || !motivo.trim() || ocupado}
                onClick={() => {
                  if (!encargado || !motivo.trim() || ocupado) return;
                  intentar(() => derivar.mutate());
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {derivar.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Derivando…
                  </>
                ) : (
                  "Derivar a este usuario"
                )}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  if (ocupado) return;
                  intentar(() => tomar.mutate());
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tomar.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Tomando…
                  </>
                ) : (
                  "Tomar yo esta solicitud"
                )}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="font-semibold">Historial</h3>
          <ol className="mt-3 space-y-2 text-xs">
            {(s.historial || []).map((h) => (
              <li key={h.id}>
                <strong>
                  {h.estado_origen_nombre || "Nuevo"} → {h.estado_destino_nombre || h.estado_destino}
                </strong>
                <div className="text-slate-500">
                  {h.actor_nombre} · {new Date(h.fecha).toLocaleString("es-PE")}
                </div>
                {h.motivo && <div className="mt-0.5 text-slate-600">{h.motivo}</div>}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function claseAccion(variante) {
  if (variante === "danger") return "rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-medium text-red-700";
  if (variante === "neutral") return "rounded-lg border py-2 text-sm";
  return "rounded-lg bg-brand-primary py-2 text-sm font-semibold text-white disabled:opacity-50";
}

function SlaBadge({ solicitud }) {
  const estado = solicitud.sla_estado;
  if (!estado || estado === "no_aplica" || estado === "sin_sla") return null;
  const styles = {
    vencido: "bg-red-100 text-red-700",
    por_vencer: "bg-amber-100 text-amber-800",
    ok: "bg-emerald-100 text-emerald-800",
    en_pausa: "bg-amber-50 text-amber-800",
  };
  const labels = {
    vencido: "SLA vencido",
    por_vencer: "SLA por vencer",
    ok: "Dentro de SLA",
    en_pausa: "SLA en pausa (espera al usuario)",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[estado]}`}>{labels[estado]}</span>;
}

function Item({ k, v }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-400">{k}</dt>
      <dd className="break-words">{v || "—"}</dd>
    </div>
  );
}

function tamanoLegible(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function detalleError(err) {
  const d = err.response?.data?.detail;
  if (Array.isArray(d)) return d.join(" ");
  return d;
}

async function descargarPdfTicket(solicitud) {
  try {
    const { data } = await api.get(`/solicitudes/${solicitud.id}/pdf/`, { responseType: "blob" });
    const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ticket-${solicitud.codigo || solicitud.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch {
    toast.error("No se pudo descargar el PDF del ticket.");
  }
}

async function abrirAdjunto(solicitudId, adjunto, descargar) {
  try {
    const { data } = await api.get(`/solicitudes/${solicitudId}/adjuntos/${adjunto.id}/download/`, {
      responseType: "blob",
    });
    const type = adjunto.content_type || data.type || "application/octet-stream";
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    if (descargar) {
      const a = document.createElement("a");
      a.href = url;
      a.download = adjunto.nombre_original || "adjunto";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    toast.error("No se pudo abrir el archivo");
  }
}
