import http from "node:http";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MediaError } from "./media-error.js";

export function youtubeEngine(env = {}) {
  const engine = env.ONDA_YOUTUBE_ENGINE || "yt-dlp";
  if (!["yt-dlp", "cobalt"].includes(engine))
    throw new MediaError("ONDA_YOUTUBE_ENGINE debe ser yt-dlp o cobalt.", "cobalt-config");
  return engine;
}

export function cobaltOrigin(env = {}) {
  let url;
  try {
    url = new URL(env.ONDA_COBALT_URL || "http://127.0.0.1:9000/");
  } catch {}
  if (
    !url ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new MediaError(
      "Cobalt debe ejecutarse en una dirección local del servidor.",
      "cobalt-config",
    );
  return url.origin;
}

function request(url, { method = "GET", body, signal, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        signal,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      resolve,
    );
    req.setTimeout(timeoutMs, () =>
      req.destroy(new MediaError("Cobalt tardó demasiado en responder.", "cobalt-unavailable")),
    );
    req.once("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function json(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 65536) {
      response.destroy();
      throw new MediaError("La respuesta de Cobalt supera el límite esperado.", "cobalt-response");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MediaError("Cobalt no respondió con datos válidos.", "cobalt-response");
  }
}

export async function cobaltInfo(env = {}) {
  const origin = cobaltOrigin(env);
  try {
    const response = await request(origin + "/", {
      timeoutMs: 2500,
      signal: AbortSignal.timeout(3000),
    });
    if (response.statusCode !== 200) {
      response.resume();
      return null;
    }
    const value = await json(response);
    return typeof value?.cobalt?.version === "string" && value.cobalt.services?.includes("youtube")
      ? { origin, version: value.cobalt.version.slice(0, 40) }
      : null;
  } catch {
    return null;
  }
}

export function cobaltError(value, status) {
  const raw = value?.error?.code;
  const code = typeof raw === "string" && /^error\.api\.[a-z0-9_.]{1,100}$/.test(raw) ? raw : "";
  const failure = (message, reason) =>
    Object.assign(new MediaError(message, reason), code ? { upstreamCode: code } : {});
  if (code === "error.api.youtube.login")
    return failure(
      "YouTube pide una verificación contra bots también a Cobalt.",
      "source-challenge",
    );
  if (code === "error.api.fetch.rate")
    return failure(
      "YouTube limitó las solicitudes de Cobalt. Espera antes de volver a probar.",
      "rate-limit",
    );
  if (status === 429 || code === "error.api.rate_exceeded")
    return failure(
      "Cobalt alcanzó su límite de solicitudes. Espera antes de volver a probar.",
      "cobalt-rate-limit",
    );
  if (code.startsWith("error.api.auth."))
    return failure(
      "La instancia privada de Cobalt necesita revisar su configuración de acceso.",
      "cobalt-auth",
    );
  if (/^error\.api\.content\.video\.(private|age|region)$/.test(code))
    return failure(
      "Cobalt informa que el video requiere acceso o tiene restricciones.",
      "access-required",
    );
  if (code === "error.api.youtube.drm")
    return failure(
      "El contenido tiene protección DRM y no se puede preparar.",
      "protected-content",
    );
  return failure(
    "Cobalt no pudo obtener el audio de YouTube desde este servidor.",
    "source-unavailable",
  );
}

function tunnelUrl(value, origin) {
  let url;
  try {
    url = new URL(value);
  } catch {}
  if (
    !url ||
    url.origin !== origin ||
    url.pathname !== "/tunnel" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new MediaError(
      "Cobalt no devolvió un enlace de su instancia privada.",
      "cobalt-response",
    );
  return url.href;
}

export async function downloadCobalt(env, job, source) {
  if (source.playlist)
    throw new MediaError(
      "Cobalt experimental prepara un video por operación. Pega el enlace de un video, no de una playlist completa.",
      "cobalt-playlist",
    );
  const origin = cobaltOrigin(env),
    signal = job.controller.signal;
  const path = join(job.dir, "cobalt-input");
  try {
    job.message = "Cobalt está buscando el audio…";
    const response = await request(origin + "/", {
      method: "POST",
      signal,
      body: {
        url: source.url,
        downloadMode: "audio",
        audioFormat: "best",
        filenameStyle: "pretty",
        alwaysProxy: true,
        localProcessing: "disabled",
      },
    });
    const data = await json(response);
    if (response.statusCode !== 200 || data.status === "error")
      throw cobaltError(data, response.statusCode);
    const localAudio =
      data.status === "local-processing" &&
      data.type === "audio" &&
      data.service === "youtube" &&
      data.tunnel?.length === 1;
    if (data.status !== "tunnel" && !localAudio)
      throw new MediaError(
        "Cobalt no devolvió un audio que este servidor pueda preparar.",
        "cobalt-response",
      );
    const address = tunnelUrl(localAudio ? data.tunnel[0] : data.url, origin);
    const audio = await request(address, { signal });
    if (audio.statusCode !== 200) {
      audio.resume();
      throw new MediaError("Cobalt no pudo entregar el archivo preparado.", "cobalt-transfer");
    }
    const maximum = job.limits?.maxAudioBytes || 32 * 1024 * 1024;
    if (Number(audio.headers["content-length"]) > maximum) {
      audio.destroy();
      throw new MediaError("El audio supera el límite de tamaño del servidor.", "audio-too-large");
    }
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        done(
          bytes > maximum
            ? new MediaError("El audio supera el límite de tamaño del servidor.", "audio-too-large")
            : null,
          chunk,
        );
      },
    });
    job.message = "Recibiendo el audio de Cobalt…";
    await pipeline(audio, limit, createWriteStream(path, { flags: "wx" }), { signal });
    if (!bytes) throw new MediaError("Cobalt devolvió un archivo vacío.", "cobalt-transfer");
    const filename = localAudio ? data.output?.filename : data.filename;
    const title =
      typeof filename === "string"
        ? filename
            .split(/[\\/]/)
            .at(-1)
            .replace(/\.[a-z0-9]{2,5}$/i, "")
            .slice(0, 200)
        : "Audio de YouTube";
    const metadata = localAudio ? data.output?.metadata : null;
    return {
      path,
      title: typeof metadata?.title === "string" ? metadata.title.slice(0, 200) : title,
      artist: typeof metadata?.artist === "string" ? metadata.artist.slice(0, 200) : "",
    };
  } catch (error) {
    await rm(path, { force: true }).catch(() => {});
    if (signal.aborted || error instanceof MediaError) throw error;
    throw new MediaError(
      "No se pudo comunicar con la instancia privada de Cobalt.",
      "cobalt-unavailable",
    );
  }
}
