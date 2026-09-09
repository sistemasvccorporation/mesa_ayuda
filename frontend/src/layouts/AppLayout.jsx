import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import BrandLogo from "../components/BrandLogo.jsx";
import NotificationBell from "../components/NotificationBell.jsx";

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
    isActive ? "bg-brand-primary/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;

export default function AppLayout() {
  const { user, logout, isAdmin, isTecnico } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const bandeja = new URLSearchParams(location.search).get("bandeja");
  const enLista = location.pathname === "/solicitudes";

  return (
    <div className="min-h-screen bg-[#f3f6f6] text-brand-charcoal">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-brand-charcoal">
        <div className="border-b border-white/10 px-4 py-4">
          <NavLink to="/dashboard" className="block">
            <BrandLogo />
          </NavLink>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
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
        </nav>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} /> Salir
        </button>
      </aside>
      <div className="ml-64">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Optimización y automatización de procesos</p>
            <h1 className="text-lg font-semibold">Mesa de Ayuda</h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <div className="font-medium">{user?.nombre_completo}</div>
              <div className="text-xs text-slate-500">
                {user?.area?.nombre || "Sin área"} · {user?.rol}
              </div>
            </div>
          </div>
        </header>
        <main className="p-8">
          {isAdmin && user?.correo_smtp_listo === false && location.pathname !== "/admin/configuracion" && (
            <div className="mb-6 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
