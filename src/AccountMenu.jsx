import { useEffect, useRef } from "react";
import {
  ChevronDown,
  CircleHelp,
  Ellipsis,
  Headphones,
  Library,
  LogOut,
  Smartphone,
} from "lucide-react";

export function accountLabel(user) {
  const metadata = user?.user_metadata;
  return (
    [metadata?.display_name, metadata?.full_name, user?.email?.split("@")[0]]
      .find((value) => typeof value === "string" && value.trim())
      ?.trim() || "Tu cuenta"
  );
}

export default function AccountMenu({
  user,
  localOnly,
  open,
  onToggle,
  onClose,
  onLogin,
  onLogout,
  onLibrary,
  onAbout,
  onInstall,
  canInstall,
}) {
  const root = useRef(null);
  const toggle = useRef(null);
  const label = accountLabel(user);
  const initial = Array.from(label)[0]?.toLocaleUpperCase("es") || "?";
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) onClose();
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        onClose();
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open, onClose]);
  const choose = (action) => {
    onClose();
    action();
  };
  return (
    <div className="account-controls" ref={root}>
      {!user && (
        <button className="guest-login" onClick={() => choose(onLogin)}>
          Iniciar sesión
        </button>
      )}
      <div className="menu-anchor">
        <button
          ref={toggle}
          className={user ? "profile-button" : "icon-button guest-options"}
          aria-label={user ? "Abrir perfil" : "Opciones de Onda"}
          title={user ? label : "Opciones de Onda"}
          aria-expanded={open}
          aria-controls={open ? "onda-account-options" : undefined}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) onToggle();
              requestAnimationFrame(() =>
                root.current?.querySelector(".profile-menu button")?.focus(),
              );
            }
          }}
        >
          {user ? (
            <>
              <span className="avatar" aria-hidden="true">
                {initial}
              </span>
              <ChevronDown size={14} />
            </>
          ) : (
            <Ellipsis size={21} />
          )}
        </button>
        {open && (
          <div
            className="dropdown profile-menu"
            id="onda-account-options"
            role="group"
            aria-label={user ? "Opciones de tu cuenta" : "Opciones de tu espacio local"}
          >
            <strong className="profile-email">{user ? label : "Tu espacio local"}</strong>
            <span>{user ? user.email : "Escucha tus archivos sin crear una cuenta."}</span>
            {localOnly && user && (
              <p className="pwa-menu-note">
                Perfil local sin conexión. Podrás cambiar de cuenta cuando vuelva internet.
              </p>
            )}
            <button onClick={() => choose(onLibrary)}>
              <Library size={16} /> Mi biblioteca
            </button>
            <button onClick={() => choose(onInstall)}>
              <Smartphone size={16} /> {canInstall ? "Instalar Onda" : "Usar sin conexión"}
            </button>
            <button onClick={() => choose(onAbout)}>
              <CircleHelp size={16} /> Acerca de Onda
            </button>
            <div className="account-menu-divider" />
            {user ? (
              <button onClick={() => choose(onLogout)}>
                <LogOut size={16} /> Cerrar sesión
              </button>
            ) : (
              <button onClick={() => choose(onLogin)}>
                <Headphones size={16} /> Iniciar sesión o registrarte
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
