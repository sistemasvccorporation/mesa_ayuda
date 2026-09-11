import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Plus,
  Trophy,
  Users,
} from "lucide-react";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

async function downloadReport(path, filename, params) {
  const { data } = await api.get(path, { responseType: "blob", params });
  const url = window.URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

const MESA = ["admin", "tecnico"];
const PEDIDO = ["solicitante"];

const KPI = [
  {
    key: "todas",
    label: "Solicitudes",
    hint: "Total del período",
    hintSolicitante: "Todas las que registraste",
    to: "/solicitudes",
    icon: ClipboardList,
    tone: "teal",
    roles: [...MESA, ...PEDIDO],
  },
  {
    key: "abiertas",
    label: "Abiertas",
    hint: "Aún en curso, sin resolver",
    hintSolicitante: "Tus tickets aún en curso",
    to: "/solicitudes?bandeja=abiertas",
    icon: FolderOpen,
    tone: "teal",
    roles: [...MESA, ...PEDIDO],
  },
  {
    key: "vencidas",
    label: "Vencidas",
    hint: "Ya están dentro de Abiertas",
    hintSolicitante: "De tus abiertas, fuera de plazo",
    to: "/solicitudes?bandeja=abiertas&sla=vencido",
    icon: AlertTriangle,
    tone: "rose",
    subset: true,
    roles: [...MESA, ...PEDIDO],
  },
  {
    key: "atendidas",
    label: "Resueltas",
    hint: "Marcadas como resueltas",
    hintSolicitante: "Tus tickets ya resueltos",
    to: "/solicitudes?estado=atendido",
    icon: CheckCircle2,
    tone: "green",
    roles: [...MESA, ...PEDIDO],
  },
  {
    key: "cerradas",
    label: "Cerradas",
    hint: "Ciclo completado",
    hintSolicitante: "Tus tickets cerrados",
    to: "/solicitudes?estado=cerrado",
    icon: CircleDot,
    tone: "slate",
    roles: [...MESA, ...PEDIDO],
  },
];

function enlaceKpi(to, anio) {
  const url = new URL(to, "https://local");
  if (anio) url.searchParams.set("anio", anio);
  return `${url.pathname}${url.search}`;
}

const TONE = {
  teal: {
    bar: "bg-brand-primary",
    icon: "bg-[#E6F5F4] text-brand-primary",
    value: "text-brand-charcoal",
  },
  rose: {
    bar: "bg-rose-500",
    icon: "bg-rose-50 text-rose-600",
    value: "text-rose-700",
  },
  amber: {
    bar: "bg-amber-500",
    icon: "bg-amber-50 text-amber-700",
    value: "text-amber-800",
  },
  orange: {
    bar: "bg-orange-500",
    icon: "bg-orange-50 text-orange-700",
    value: "text-orange-800",
  },
  green: {
    bar: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-700",
    value: "text-emerald-800",
  },
  slate: {
    bar: "bg-slate-500",
    icon: "bg-slate-100 text-slate-600",
    value: "text-brand-charcoal",
  },
  indigo: {
    bar: "bg-indigo-500",
    icon: "bg-indigo-50 text-indigo-700",
    value: "text-indigo-800",
  },
};

function iniciales(nombre) {
  return (nombre || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function medalla(puesto) {
  if (puesto === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm";
  if (puesto === 2) return "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800";
  if (puesto === 3) return "bg-gradient-to-br from-orange-200 to-orange-400 text-orange-950";
  return "bg-slate-100 text-slate-600";
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const rol = user?.rol || "solicitante";
  const esMesa = rol === "admin" || rol === "tecnico";
  const kpis = KPI.filter((item) => item.roles.includes(rol));
  const actual = String(new Date().getFullYear());
  const [anio, setAnio] = useState(actual);
  const params = useMemo(() => ({ anio: anio || undefined }), [anio]);
  const { data } = useQuery({
    queryKey: ["dashboard", anio],
    queryFn: async () => (await api.get("/reportes/dashboard/", { params })).data,
  });

  const porEstado = (data?.por_estado || [])
    .filter((r) => r.estado_id !== "borrador")
    .map((r) => ({
      name: r.estado__nombre,
      total: r.total,
      color: r.estado__color_hex,
    }));
  const categorias = data?.por_categoria || [];
  const maxCat = Math.max(1, ...categorias.map((c) => c.total));
  const ranking = data?.ranking_solicitantes || [];
  const maxRanking = ranking[0]?.total || 1;
  const anios = [];
  for (let y = Number(actual); y >= 2024; y -= 1) anios.push(String(y));
  const nombre = user?.nombre_completo?.split(" ")[0] || "";
  const totalMesa = data?.totales?.todas ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-brand-charcoal px-4 py-5 text-white shadow-lg shadow-brand-charcoal/10 sm:px-6 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-primary/30 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-brand-secondary/20 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-tint">
              {rol === "admin" ? "Panel de administración" : rol === "tecnico" ? "Panel del encargado" : "Mis solicitudes"}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Hola, {nombre}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              {esMesa
                ? totalMesa
                  ? `${totalMesa} solicitud${totalMesa === 1 ? "" : "es"} en ${anio || "todos los años"}. Pulsa un estado para filtrar.`
                  : "Aún no hay movimiento en este período. Cuando entren tickets, aquí verás carga de la mesa, ranking y reportes."
                : totalMesa
                  ? `Tienes ${totalMesa} solicitud${totalMesa === 1 ? "" : "es"} en ${anio || "todos los años"}.`
                  : "Cuando registres una solicitud, aquí verás su avance."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white/80">
              Año
              <select
                className="ml-2 rounded-lg border-0 bg-white/15 px-2 py-1 text-sm text-white outline-none"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
              >
                <option value="" className="text-brand-charcoal">
                  Todos
                </option>
                {anios.map((y) => (
                  <option key={y} value={y} className="text-brand-charcoal">
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Link
              to="/solicitudes/nueva"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-primary/30 hover:bg-brand-hover sm:w-auto"
            >
              <Plus size={16} /> Nueva solicitud
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((item) => {
          const Icon = item.icon;
          const tone = TONE[item.tone];
          const value = data?.totales?.[item.key] ?? 0;
          const hint = !esMesa && item.hintSolicitante ? item.hintSolicitante : item.hint;
          return (
            <Link
              key={item.key}
              to={enlaceKpi(item.to, anio)}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(45,45,45,0.45)] transition hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-[0_16px_30px_-18px_rgba(30,140,135,0.45)]"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
              <div className="flex items-start justify-between gap-3 pl-2">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone.icon}`}>
                  <Icon size={18} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-primary">
                  Ver listado
                </span>
              </div>
              <div className={`mt-4 pl-2 text-3xl font-extrabold tracking-tight ${tone.value}`}>{value}</div>
              <div className="mt-1 pl-2 text-sm font-semibold text-brand-charcoal">{item.label}</div>
              <div className="pl-2 text-xs text-slate-500">{hint}</div>
            </Link>
          );
        })}
      </section>
      <p className="-mt-2 text-xs text-slate-500">
        Abiertas + resueltas + cerradas = el total. Las vencidas no se suman aparte: son abiertas fuera de plazo.
        {data?.totales?.canceladas ? ` Hay ${data.totales.canceladas} cancelada${data.totales.canceladas === 1 ? "" : "s"}.` : ""}
      </p>

      <section className={`grid gap-6 ${esMesa ? "xl:grid-cols-[1.15fr_0.85fr]" : ""}`}>
        {esMesa && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(45,45,45,0.45)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <Trophy size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold">Ranking de usuarios</h3>
                <p className="text-sm text-slate-500">Quién ha registrado más solicitudes en el período.</p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => downloadReport("/reportes/solicitudes.xlsx", "reporte_mesa_ayuda.xlsx", params)}
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => downloadReport("/reportes/solicitudes.pdf", "reporte_mesa_ayuda.pdf", params)}
                >
                  <Download size={14} /> PDF
                </button>
              </div>
            )}
          </div>
          {!ranking.length ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-12 text-center">
              <Users className="mb-3 text-slate-300" size={36} />
              <p className="text-sm font-medium text-slate-600">Todavía no hay ranking</p>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Cuando el equipo registre solicitudes, aquí saldrá el orden por volumen, con barras y puesto.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {ranking.map((row) => (
                <li
                  key={`${row.usuario}-${row.puesto}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${medalla(row.puesto)}`}>
                    {row.puesto}
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                    {iniciales(row.nombre)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="truncate font-semibold">{row.nombre}</div>
                      <div className="text-sm font-bold text-brand-primary">{row.total}</div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.usuario} · {row.area}
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary"
                        style={{ width: `${Math.max(8, (row.total / maxRanking) * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        )}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(45,45,45,0.45)] sm:p-6">
          <h3 className="text-lg font-bold">Por categoría</h3>
          <p className="mb-5 text-sm text-slate-500">Distribución de tickets según el tipo de requerimiento.</p>
          {!categorias.length ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-12 text-center">
              <p className="text-sm text-slate-400">Aún no hay datos de categoría.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {categorias.map((row) => (
                <li key={row.categoria__nombre}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{row.categoria__nombre}</span>
                    <span className="tabular-nums font-bold text-brand-primary">{row.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-primary"
                      style={{ width: `${Math.max(6, (row.total / maxCat) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(45,45,45,0.45)] sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold">Por estado</h3>
          <p className="text-sm text-slate-500">
            {esMesa ? "Cómo está la carga de la mesa en este momento." : "Cómo van tus solicitudes en este momento."}
          </p>
        </div>
        {porEstado.length ? (
          <div className="h-64 min-w-0 overflow-x-auto sm:h-72">
            <div className="h-full min-w-[28rem] sm:min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porEstado} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  cursor={{ fill: "rgba(30,140,135,0.06)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Bar dataKey="total" radius={[8, 8, 4, 4]}>
                  {porEstado.map((entry) => (
                    <Cell key={entry.name} fill={entry.color || "#1E8C87"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="grid h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-400">
            El gráfico aparecerá cuando haya solicitudes.
          </div>
        )}
      </section>
    </div>
  );
}
