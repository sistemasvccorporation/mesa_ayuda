import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { UserRound } from "lucide-react";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const ESTADOS_CIVILES = ["Soltero", "Casado", "Union libre", "Divorciado", "Viudo"];

const VACIO = {
  nombre_completo: "",
  correo: "",
  correo_personal: "",
  telefono: "",
  movil_personal: "",
  movil_coorporativo: "",
  dni: "",
  documento: "",
  direccion: "",
  estado_civil: "",
  genero: "",
  fecha_nacimiento: "",
};

function texto(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  return String(valor);
}

function fechaInput(valor) {
  if (!valor) return "";
  return String(valor).slice(0, 10);
}

function iniciales(nombre) {
  return (nombre || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-slate-400">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-brand-charcoal">{valor || "—"}</dd>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="block text-sm font-medium text-brand-charcoal">
      {label}
      {children}
    </label>
  );
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-primary/30 focus:ring-2";

export default function PerfilPage() {
  const { user, loadMe } = useAuth();
  const [form, setForm] = useState(VACIO);

  useEffect(() => {
    if (!user) return;
    setForm({
      nombre_completo: texto(user.nombre_completo),
      correo: texto(user.correo),
      correo_personal: texto(user.correo_personal),
      telefono: texto(user.telefono),
      movil_personal: texto(user.movil_personal),
      movil_coorporativo: texto(user.movil_coorporativo),
      dni: texto(user.dni),
      documento: texto(user.documento),
      direccion: texto(user.direccion),
      estado_civil: texto(user.estado_civil),
      genero: texto(user.genero).toUpperCase(),
      fecha_nacimiento: fechaInput(user.fecha_nacimiento),
    });
  }, [user]);

  const guardar = useMutation({
    mutationFn: (payload) => api.patch("/auth/me/", payload),
    onSuccess: async () => {
      toast.success("Se actualizaron tus datos.");
      await loadMe?.();
    },
    onError: (e) => {
      const d = e.response?.data;
      if (d && typeof d === "object" && !Array.isArray(d)) {
        const primero = Object.values(d).flat()[0];
        toast.error(typeof primero === "string" ? primero : d.detail || "No se pudo guardar");
        return;
      }
      toast.error(d?.detail || "No se pudo guardar");
    },
  });

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSave(e) {
    e.preventDefault();
    guardar.mutate({
      ...form,
      correo: form.correo.trim(),
      correo_personal: form.correo_personal.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      genero: form.genero || null,
      estado_civil: form.estado_civil || null,
    });
  }

  const rolEtiqueta = { admin: "Administrador", tecnico: "Encargado", solicitante: "Solicitante" }[user?.rol] || user?.rol;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-brand-charcoal px-4 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-primary text-lg font-bold">
            {iniciales(user?.nombre_completo)}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-tint">Mi perfil</p>
            <h2 className="mt-1 truncate text-xl font-bold sm:text-2xl">{user?.nombre_completo}</h2>
            <p className="mt-1 text-sm text-white/70">
              {user?.usuario} · {rolEtiqueta}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserRound size={18} className="text-brand-primary" />
          <h3 className="font-semibold">Datos de la cuenta</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">Estos datos salen de SIGeCom y no se cambian desde la mesa.</p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Dato etiqueta="Usuario" valor={user?.usuario} />
          <Dato etiqueta="Rol en la mesa" valor={rolEtiqueta} />
          <Dato etiqueta="Área" valor={user?.area?.nombre} />
          <Dato etiqueta="Cargo" valor={user?.cargo?.nombre} />
          <Dato etiqueta="Ingreso" valor={user?.fecha_ingreso ? new Date(user.fecha_ingreso).toLocaleDateString("es-PE") : ""} />
          <Dato etiqueta="Estado" valor={user?.activo === 1 || user?.activo === true ? "Activo" : "Inactivo"} />
          <Dato etiqueta="Banco" valor={user?.banco?.nombre} />
          <Dato etiqueta="N.° de cuenta" valor={user?.nro_cuenta} />
        </dl>
      </section>

      <form onSubmit={onSave} className="rounded-card border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="font-semibold">Datos personales</h3>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          Puedes actualizar tu correo y datos de contacto. El correo corporativo también se usa en la configuración de avisos.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre completo">
            <input className={inputClass} value={form.nombre_completo} onChange={(e) => set("nombre_completo", e.target.value)} required />
          </Campo>
          <Campo label="DNI">
            <input className={inputClass} inputMode="numeric" maxLength={8} value={form.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </Campo>
          <Campo label="Correo corporativo">
            <input className={inputClass} type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} placeholder="nombre.apellido@vc-corporation.com" />
          </Campo>
          <Campo label="Correo personal">
            <input className={inputClass} type="email" value={form.correo_personal} onChange={(e) => set("correo_personal", e.target.value)} />
          </Campo>
          <Campo label="Teléfono">
            <input className={inputClass} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </Campo>
          <Campo label="Móvil personal">
            <input className={inputClass} value={form.movil_personal} onChange={(e) => set("movil_personal", e.target.value)} />
          </Campo>
          <Campo label="Móvil corporativo">
            <input className={inputClass} value={form.movil_coorporativo} onChange={(e) => set("movil_coorporativo", e.target.value)} />
          </Campo>
          <Campo label="Documento">
            <input className={inputClass} value={form.documento} onChange={(e) => set("documento", e.target.value)} />
          </Campo>
          <Campo label="Fecha de nacimiento">
            <input className={inputClass} type="date" value={form.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} />
          </Campo>
          <Campo label="Género">
            <select className={inputClass} value={form.genero} onChange={(e) => set("genero", e.target.value)}>
              <option value="">Sin indicar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </Campo>
          <Campo label="Estado civil">
            <select className={inputClass} value={form.estado_civil} onChange={(e) => set("estado_civil", e.target.value)}>
              <option value="">Sin indicar</option>
              {ESTADOS_CIVILES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              {form.estado_civil && !ESTADOS_CIVILES.includes(form.estado_civil) ? (
                <option value={form.estado_civil}>{form.estado_civil}</option>
              ) : null}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Dirección">
              <input className={inputClass} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </Campo>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={guardar.isPending}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
          >
            {guardar.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
