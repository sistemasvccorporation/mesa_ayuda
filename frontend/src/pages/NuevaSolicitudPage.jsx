import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from "lucide-react";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { avisarCorreo } from "../utils/correo.js";
import { useAvisoCorreoListo } from "../components/AvisoCorreoListo.jsx";

const ALLOWED = ["image/png", "image/jpeg", "application/pdf"];
const PRIORIDADES = [
  { id: "baja", label: "Baja" },
  { id: "media", label: "Media" },
  { id: "alta", label: "Alta" },
  { id: "critica", label: "Crítica" },
];

const CATS_POR_PAGINA = 9;
const TIPOS_POR_PAGINA = 8;

function asList(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

function paginaDe(lista, id, size) {
  const i = lista.findIndex((item) => String(item.id) === String(id));
  if (i < 0) return 1;
  return Math.floor(i / size) + 1;
}

function MiniPaginacion({ page, pages, onPage, etiqueta }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-400">
        {etiqueta} · {page} / {pages}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-35"
          onClick={() => onPage(page - 1)}
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`min-w-8 rounded-lg px-2 py-1 text-sm font-medium ${
              n === page ? "bg-brand-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pages}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-35"
          onClick={() => onPage(page + 1)}
          aria-label="Siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function NuevaSolicitudPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exigirCorreoListo, abrirSiError, modal: modalCorreo } = useAvisoCorreoListo();
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
  const [pagCat, setPagCat] = useState(1);
  const [pagTipo, setPagTipo] = useState(1);

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
    setPagTipo(1);
  }, [categoria]);

  useEffect(() => {
    if (!categoria) return;
    if (tipoList.length === 1) {
      setTipo(String(tipoList[0].id));
      setFaltantes((f) => f.filter((x) => x !== "tipo"));
    }
  }, [categoria, tipoList]);

  useEffect(() => {
    if (!categoria) return;
    setPagCat((p) => {
      const dest = paginaDe(catList, categoria, CATS_POR_PAGINA);
      return dest !== p ? dest : p;
    });
  }, [categoria, catList]);

  const paginasCat = Math.max(1, Math.ceil(catList.length / CATS_POR_PAGINA));
  const catsPagina = catList.slice((pagCat - 1) * CATS_POR_PAGINA, pagCat * CATS_POR_PAGINA);
  const paginasTipo = Math.max(1, Math.ceil(tipoList.length / TIPOS_POR_PAGINA));
  const tiposPagina = tipoList.slice((pagTipo - 1) * TIPOS_POR_PAGINA, pagTipo * TIPOS_POR_PAGINA);

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
    if (enviar && !(await exigirCorreoListo(email))) return;
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
      if (enviar && abrirSiError(err)) return;
      const d = err.response?.data?.detail;
      toast.error(Array.isArray(d) ? d.join(" ") : d || "No se pudo guardar");
    } finally {
      setSaving(false);
      setSavingKind(null);
    }
  }

  const acciones = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" disabled={saving} onClick={() => submit(false)} className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-charcoal disabled:cursor-not-allowed disabled:opacity-50">
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
        className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-5"
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
  );

  return (
    <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] xl:pb-2">
      {modalCorreo}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Nueva solicitud</h2>
          <p className="mt-1 text-sm text-slate-500">Elige el tema a la izquierda. Prioridad, detalle y envío quedan a la derecha.</p>
        </div>
      </div>

      <section className="mb-4 rounded-card border border-slate-200 bg-white px-4 py-3 sm:px-5">
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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)]">
        <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">¿Sobre qué es?</h3>
            <span className="text-xs text-slate-400">Un clic</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {catsPagina.map((c) => {
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
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
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
          <MiniPaginacion page={pagCat} pages={paginasCat} onPage={setPagCat} etiqueta="Categorías" />
          {categoria && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Tipo</h3>
              <div className="flex flex-wrap gap-2">
                {tiposPagina.map((t) => {
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
              <MiniPaginacion page={pagTipo} pages={paginasTipo} onPage={setPagTipo} etiqueta="Tipos" />
            </div>
          )}
        </section>

        <div className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-semibold">Prioridad</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrioridad(p.id)}
                  className={`rounded-lg px-3 py-2 text-sm ${
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

          <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-1 text-sm font-semibold">Qué necesitas</h3>
            <p className="mb-3 text-xs text-slate-400">Opcional si adjuntas el documento o una captura.</p>
            <textarea
              id="campo-requerimiento"
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-brand-primary/30 focus:ring-2 xl:min-h-28"
              value={requerimiento}
              onChange={(e) => setRequerimiento(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && listo) submit(true);
              }}
              placeholder="Equipo, módulo, síntoma o lo que debe hacer el encargado…"
            />
            <div
              className={`mt-3 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
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
              <Paperclip className="mx-auto mb-1.5 text-brand-primary" size={20} />
              <p className="text-sm font-medium">Suelta archivos o elige</p>
              <p className="mt-0.5 text-xs text-slate-400">PNG, JPG o PDF · hasta 5</p>
              <label className="mt-2 inline-block cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30">
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
            <div className="mt-4 hidden border-t border-slate-100 pt-4 xl:block">{acciones}</div>
          </section>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden sm:px-8">
        {acciones}
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
