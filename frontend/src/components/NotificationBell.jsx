import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import api from "../api/client.js";
import Modal from "./Modal.jsx";

function useMobileSheet() {
  const [mobile, setMobile] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mobile = useMobileSheet();

  const { data: resumen } = useQuery({
    queryKey: ["avisos-resumen"],
    queryFn: async () => (await api.get("/avisos/resumen/")).data,
    refetchInterval: 20000,
  });
  const { data: avisos } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => (await api.get("/avisos/")).data,
    enabled: open,
  });

  const lista = Array.isArray(avisos) ? avisos : avisos?.results || [];
  const noLeidos = resumen?.no_leidos || 0;

  const leer = useMutation({
    mutationFn: (id) => api.post(`/avisos/${id}/leer/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-resumen"] });
    },
  });
  const leerTodas = useMutation({
    mutationFn: () => api.post("/avisos/leer-todas/"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-resumen"] });
    },
  });

  useEffect(() => {
    function onClick(e) {
      if (window.matchMedia("(max-width: 639px)").matches) return;
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function abrirAviso(a) {
    if (!a.leido) leer.mutate(a.id);
    setOpen(false);
    if (a.solicitud) navigate(`/solicitudes/${a.solicitud}`);
  }

  const items = (
    <>
      {lista.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${a.leido ? "text-slate-500" : "bg-brand-mint/40 font-medium"}`}
            onClick={() => abrirAviso(a)}
          >
            <div className="break-words">{a.titulo}</div>
            {a.cuerpo && <div className="mt-0.5 text-xs font-normal text-slate-500 break-words">{a.cuerpo}</div>}
            <div className="mt-1 text-[11px] text-slate-400">{new Date(a.fecha).toLocaleString("es-PE")}</div>
          </button>
        </li>
      ))}
      {!lista.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No hay avisos.</li>}
    </>
  );

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Avisos"
        aria-expanded={open}
      >
        <Bell size={20} />
        {noLeidos > 0 && (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
      </button>
      {open && !mobile ? (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Avisos</span>
            {noLeidos > 0 && (
              <button type="button" className="text-xs text-brand-primary" onClick={() => leerTodas.mutate()}>
                Marcar leídos
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-auto">{items}</ul>
        </div>
      ) : null}
      <Modal
        open={open && mobile}
        onClose={() => setOpen(false)}
        title="Avisos"
        footer={
          noLeidos > 0 ? (
            <button type="button" className="w-full rounded-lg py-2.5 text-sm font-medium text-brand-primary" onClick={() => leerTodas.mutate()}>
              Marcar leídos
            </button>
          ) : null
        }
      >
        <ul>{items}</ul>
      </Modal>
    </div>
  );
}
