import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Headset, Loader2, Lock, ShieldCheck, Ticket, User } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../auth/AuthContext.jsx";
import BrandLogo from "../components/BrandLogo.jsx";
import heroMesa from "../assets/login-mesa-hero.png";
import detalleMesa from "../assets/login-mesa-detail.png";

const PILLS = [
  { icon: Ticket, label: "Tickets con seguimiento" },
  { icon: Headset, label: "Atención de la mesa" },
  { icon: ShieldCheck, label: "SLA y cierre controlado" },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(usuario.trim(), password);
      toast.success("Bienvenido a Mesa de Ayuda");
      navigate("/dashboard");
    } catch {
      toast.error("Credenciales inválidas o usuario inactivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(min(100%,420px),0.92fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-brand-charcoal lg:block">
        <img
          src={heroMesa}
          alt="Especialistas de la mesa de ayuda atendiendo requerimientos"
          className="login-hero-photo absolute inset-0 h-full w-full object-cover object-[center_20%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/55 to-[#141414]/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/40 to-transparent" />

        <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
          <BrandLogo variant="login" />

          <figure className="pointer-events-none absolute bottom-44 right-8 hidden w-[230px] overflow-hidden rounded-2xl border border-white/25 shadow-[0_24px_60px_rgba(0,0,0,0.45)] xl:block">
            <img src={detalleMesa} alt="Estación de trabajo de la mesa de ayuda" className="h-36 w-full object-cover" />
            <figcaption className="bg-[#1a1a1a]/85 px-3.5 py-2.5 text-[11px] leading-snug text-white/80 backdrop-blur-md">
              Cada solicitud queda registrada, asignada y con rastro hasta el cierre.
            </figcaption>
          </figure>

          <div className="max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-tint">SIGeCom · Mesa de Ayuda</p>
            <h2 className="font-display mt-3 text-[2.35rem] font-medium leading-[1.15] tracking-tight text-white xl:text-[2.7rem]">
              Acompañamos cada requerimiento hasta resolverlo.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/72">
              Un espacio corporativo para registrar, asignar y dar seguimiento a los tickets de V&C, con el mismo
              cuidado que la operación.
            </p>
            <ul className="mt-7 flex flex-wrap gap-2">
              {PILLS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md"
                >
                  <Icon size={13} className="text-brand-tint" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <section className="relative flex min-h-screen flex-col items-center justify-center bg-[#F3F7F7] px-4 py-8 sm:px-6 sm:py-12 lg:block lg:flex-none">
        <div className="relative mb-8 h-40 w-full max-w-[420px] overflow-hidden rounded-2xl lg:hidden">
          <img src={heroMesa} alt="" className="h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent" />
          <p className="absolute bottom-3 left-4 text-xs font-medium text-white/90">SIGeCom · Mesa de Ayuda</p>
        </div>
        <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_top_right,rgba(30,140,135,0.08),transparent_42%)] lg:block" />
        <div className="lg:flex lg:min-h-screen lg:items-center lg:justify-center">
        <form
          onSubmit={onSubmit}
          className="relative w-full max-w-[420px] rounded-[22px] border border-white bg-white px-5 py-7 shadow-[0_20px_60px_rgba(45,45,45,0.08)] sm:px-8 sm:py-9"
        >
          <div className="lg:hidden">
            <BrandLogo variant="form" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">Acceso al sistema</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-brand-charcoal">Iniciar sesión</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Ingresa con tu usuario SIGeCom. El correo no sirve como usuario.
          </p>

          <label className="mt-7 block text-sm font-medium text-brand-charcoal">Usuario</label>
          <div className="relative mt-1.5">
            <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-[#F8FBFB] py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-brand-primary/20"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="nombre.apellido"
              autoComplete="username"
              required
            />
          </div>

          <label className="mt-4 block text-sm font-medium text-brand-charcoal">Contraseña</label>
          <div className="relative mt-1.5">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 bg-[#F8FBFB] py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-brand-primary/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            disabled={loading}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-primary/25 transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "Ingresando…" : "Entrar"}
          </button>

          <p className="mt-6 text-center text-[11px] tracking-wide text-slate-400">
            V&C Corporation · Optimización y automatización de procesos
          </p>
        </form>
        </div>
      </section>
    </div>
  );
}
