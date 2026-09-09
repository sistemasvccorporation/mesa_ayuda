import logoVc from "../assets/logo-vc.png";

const ALT = "V&C Corporation — Optimización y automatización de procesos";

export default function BrandLogo({ variant = "sidebar", className = "" }) {
  if (variant === "login") {
    return (
      <div className={`w-[220px] rounded-2xl bg-white/95 px-4 py-3 shadow-lg shadow-black/15 backdrop-blur ${className}`}>
        <img src={logoVc} alt={ALT} className="mx-auto h-auto w-full object-contain" />
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={`mb-6 ${className}`}>
        <img src={logoVc} alt={ALT} className="mx-auto h-auto w-[220px] object-contain" />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
        <img src={logoVc} alt={ALT} className="mx-auto h-auto w-full object-contain" />
      </div>
      <p className="mt-3 text-center text-[11px] font-semibold tracking-wide text-brand-tint">SIGeCom · Mesa de Ayuda</p>
    </div>
  );
}
