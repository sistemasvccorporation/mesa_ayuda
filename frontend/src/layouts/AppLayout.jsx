import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Users,
  Layers,
  Settings,
  LogOut,
  Inbox,
  UserCheck,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import BrandLogo from "../components/BrandLogo.jsx";
import NotificationBell from "../components/NotificationBell.jsx";

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
    isActive ? "bg-brand-primary/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;

export default function AppLayout() {
  const { user, logout, isAdmin, isTecnico } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const bandeja = new URLSearchParams(location.search).get("bandeja");
  const enLista = location.pathname === "/solicitudes";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const nav = (
    <>
      <NavLink to="/dashboard" className={linkClass}>
        <LayoutDashboard size={18} /> Dashboard
      </NavLink>
      <NavLink to="/solicitudes" className={() => linkClass({ isActive: enLista && !bandeja })}>
        <Ticket size={18} /> Solicitudes
      </NavLink>
      <NavLink to="/solicitudes/nueva" className={linkClass}>
        <PlusCircle size={18} /> Nueva solicitud
      </NavLink>
      {isTecnico && (
        <>
          <NavLink to="/solicitudes?bandeja=cola" className={() => linkClass({ isActive: enLista && bandeja === "cola" })}>
            <Inbox size={18} /> Sin asignar
          </NavLink>
          <NavLink to="/solicitudes?bandeja=asignadas" className={() => linkClass({ isActive: enLista && bandeja === "asignadas" })}>
            <UserCheck size={18} /> A mi cargo
          </NavLink>
        </>
      )}
      {isAdmin && (
        <>
          <NavLink to="/admin/roles" className={linkClass}>
            <Users size={18} /> Brindar permisos
          </NavLink>
          <NavLink to="/admin/catalogos" className={linkClass}>
            <Layers size={18} /> Catálogos
          </NavLink>
          <NavLink to="/admin/configuracion" className={linkClass}>
            <Settings size={18} /> Configuración
          </NavLink>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen min-w-0 bg-[#f3f6f6] text-brand-charcoal">
      {menuOpen ? (
        <button type="button" className="fixed inset-0 z-30 bg-black/45 lg:hidden" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(16rem,88vw)] flex-col bg-brand-charcoal pt-[env(safe-area-inset-top)] transition-transform duration-200 lg:pointer-events-auto lg:w-64 lg:translate-x-0 ${
          menuOpen ? "pointer-events-auto translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-4">
          <NavLink to="/dashboard" className="min-w-0 flex-1">
            <BrandLogo />
          </NavLink>
          <button type="button" className="mt-1 grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{nav}</nav>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} /> Salir
        </button>
      </aside>
      <div className="min-w-0 lg:ml-64">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-brand-charcoal hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs uppercase tracking-widest text-slate-400 sm:block">Optimización y automatización de procesos</p>
            <h1 className="truncate text-base font-semibold sm:text-lg">Mesa de Ayuda</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <NotificationBell />
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate font-medium">{user?.nombre_completo}</div>
              <div className="truncate text-xs text-slate-500">
                {user?.area?.nombre || "Sin área"} · {user?.rol}
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          {isAdmin && user?.correo_smtp_listo === false && location.pathname !== "/admin/configuracion" && (
            <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mb-6">
              Tu usuario no tiene configurado el correo SMTP. Los avisos por mail no se enviarán.{" "}
              <NavLink to="/admin/configuracion" className="font-semibold underline">
                Configurarlo
              </NavLink>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
