import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
function publicKey(value) {
  if (value.startsWith("sb_publishable_")) return true;
  try {
    const payload = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "anon";
  } catch {
    return false;
  }
}
function validProjectUrl() {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}
const configured = Boolean(validProjectUrl() && key && publicKey(key));
const client = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
const requireClient = () => {
  if (!client)
    throw new Error(
      "El acceso con cuenta todavía no está configurado. Puedes escuchar música local sin iniciar sesión.",
    );
  return client;
};
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
const profileKey = configured ? "onda-local-profile:" + new URL(url).origin : null;
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
function cachedProfile() {
  if (!profileKey) return null;
  try {
    const profile = JSON.parse(localStorage.getItem(profileKey));
    return typeof profile?.id === "string" && typeof profile?.email === "string"
      ? { id: profile.id, email: profile.email }
      : null;
  } catch {
    return null;
  }
}
function rememberProfile(user) {
  if (!profileKey) return;
  try {
    if (user?.id && user?.email)
      localStorage.setItem(profileKey, JSON.stringify({ id: user.id, email: user.email }));
    else localStorage.removeItem(profileKey);
  } catch {
    /* Local playback remains usable if profile storage is unavailable. */
  }
}
function requireConnection() {
  if (offline())
    throw new Error(
      "Conéctate a internet para entrar, cambiar de cuenta o cerrar la sesión. Tu biblioteca local sigue disponible.",
    );
}
export const api = {
  configured,
  cachedProfile,
  async session() {
    if (!client) return { user: null, localOnly: false };
    if (offline()) return { user: cachedProfile(), localOnly: true };
    const { session } = unwrap(await client.auth.getSession());
    const user = session?.user || null;
    rememberProfile(user);
    return { user, localOnly: false };
  },
  onAuthChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      if (!user && offline()) {
        callback(cachedProfile(), { localOnly: true });
        return;
      }
      rememberProfile(user);
      callback(user, { localOnly: offline() });
    });
    return () => data.subscription.unsubscribe();
  },
  async login(email, password) {
    requireConnection();
    unwrap(await requireClient().auth.signInWithPassword({ email, password }));
  },
  async signup(email, password) {
    requireConnection();
    const data = unwrap(
      await requireClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
        },
      }),
    );
    return { confirmationRequired: !data.session };
  },
  async logout() {
    requireConnection();
    unwrap(await requireClient().auth.signOut());
    rememberProfile(null);
  },
};
