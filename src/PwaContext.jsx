import { createContext, useContext, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import "./pwa.css";

const initial = {
  offline: typeof navigator !== "undefined" && !navigator.onLine,
  offlineReady: false,
  canInstall: false,
  needRefresh: false,
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  install: async () => false,
  update: async () => false,
};
const PwaContext = createContext(initial);
export const usePwa = () => useContext(PwaContext);
const playingAudio = () =>
  [...document.querySelectorAll("audio")].some((audio) => !audio.paused && !audio.ended);

export function PwaProvider({ children }) {
  const [offline, setOffline] = useState(initial.offline);
  const [offlineReady, setOfflineReady] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [error, setError] = useState("");
  const installPrompt = useRef(null);
  const updateWorker = useRef(null);
  const reloadRequired = useRef(false);
  const approvedReload = useRef(false);

  useEffect(() => {
    const connected = () => setOffline(false);
    const disconnected = () => setOffline(true);
    const available = (event) => {
      event.preventDefault();
      installPrompt.current = event;
      setCanInstall(true);
    };
    const installed = () => {
      installPrompt.current = null;
      setCanInstall(false);
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    let active = true;
    updateWorker.current = registerSW({
      immediate: true,
      onOfflineReady: () => {
        if (active) setOfflineReady(true);
      },
      onNeedRefresh: () => {
        if (active) setNeedRefresh(true);
      },
      onNeedReload: () => {
        reloadRequired.current = true;
        if (approvedReload.current && !playingAudio()) window.location.reload();
        else if (active) setNeedRefresh(true);
      },
      onRegisteredSW: (path, registration) => {
        if (!active || !registration?.active) return;
        const expectedScope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
        const expectedWorker = new URL(path, window.location.origin).href;
        if (
          registration.scope === expectedScope &&
          registration.active.scriptURL === expectedWorker
        )
          setOfflineReady(true);
      },
      onRegisterError: () => {
        if (active)
          setError(
            "No se pudo preparar la apertura sin conexión. Tu biblioteca local se conserva.",
          );
      },
    });
    return () => {
      active = false;
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const install = async () => {
    const prompt = installPrompt.current;
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installPrompt.current = null;
      setCanInstall(false);
      return choice.outcome === "accepted";
    } catch {
      return false;
    }
  };
  const update = async () => {
    if (playingAudio()) return false;
    approvedReload.current = true;
    if (reloadRequired.current) window.location.reload();
    else await updateWorker.current?.(true);
    return true;
  };
  return (
    <PwaContext.Provider
      value={{
        offline,
        offlineReady,
        canInstall,
        needRefresh,
        install,
        update,
        error,
        supported: initial.supported,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}
