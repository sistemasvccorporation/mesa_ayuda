import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ChevronDown } from "lucide-react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";

function listOf(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function CatalogosPage() {
  const qc = useQueryClient();
  const { data: categorias, isLoading: loadingCat } = useQuery({
    queryKey: ["categorias-admin"],
    queryFn: async () => (await api.get("/catalogos/categorias/")).data,
  });
  const { data: tipos, isLoading: loadingTipos } = useQuery({
    queryKey: ["tipos-admin"],
    queryFn: async () => (await api.get("/catalogos/tipos-actividad/")).data,
  });

  const cats = listOf(categorias);
  const tps = listOf(tipos);

  const [catForm, setCatForm] = useState({ nombre: "", codigo: "", sla_horas: 24, descripcion: "" });
  const [tipoForm, setTipoForm] = useState({ nombre: "", categoria: "", codigo: "" });
  const [editCat, setEditCat] = useState(null);
  const [abrirCats, setAbrirCats] = useState(false);

  const saveCat = useMutation({
    mutationFn: (payload) =>
      payload.id ? api.patch(`/catalogos/categorias/${payload.id}/`, payload) : api.post("/catalogos/categorias/", payload),
    onSuccess: () => {
      toast.success("Categoría guardada");
      setCatForm({ nombre: "", codigo: "", sla_horas: 24, descripcion: "" });
      setEditCat(null);
      qc.invalidateQueries({ queryKey: ["categorias-admin"] });
      qc.invalidateQueries({ queryKey: ["categorias"] });
    },
    onError: (e) => toast.error(e.response?.data?.codigo?.[0] || e.response?.data?.detail || "No se pudo guardar"),
  });

  const toggleCat = useMutation({
    mutationFn: (c) => api.patch(`/catalogos/categorias/${c.id}/`, { activo: !c.activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorias-admin"] });
      qc.invalidateQueries({ queryKey: ["categorias"] });
    },
  });

  const saveTipo = useMutation({
    mutationFn: (payload) => api.post("/catalogos/tipos-actividad/", payload),
    onSuccess: () => {
      toast.success("Tipo de actividad creado");
      setTipoForm({ nombre: "", categoria: tipoForm.categoria, codigo: "" });
      qc.invalidateQueries({ queryKey: ["tipos-admin"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "No se pudo crear el tipo"),
  });

  const toggleTipo = useMutation({
    mutationFn: (t) => api.patch(`/catalogos/tipos-actividad/${t.id}/`, { activo: !t.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-admin"] }),
  });

  const catsActivas = useMemo(() => cats.filter((c) => c.activo), [cats]);
  const catElegida = catsActivas.find((c) => String(c.id) === String(tipoForm.categoria));
  const tiposFiltrados = useMemo(() => {
    if (!tipoForm.categoria) return tps;
    return tps.filter((t) => String(t.categoria) === String(tipoForm.categoria));
  }, [tps, tipoForm.categoria]);

  function editarCategoria(c) {
    setEditCat(c.id);
    setCatForm({
      nombre: c.nombre,
      codigo: c.codigo,
      sla_horas: c.sla_horas || 24,
      descripcion: c.descripcion || "",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">Catálogos</h2>
        <p className="text-sm text-slate-500">
          Aquí se configuran las categorías, los tipos de trabajo y el SLA en horas. El SLA se acorta si la prioridad es alta o crítica.
        </p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-card border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="font-semibold">{editCat ? "Editar categoría" : "Nueva categoría"}</h3>
          <div className="mt-3 grid gap-2">
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Nombre"
              value={catForm.nombre}
              onChange={(e) => setCatForm({ ...catForm, nombre: e.target.value })}
            />
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Código (opcional, ej. SOP)"
              value={catForm.codigo}
              onChange={(e) => setCatForm({ ...catForm, codigo: e.target.value })}
            />
            <label className="text-xs text-slate-500">
              SLA en horas
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={catForm.sla_horas}
                onChange={(e) => setCatForm({ ...catForm, sla_horas: Number(e.target.value) })}
              />
            </label>
            <button
              disabled={!catForm.nombre.trim()}
              onClick={() => saveCat.mutate({ ...catForm, id: editCat || undefined, activo: true })}
              className="rounded-lg bg-brand-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {editCat ? "Guardar cambios" : "Agregar categoría"}
            </button>
            {editCat && (
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => {
                  setEditCat(null);
                  setCatForm({ nombre: "", codigo: "", sla_horas: 24, descripcion: "" });
                }}
              >
                Cancelar edición
              </button>
            )}
          </div>
          <ul className="mt-5 space-y-2 text-sm">
            {loadingCat && <li className="text-slate-400">Cargando…</li>}
            {cats.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 border-b border-slate-100 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <div className="min-w-0">
                  <div className={c.activo ? "font-medium" : "text-slate-400 line-through"}>{c.nombre}</div>
                  <div className="text-xs text-slate-400">
                    {c.codigo} · SLA {c.sla_horas ? `${c.sla_horas} h` : "sin definir"}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="text-brand-primary" onClick={() => editarCategoria(c)}>
                    Editar
                  </button>
                  <button className="text-slate-500" onClick={() => toggleCat.mutate(c)}>
                    {c.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-card border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="font-semibold">Tipos de actividad</h3>
          <div className="mt-3 grid min-w-0 gap-2">
            <button
              type="button"
              onClick={() => setAbrirCats(true)}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm"
            >
              <span className={`min-w-0 truncate ${catElegida ? "text-brand-charcoal" : "text-slate-400"}`}>
                {catElegida?.nombre || "Categoría del tipo"}
              </span>
              <ChevronDown size={16} className="shrink-0 text-slate-400" />
            </button>
            <input
              className="min-w-0 rounded-lg border px-3 py-2 text-sm"
              placeholder="Nombre del tipo (ej. Accesos)"
              value={tipoForm.nombre}
              onChange={(e) => setTipoForm({ ...tipoForm, nombre: e.target.value })}
            />
            <button
              disabled={!tipoForm.nombre.trim() || !tipoForm.categoria}
              onClick={() => saveTipo.mutate({ nombre: tipoForm.nombre, categoria: tipoForm.categoria })}
              className="rounded-lg bg-brand-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Agregar tipo
            </button>
          </div>
          <ul className="mt-5 max-h-[min(24rem,50vh)] space-y-2 overflow-auto text-sm">
            {loadingTipos && <li className="text-slate-400">Cargando…</li>}
            {tiposFiltrados.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 border-b border-slate-100 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className={t.activo ? "min-w-0" : "min-w-0 text-slate-400 line-through"}>
                  <div className="break-words">{t.nombre}</div>
                  <div className="break-words text-xs text-slate-400">{t.categoria_nombre}</div>
                </div>
                <button className="self-start text-xs text-slate-500 sm:self-auto" onClick={() => toggleTipo.mutate(t)}>
                  {t.activo ? "Desactivar" : "Activar"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal
        open={abrirCats}
        onClose={() => setAbrirCats(false)}
        title="Categoría del tipo"
        footer={
          tipoForm.categoria ? (
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600"
              onClick={() => {
                setTipoForm({ ...tipoForm, categoria: "" });
                setAbrirCats(false);
              }}
            >
              Quitar filtro
            </button>
          ) : null
        }
      >
        <ul className="space-y-1">
          {catsActivas.map((c) => {
            const activa = String(c.id) === String(tipoForm.categoria);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-3 text-left text-sm ${
                    activa ? "bg-brand-mint font-semibold text-brand-primary" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    setTipoForm({ ...tipoForm, categoria: String(c.id) });
                    setAbrirCats(false);
                  }}
                >
                  <span className="block break-words">{c.nombre}</span>
                </button>
              </li>
            );
          })}
          {!catsActivas.length && <li className="px-1 py-4 text-center text-sm text-slate-400">No hay categorías activas.</li>}
        </ul>
      </Modal>
    </div>
  );
}
