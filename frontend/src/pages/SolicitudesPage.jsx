import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import api from "../api/client.js";

const PRIORIDAD = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };
const MESES = [
  { v: "1", n: "Enero" },
  { v: "2", n: "Febrero" },
  { v: "3", n: "Marzo" },
  { v: "4", n: "Abril" },
  { v: "5", n: "Mayo" },
  { v: "6", n: "Junio" },
  { v: "7", n: "Julio" },
  { v: "8", n: "Agosto" },
  { v: "9", n: "Septiembre" },
  { v: "10", n: "Octubre" },
  { v: "11", n: "Noviembre" },
  { v: "12", n: "Diciembre" },
];

function aniosDisponibles() {
  const actual = new Date().getFullYear();
  const years = [];
  for (let y = actual; y >= 2024; y -= 1) years.push(y);
  return years;
}

function Badge({ color, children }) {
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: color }}>
      {children}
    </span>
  );
}

function SlaCell({ estado }) {
  if (estado === "vencido") return <span className="text-xs font-semibold text-red-600">Vencido</span>;
  if (estado === "por_vencer") return <span className="text-xs font-semibold text-amber-600">Por vencer</span>;
  if (estado === "ok") return <span className="text-xs text-emerald-700">En tiempo</span>;
  if (estado === "en_pausa") return <span className="text-xs font-semibold text-amber-700">SLA en pausa</span>;
  return <span className="text-xs text-slate-400">—</span>;
}

export default function SolicitudesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const estado = params.get("estado") || "";
  const sla = params.get("sla") || "";
  const bandeja = params.get("bandeja") || "";
  const anio = params.get("anio") || "";
  const mes = params.get("mes") || "";
  const fechaDesde = params.get("fecha_desde") || "";
  const fechaHasta = params.get("fecha_hasta") || "";
  const prioridad = params.get("prioridad") || "";
  const page = Number(params.get("page") || 1);
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      if (next === q) return;
      setFiltro("q", next);
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFiltro uses latest params
  }, [qInput]);

  const query = useMemo(
    () => ({
      q: q || undefined,
      estado: estado || undefined,
      sla: sla || undefined,
      bandeja: bandeja || undefined,
      anio: anio || undefined,
      mes: mes || undefined,
      fecha_desde: fechaDesde || undefined,
      fecha_hasta: fechaHasta || undefined,
      prioridad: prioridad || undefined,
      page,
      page_size: 50,
    }),
    [q, estado, sla, bandeja, anio, mes, fechaDesde, fechaHasta, prioridad, page]
  );

  const { data: estadosData } = useQuery({
    queryKey: ["estados"],
    queryFn: async () => (await api.get("/catalogos/estados/")).data,
  });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["solicitudes", query],
    queryFn: async () => (await api.get("/solicitudes/", { params: query })).data,
    placeholderData: keepPreviousData,
  });

  const estados = Array.isArray(estadosData) ? estadosData : estadosData?.results || [];
  const items = data?.results || (Array.isArray(data) ? data : []);
  const count = data?.count ?? items.length;
  const pages = Math.max(1, Math.ceil(count / 50));

  function setFiltro(key, value) {
    const next = new URLSearchParams(params);
    if (key !== "page") next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function limpiarFiltros() {
    const next = new URLSearchParams();
    if (bandeja) next.set("bandeja", bandeja);
    setQInput("");
    setParams(next, { replace: true });
  }

  const hayFiltros = Boolean(q || estado || sla || anio || mes || fechaDesde || fechaHasta || prioridad);
  const titulos = {
    cola: "Sin asignar",
    asignadas: "A mi cargo",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{titulos[bandeja] || "Solicitudes"}</h2>
          <p className="text-sm text-slate-500">
            {bandeja === "cola" && "Tickets enviados que todavía no tienen encargado."}
            {bandeja === "asignadas" && "Tickets abiertos donde tú eres el encargado."}
            {!bandeja && `${count} ticket${count === 1 ? "" : "s"}`}
            {isFetching && !isLoading ? " · actualizando…" : ""}
          </p>
        </div>
        <Link to="/solicitudes/nueva" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Nueva solicitud
        </Link>
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm outline-none ring-brand-primary/30 focus:ring-2"
            placeholder="Buscar mientras escribes: código, solicitante, encargado, categoría…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          {qInput ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => {
                setQInput("");
                setFiltro("q", "");
              }}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("estado", "")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !estado ? "bg-brand-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todos
          </button>
          {estados.map((e) => {
            const activo = estado === e.codigo;
            return (
              <button
                key={e.codigo}
                type="button"
                onClick={() => setFiltro("estado", activo ? "" : e.codigo)}
                className="rounded-full px-3 py-1 text-xs font-medium transition"
                style={
                  activo
                    ? { background: e.color_hex || "#1E8C87", color: "#fff" }
                    : { background: "#f1f5f9", color: "#475569" }
                }
              >
                {e.nombre}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            Año
            <select className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={anio} onChange={(e) => setFiltro("anio", e.target.value)}>
              <option value="">Todos</option>
              {aniosDisponibles().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Mes
            <select className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={mes} onChange={(e) => setFiltro("mes", e.target.value)}>
              <option value="">Todos</option>
              {MESES.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Desde
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              value={fechaDesde}
              onChange={(e) => setFiltro("fecha_desde", e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Hasta
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              value={fechaHasta}
              onChange={(e) => setFiltro("fecha_hasta", e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            SLA
            <select className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={sla} onChange={(e) => setFiltro("sla", e.target.value)}>
              <option value="">Todos</option>
              <option value="vencido">Vencidos</option>
              <option value="por_vencer">Por vencer</option>
              <option value="ok">En tiempo</option>
              <option value="en_pausa">SLA en pausa</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Prioridad
            <select className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={prioridad} onChange={(e) => setFiltro("prioridad", e.target.value)}>
              <option value="">Todas</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </label>
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className="mb-0.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Encargado</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">SLA</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No hay solicitudes con esos filtros.
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3 font-semibold">{s.codigo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {s.fecha_registro ? new Date(s.fecha_registro).toLocaleDateString("es-PE") : "—"}
                </td>
                <td className="px-4 py-3">{s.solicitante_nombre}</td>
                <td className="px-4 py-3">{s.categoria_nombre}</td>
                <td className="px-4 py-3">{s.asignado_nombre || "—"}</td>
                <td className="px-4 py-3">{PRIORIDAD[s.prioridad] || s.prioridad}</td>
                <td className="px-4 py-3">
                  <Badge color={s.estado_color}>{s.estado_nombre}</Badge>
                </td>
                <td className="px-4 py-3">
                  <SlaCell estado={s.sla_estado} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/solicitudes/${s.id}`} className="font-medium text-brand-primary">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex justify-end gap-2 text-sm">
          <button
            disabled={page <= 1}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            onClick={() => setFiltro("page", String(page - 1))}
          >
            Anterior
          </button>
          <span className="px-2 py-1 text-slate-500">
            {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            onClick={() => setFiltro("page", String(page + 1))}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
