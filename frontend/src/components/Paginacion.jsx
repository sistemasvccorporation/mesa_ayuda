import { ChevronLeft, ChevronRight } from "lucide-react";

function paginasVisibles(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual, actual - 1, actual + 1]);
  if (actual <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (actual >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  return [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
}

export default function Paginacion({ page, pages, count, pageSize, onPage, onPageSize, sizes = [10, 25, 50] }) {
  const totalPaginas = Math.max(1, pages || 1);
  const actual = Math.min(Math.max(1, page || 1), totalPaginas);
  const desde = count ? (actual - 1) * pageSize + 1 : 0;
  const hasta = Math.min(actual * pageSize, count || 0);
  const nums = paginasVisibles(actual, totalPaginas);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-xs text-slate-500 sm:text-sm">
        {count
          ? `Mostrando ${desde}–${hasta} de ${count}`
          : "Sin registros"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Por página
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
            value={String(pageSize)}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={actual <= 1}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-35"
            onClick={() => onPage(actual - 1)}
            aria-label="Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          {nums.map((n, i) => {
            const prev = nums[i - 1];
            return (
              <span key={n} className="contents">
                {prev && n - prev > 1 ? <span className="px-1 text-slate-400">…</span> : null}
                <button
                  type="button"
                  className={`min-w-8 rounded-lg px-2 py-1 text-sm font-medium ${
                    n === actual ? "bg-brand-primary text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => onPage(n)}
                >
                  {n}
                </button>
              </span>
            );
          })}
          <button
            type="button"
            disabled={actual >= totalPaginas}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-35"
            onClick={() => onPage(actual + 1)}
            aria-label="Siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
