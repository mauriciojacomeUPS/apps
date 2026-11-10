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
export const api = {
  configured,
  async session() {
    if (!client) return { user: null };
    const { session } = unwrap(await client.auth.getSession());
    return { user: session?.user || null };
  },
  onAuthChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      callback(session?.user || null),
    );
    return () => data.subscription.unsubscribe();
  },
  async login(email, password) {
    unwrap(await requireClient().auth.signInWithPassword({ email, password }));
  },
  async signup(email, password) {
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
    unwrap(await requireClient().auth.signOut());
  },
};
