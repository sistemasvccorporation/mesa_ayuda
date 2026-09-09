import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from "lucide-react";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { avisarCorreo } from "../utils/correo.js";

const ALLOWED = ["image/png", "image/jpeg", "application/pdf"];
const PRIORIDADES = [
  { id: "baja", label: "Baja" },
  { id: "media", label: "Media" },
  { id: "alta", label: "Alta" },
  { id: "critica", label: "Crítica" },
];

function asList(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function NuevaSolicitudPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categoria, setCategoria] = useState("");
  const [tipo, setTipo] = useState("");
  const [area, setArea] = useState(user?.area?.id_area || "");
  const [email, setEmail] = useState(user?.correo || "");
  const [telefono, setTelefono] = useState(user?.telefono_contacto || "");
  const [requerimiento, setRequerimiento] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingKind, setSavingKind] = useState(null);
  const [faltantes, setFaltantes] = useState([]);
  const [editarContacto, setEditarContacto] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const { data: categorias } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await api.get("/catalogos/categorias/")).data,
  });
  const { data: tipos } = useQuery({
    queryKey: ["tipos", categoria],
    enabled: Boolean(categoria),
    queryFn: async () => (await api.get("/catalogos/tipos-actividad/", { params: { categoria } })).data,
  });
  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => (await api.get("/catalogos/areas/")).data,
  });

  const catList = asList(categorias);
  const tipoList = asList(tipos);
  const areaList = asList(areas);
  const catActual = catList.find((c) => String(c.id) === String(categoria));
  const areaNombre = areaList.find((a) => String(a.id_area) === String(area))?.nombre || user?.area?.nombre;

  useEffect(() => {
    if (!area && user?.area?.id_area) setArea(user.area.id_area);
  }, [area, user]);

  useEffect(() => {
    if (!categoria) return;
    if (tipoList.length === 1) {
      setTipo(String(tipoList[0].id));
      setFaltantes((f) => f.filter((x) => x !== "tipo"));
    }
  }, [categoria, tipoList]);

  const listo = Boolean(categoria && tipo && area);

  function addFiles(list) {
    const incoming = Array.from(list || []);
    const invalid = incoming.find((f) => !ALLOWED.includes(f.type) && !/\.(png|jpe?g|pdf)$/i.test(f.name));
    if (invalid) {
      toast.error("Solo PNG, JPG o PDF");
      return;
    }
    setFiles((prev) => {
      const merged = [...prev];
      for (const file of incoming) {
        if (merged.some((p) => p.name === file.name && p.size === file.size)) continue;
        merged.push(file);
      }
      if (merged.length > 5) {
        toast.error("Máximo 5 archivos");
        return prev;
      }
      return merged;
    });
  }

  async function submit(enviar) {
    if (saving) return;
    const missing = [];
    if (!categoria) missing.push("categoria");
    if (!tipo) missing.push("tipo");
    if (!area) missing.push("area");
    if (missing.length) {
      setFaltantes(missing);
      toast.error("Elige categoría y tipo. El área sale de tu usuario.");
      return;
    }
    setFaltantes([]);
    const form = new FormData();
    form.append("categoria", categoria);
    form.append("tipo_actividad", tipo);
    form.append("area", area);
    form.append("email_contacto", email);
    form.append("telefono_contacto", telefono);
    form.append("requerimiento", requerimiento);
    form.append("prioridad", prioridad);
    form.append("enviar", enviar ? "true" : "false");
    files.forEach((f) => form.append("files", f));
    setSavingKind(enviar ? "send" : "draft");
    setSaving(true);
    try {
      const { data } = await api.post("/solicitudes/", form);
      toast.success(enviar ? `Solicitud ${data.codigo} enviada` : `Borrador ${data.codigo} guardado`);
      if (enviar) avisarCorreo(data);
      navigate(`/solicitudes/${data.id}`);
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(Array.isArray(d) ? d.join(" ") : d || "No se pudo guardar");
    } finally {
      setSaving(false);
      setSavingKind(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Nueva solicitud</h2>
        <p className="mt-1 text-sm text-slate-500">Elige el tema, adjunta si hace falta y envía. El estado lo pone el sistema.</p>
      </div>

      <section className="mb-4 rounded-card border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Solicitante</p>
            <p className="mt-0.5 font-semibold text-brand-charcoal">{user?.nombre_completo}</p>
            <p className="text-sm text-slate-500">
              {areaNombre || "Sin área"} · {email || "Sin correo"}
              {telefono ? ` · ${telefono}` : ""}
            </p>
          </div>
          <button type="button" className="text-xs font-medium text-brand-primary hover:underline" onClick={() => setEditarContacto((v) => !v)}>
            {editarContacto ? "Ocultar" : "Cambiar contacto o área"}
          </button>
        </div>
        {editarContacto && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-500">
              Área
              <select
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-brand-charcoal ${faltantes.includes("area") ? "border-red-500" : "border-slate-200"}`}
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setFaltantes((f) => f.filter((x) => x !== "area"));
                }}
              >
                <option value="">Seleccionar</option>
                {areaList.map((a) => (
                  <option key={a.id_area} value={a.id_area}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Correo
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Teléfono
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </label>
          </div>
        )}
      </section>

      <section className="mb-4 rounded-card border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">¿Sobre qué es?</h3>
          <span className="text-xs text-slate-400">Un clic</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {catList.map((c) => {
            const activa = String(c.id) === String(categoria);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoria(String(c.id));
                  setTipo("");
                  setFaltantes((f) => f.filter((x) => x !== "categoria"));
                }}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  activa
                    ? "border-brand-primary bg-brand-mint shadow-sm ring-1 ring-brand-primary/30"
                    : faltantes.includes("categoria")
                      ? "border-red-300 bg-red-50"
                      : "border-slate-200 bg-white hover:border-brand-secondary hover:bg-brand-mint/50"
                }`}
              >
                <div className="text-sm font-semibold text-brand-charcoal">{c.nombre}</div>
                {c.sla_horas ? <div className="mt-1 text-xs text-slate-500">Atención objetivo: {c.sla_horas} h</div> : null}
              </button>
            );
          })}
        </div>
        {categoria && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Tipo</h3>
            <div className="flex flex-wrap gap-2">
              {tipoList.map((t) => {
                const activa = String(t.id) === String(tipo);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTipo(String(t.id));
                      setFaltantes((f) => f.filter((x) => x !== "tipo"));
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                      activa ? "bg-brand-primary font-semibold text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {t.nombre}
                  </button>
                );
              })}
              {categoria && !tipoList.length && <p className="text-xs text-slate-400">Cargando tipos…</p>}
            </div>
          </div>
        )}
      </section>

      <section className="mb-4 rounded-card border border-slate-200 bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold">Prioridad</h3>
        <div className="flex flex-wrap gap-2">
          {PRIORIDADES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPrioridad(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${
                prioridad === p.id ? "bg-brand-charcoal font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {catActual?.sla_horas ? (
          <p className="mt-2 text-xs text-slate-500">
            {prioridad === "critica" || prioridad === "alta"
              ? "Alta o crítica acorta el plazo de atención."
              : `Plazo de esta categoría: ${catActual.sla_horas} horas.`}
          </p>
        ) : null}
      </section>

      <section className="mb-4 rounded-card border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold">Qué necesitas</h3>
        <p className="mb-3 text-xs text-slate-400">Opcional si adjuntas el documento o una captura.</p>
        <textarea
          id="campo-requerimiento"
          className="min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-brand-primary/30 focus:ring-2"
          value={requerimiento}
          onChange={(e) => setRequerimiento(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && listo) submit(true);
          }}
          placeholder="Equipo, módulo, síntoma o lo que debe hacer el encargado…"
        />
        <div
          className={`mt-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            arrastrando ? "border-brand-primary bg-brand-mint" : "border-slate-200 bg-slate-50/80"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <Paperclip className="mx-auto mb-2 text-brand-primary" size={22} />
          <p className="text-sm font-medium">Suelta archivos aquí o elige</p>
          <p className="mt-0.5 text-xs text-slate-400">PNG, JPG o PDF · hasta 5</p>
          <label className="mt-3 inline-block cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30">
            Examinar
            <input type="file" multiple accept=".png,.jpg,.jpeg,.pdf" className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {f.type === "application/pdf" ? <FileText size={16} className="shrink-0 text-brand-primary" /> : <ImageIcon size={16} className="shrink-0 text-brand-primary" />}
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{tamano(f.size)}</span>
                </span>
                <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => setFiles((prev) => prev.filter((x) => x !== f))} aria-label="Quitar">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed bottom-0 left-64 right-0 z-10 border-t border-slate-200 bg-white/95 px-8 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button type="button" disabled={saving} onClick={() => submit(false)} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-charcoal disabled:cursor-not-allowed disabled:opacity-50">
            {savingKind === "draft" ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Guardando…
              </>
            ) : (
              "Guardar borrador"
            )}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (saving) return;
              submit(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingKind === "send" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <Send size={16} /> Enviar solicitud
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function tamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
