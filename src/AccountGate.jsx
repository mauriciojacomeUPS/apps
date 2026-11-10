import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { X, ArrowRight, Mail, LockKeyhole, Headphones } from "lucide-react";
import { api } from "./api";
import "./account.css";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
function authMessage(error) {
  if (/invalid login credentials/i.test(error.message))
    return "El correo o la contraseña no coinciden.";
  if (/email not confirmed/i.test(error.message))
    return "Confirma tu correo antes de iniciar sesión.";
  if (/rate limit|too many/i.test(error.message))
    return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  if (/fetch|network/i.test(error.message))
    return "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  return error.message || "No se pudo completar la solicitud.";
}
export default function AccountGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    let active = true;
    api
      .session()
      .then(({ user }) => {
        if (active) setUser(user);
      })
      .catch(() => {
        if (active)
          setSessionError(
            "No se pudo comprobar tu sesión. Puedes seguir usando la biblioteca de este dispositivo.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = api.onAuthChange((next) => {
      setUser(next);
      if (next) {
        setOpen(false);
        setPassword("");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const root = dialog.current;
    const inputs = () => [...root.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    (root.querySelector("input") || inputs()[0])?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) setOpen(false);
      if (event.key !== "Tab") return;
      const targets = inputs();
      if (event.shiftKey && document.activeElement === targets[0]) {
        event.preventDefault();
        targets.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === targets.at(-1)) {
        event.preventDefault();
        targets[0]?.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, busy]);
  const signIn = () => {
    setMode("login");
    setError("");
    setNotice("");
    setOpen(true);
  };
  const logout = async () => {
    try {
      await api.logout();
      setUser(null);
      setPassword("");
    } catch (e) {
      setError(authMessage(e));
      setOpen(true);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const result = await api.signup(email.trim(), password);
        if (result.confirmationRequired) {
          setNotice("Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.");
          setMode("login");
        }
      } else {
        await api.login(email.trim(), password);
        setOpen(false);
      }
      setPassword("");
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className="account-loading">
        <Headphones size={34} />
        <p>Preparando tu espacio…</p>
      </div>
    );
  return (
    <AuthContext.Provider value={{ user, demo: !user, signIn, logout }}>
      {sessionError && (
        <div className="account-session-warning" role="status">
          {sessionError}
          <button onClick={() => setSessionError("")}>Entendido</button>
        </div>
      )}
      <React.Fragment key={user?.id || "guest"}>{children}</React.Fragment>
      {open && (
        <div
          className="modal-backdrop account-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <section
            ref={dialog}
            className="modal account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
          >
            <button
              className="icon-button modal-close"
              aria-label="Cerrar acceso"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <X size={21} />
            </button>
            <div className="account-mark">
              <Headphones size={29} />
              <span>onda</span>
            </div>
            <span className="eyebrow">TU ESPACIO. TU MÚSICA.</span>
            <h2 id="account-title">
              {!api.configured
                ? "Tu música ya tiene un lugar."
                : mode === "signup"
                  ? "Encuentra tu propia onda."
                  : "Qué bueno tenerte de vuelta."}
            </h2>
            {!api.configured ? (
              <>
                <p>
                  El acceso con cuenta estará disponible cuando se termine de conectar el servicio
                  de usuarios.
                </p>
                <p>
                  Ya puedes añadir y escuchar tus archivos locales. Se conservan en este navegador y
                  no se suben a internet.
                </p>
                <button className="primary-button account-submit" onClick={() => setOpen(false)}>
                  Seguir escuchando <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <p>
                  Las cuentas separan las bibliotecas de este navegador. Tus archivos de música
                  permanecen en el dispositivo.
                </p>
                <form onSubmit={submit}>
                  <label htmlFor="account-email">Correo electrónico</label>
                  <div className="account-input">
                    <Mail size={17} />
                    <input
                      id="account-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={busy}
                      placeholder="tu@correo.com"
                    />
                  </div>
                  <label htmlFor="account-password">Contraseña</label>
                  <div className="account-input">
                    <LockKeyhole size={17} />
                    <input
                      id="account-password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={mode === "signup" ? 8 : 1}
                      disabled={busy}
                      placeholder={mode === "signup" ? "Al menos 8 caracteres" : "Tu contraseña"}
                    />
                  </div>
                  {error && (
                    <p className="account-error" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="account-notice" role="status">
                      {notice}
                    </p>
                  )}
                  <button className="primary-button account-submit" disabled={busy}>
                    {busy ? "Un momento…" : mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}
                    <ArrowRight size={17} />
                  </button>
                </form>
                <button
                  className="account-switch"
                  disabled={busy}
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError("");
                    setNotice("");
                    setPassword("");
                  }}
                >
                  {mode === "login"
                    ? "¿Es tu primera vez? Crea una cuenta"
                    : "Ya tengo cuenta. Iniciar sesión"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </AuthContext.Provider>
  );
}
