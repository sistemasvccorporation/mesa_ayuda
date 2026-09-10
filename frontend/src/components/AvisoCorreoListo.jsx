import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Modal from "./Modal.jsx";

const AVISO_ADMIN = {
  titulo: "Configura tu correo primero",
  texto:
    "No puedes enviar la solicitud hasta que tu correo SMTP esté listo. Completa servidor, tu correo y la clave en Configuración, y envía una prueba.",
  to: "/admin/configuracion",
  boton: "Ir a Configuración",
};

const AVISO_PERFIL = {
  titulo: "Falta tu correo",
  texto: "Antes de enviar una solicitud, guarda tu correo corporativo en tu perfil.",
  to: "/perfil",
  boton: "Ir a Mi perfil",
};

export function useAvisoCorreoListo() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [aviso, setAviso] = useState(null);

  async function exigirCorreoListo(emailContacto = "") {
    let me = user;
    try {
      const { data } = await api.get("/auth/me/");
      me = data;
    } catch {
      /* usamos el usuario de sesión */
    }

    const admin = isAdmin || me?.rol === "admin";
    if (admin && me?.correo_smtp_listo === false) {
      setAviso(AVISO_ADMIN);
      return false;
    }

    const correo = String(emailContacto || me?.correo || "").trim();
    if (!admin && !correo) {
      setAviso(AVISO_PERFIL);
      return false;
    }
    return true;
  }

  function abrirSiError(err) {
    const d = err?.response?.data?.detail;
    const texto = Array.isArray(d) ? d.join(" ") : String(d || "");
    if (texto.toLowerCase().includes("smtp") || texto.toLowerCase().includes("configuración")) {
      setAviso(AVISO_ADMIN);
      return true;
    }
    return false;
  }

  const modal = (
    <Modal
      open={Boolean(aviso)}
      onClose={() => setAviso(null)}
      title={aviso?.titulo}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setAviso(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            onClick={() => {
              const destino = aviso?.to;
              setAviso(null);
              if (destino) navigate(destino);
            }}
          >
            {aviso?.boton}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{aviso?.texto}</p>
    </Modal>
  );

  return { exigirCorreoListo, abrirSiError, modal };
}
