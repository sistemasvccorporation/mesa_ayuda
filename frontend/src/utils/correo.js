import { toast } from "react-toastify";

export function avisarCorreo(data) {
  const correo = data?.correo;
  if (!correo || correo.enviado) return;
  toast.warn(correo.mensaje || "El correo no fue enviado.", { autoClose: 9000 });
}
