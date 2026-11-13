const loopback = (hostname) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
export function normalizeMediaServer(value, allowLocal = false) {
  if (!String(value || "").trim()) return "";
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error("Introduce la URL HTTPS de tu servidor Render.");
  }
  if (
    (url.protocol !== "https:" &&
      !(allowLocal && url.protocol === "http:" && loopback(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["/", "/v1/media", "/v1/media/"].includes(url.pathname)
  )
    throw new Error("Usa la dirección HTTPS del servidor, sin claves ni parámetros en la URL.");
  return url.origin;
}
export function readMediaConnection(
  owner,
  { local = localStorage, session = sessionStorage, defaultUrl = "" } = {},
) {
  try {
    const stored = JSON.parse(local.getItem("onda-media-server:" + owner) || "null") || {};
    return {
      url: normalizeMediaServer(stored.url || defaultUrl, true),
      key: session.getItem("onda-media-key:" + owner) || (stored.remember ? stored.key || "" : ""),
      remember: stored.remember === true,
    };
  } catch {
    return { url: defaultUrl, key: "", remember: false };
  }
}
export function saveMediaConnection(
  owner,
  value,
  { local = localStorage, session = sessionStorage, allowLocal = false } = {},
) {
  const url = normalizeMediaServer(value.url, allowLocal);
  const key = String(value.key || "").trim();
  if (url && key.length < 32)
    throw new Error("Copia la clave ONDA_API_KEY generada en Render (al menos 32 caracteres).");
  const result = { url, key: url ? key : "", remember: url && value.remember === true };
  local.setItem(
    "onda-media-server:" + owner,
    JSON.stringify({ url, key: result.remember ? key : "", remember: result.remember }),
  );
  if (url) session.setItem("onda-media-key:" + owner, key);
  else session.removeItem("onda-media-key:" + owner);
  return result;
}
export function mediaClientToken(owner, storage = localStorage) {
  const name = "onda-media-client:" + owner;
  let token;
  try {
    token = storage.getItem(name);
  } catch {}
  if (!/^[a-f0-9]{64}$/.test(token || "")) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    try {
      storage.setItem(name, token);
    } catch {}
  }
  return token;
}
export function createMediaClient({
  url = "",
  key = "",
  clientToken = "",
  localBase = "/__onda-media",
  fetcher = fetch,
  timeoutMs = 75000,
}) {
  const remote = Boolean(url);
  const origin = remote ? normalizeMediaServer(url, true) : "";
  const base = remote ? origin + "/v1/media" : localBase;
  async function request(path, options = {}, health = false) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, timeoutMs);
    const headers = new Headers(options.headers);
    headers.set("Accept", health || !path.endsWith("/result") ? "application/json" : "*/*");
    if (remote && !health) {
      headers.set("Authorization", "Bearer " + key);
      headers.set("X-Onda-Client", clientToken);
    }
    try {
      return await fetcher(health ? origin + "/healthz" : base + path, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error(
        controller.signal.aborted
          ? "El servidor tardó demasiado en responder. Puede estar despertando; vuelve a conectar."
          : "No se pudo conectar al servidor de descargas. Revisa su URL y la conexión.",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  async function json(path, options, health = false) {
    const response = await request(path, options, health);
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error(
        "El servidor todavía no respondió como servicio de Onda. Puede estar despertando en Render.",
      );
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "La clave de acceso del servidor no coincide."
          : data.error || "No se pudo completar la operación.",
      );
    return data;
  }
  return {
    remote,
    base,
    json,
    file: (path) => request(path),
    request,
    health: () => json("", {}, true),
    downloadUrl(job, itemId) {
      const path =
        base +
        "/jobs/" +
        encodeURIComponent(job.id) +
        (itemId === undefined ? "/result" : "/tracks/" + encodeURIComponent(itemId));
      return remote && job.downloadToken
        ? path + "?download_token=" + encodeURIComponent(job.downloadToken)
        : path;
    },
  };
}
