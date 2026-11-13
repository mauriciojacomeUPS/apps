import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createMediaService, mediaJson } from "./media-service.js";
import * as processing from "./media-processing.js";
import { runDownloadChecks } from "./download-checks.js";

const DEFAULT_ORIGIN = "https://mauriciojacomeups.github.io";
const METHODS = "GET, POST, DELETE, OPTIONS";
const HEADERS = "Authorization, Content-Type, X-Onda-Client, X-Onda-Format, X-Onda-Filename";
const CLIENT = /^(?:[a-f0-9]{64}|[a-zA-Z0-9_-]{43})$/;
const ARTIFACT = /^\/v1\/media\/jobs\/[a-f0-9-]{36}\/(?:result|tracks\/(?:0|[1-9][0-9]{0,4}))$/;
const PROBE_REASONS = new Map([
  ["timeout", "La prueba de YouTube agotó su tiempo. No confirma un bloqueo de acceso."],
  [
    "probe-timeout",
    "La prueba de YouTube agotó sus 90 segundos. No confirma un bloqueo de acceso.",
  ],
  ["proxy-blocked", "La red del servidor bloqueó la conexión con YouTube."],
  ["rate-limit", "YouTube limitó las solicitudes desde este servidor."],
  ["source-challenge", "YouTube pidió una verificación contra bots a este servidor."],
  ["access-required", "YouTube exige acceso o restringe el video de prueba."],
  ["source-forbidden", "YouTube rechazó la solicitud desde este servidor (403)."],
  ["formats-unavailable", "YouTube no ofreció un formato de audio disponible para la prueba."],
  ["source-network", "El servidor no pudo completar la conexión de red con YouTube."],
  ["source-unavailable", "El video de prueba de YouTube no entregó audio."],
  ["tools-unavailable", "El servidor no encontró FFmpeg o yt-dlp."],
  ["conversion-failed", "Se obtuvo el archivo, pero FFmpeg no pudo convertirlo."],
  ["audio-too-large", "El audio de prueba superó el límite de tamaño."],
  ["no-audio", "El archivo de prueba no contenía una pista de audio."],
  ["probe-failed", "No se pudo completar la prueba de YouTube desde este servidor."],
  ["cobalt-unavailable", "La instancia privada de Cobalt no está disponible."],
  ["cobalt-response", "Cobalt no devolvió una respuesta de audio compatible."],
  ["cobalt-transfer", "Cobalt no pudo entregar el archivo de audio."],
  ["cobalt-auth", "La instancia privada de Cobalt necesita revisar su configuración de acceso."],
  ["cobalt-rate-limit", "Cobalt alcanzó su límite de solicitudes."],
  ["protected-content", "El contenido tiene protección DRM y no se puede preparar."],
]);

function sameSecret(value, expected) {
  if (typeof value !== "string") return false;
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function originsOf(value) {
  const origins = String(value || DEFAULT_ORIGIN)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!origins.length) throw new Error("ONDA_ALLOWED_ORIGINS must contain a trusted web origin.");
  return new Set(
    origins.map((value) => {
      let url;
      try {
        url = new URL(value);
      } catch {}
      if (
        !url ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        (url.protocol !== "https:" &&
          !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      )
        throw new Error(
          "ONDA_ALLOWED_ORIGINS accepts exact HTTPS origins, or localhost for development.",
        );
      return url.origin;
    }),
  );
}
function numberSetting(env, name, fallback, maximum) {
  if (!env[name]) return fallback;
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(name + " is outside the supported range.");
  return value;
}
function cleanProbe(value) {
  const valid = new Set(["checking", "passed", "blocked", "failed", "disabled"]);
  const result = {
    provider: "youtube",
    status: valid.has(value?.status) ? value.status : "failed",
  };
  if (["yt-dlp", "cobalt"].includes(value?.engine)) result.engine = value.engine;
  if (
    typeof value?.upstreamCode === "string" &&
    /^error\.api\.[a-z0-9_.]{1,100}$/.test(value.upstreamCode)
  )
    result.upstreamCode = value.upstreamCode;
  if (
    typeof value?.checkedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.checkedAt) &&
    Number.isFinite(Date.parse(value.checkedAt))
  )
    result.checkedAt = new Date(value.checkedAt).toISOString();
  // Public health deliberately does not expose stderr, URLs, keys or filesystem paths.
  result.message =
    result.status === "passed"
      ? "YouTube entregó audio y la conversión terminó."
      : result.status === "checking"
        ? "Comprobando la conexión con YouTube."
        : result.status === "disabled"
          ? "La comprobación de arranque está desactivada."
          : result.status === "blocked"
            ? "La conexión con YouTube está bloqueada desde este servidor."
            : "No se pudo completar la prueba de YouTube desde este servidor.";
  if (["blocked", "failed"].includes(result.status) && PROBE_REASONS.has(value?.code)) {
    result.code = value.code;
    result.message = PROBE_REASONS.get(value.code);
  }
  if (Number.isSafeInteger(value?.elapsedMs) && value.elapsedMs >= 0 && value.elapsedMs <= 300_000)
    result.elapsedMs = value.elapsedMs;
  if (Number.isFinite(value?.bytes) && value.bytes > 0) result.bytes = value.bytes;
  return result;
}

/** Start only the production API, never the Vite development server. */
export async function startCloudServer(
  env = process.env,
  {
    probe,
    logger = console,
    limits: extraLimits = {},
    cobaltNetwork,
    stopCobaltDiagnostics = () => {},
    downloadRunner,
  } = {},
) {
  const apiKey = String(env.ONDA_API_KEY || "");
  if (apiKey.length < 32 || apiKey.length > 512 || /[\r\n]/.test(apiKey))
    throw new Error("Set ONDA_API_KEY to a private random value of at least 32 characters.");
  const allowedOrigins = originsOf(env.ONDA_ALLOWED_ORIGINS);
  const engine = processing.youtubeEngine(env);
  const port = env.PORT === undefined ? 10000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT is invalid.");
  const limits = {
    maxAudioBytes: numberSetting(env, "ONDA_MAX_AUDIO_MB", 32, 100) * 1024 * 1024,
    maxPlaylistBytes: numberSetting(env, "ONDA_MAX_PLAYLIST_MB", 128, 1024) * 1024 * 1024,
    maxPlaylistTracks: numberSetting(env, "ONDA_MAX_PLAYLIST_TRACKS", 25, 1000),
    parallel: numberSetting(env, "ONDA_DOWNLOAD_PARALLEL", 1, 2),
    resultLifetimeMs: numberSetting(env, "ONDA_RESULT_TTL_MINUTES", 10, 10) * 60_000,
    maxDurationMs: numberSetting(env, "ONDA_JOB_TIMEOUT_SECONDS", 300, 300) * 1000,
    ...extraLimits,
  };
  const service = createMediaService({
    env,
    prefix: "/v1/media",
    hosted: true,
    logger,
    limits,
    authorize(request) {
      const authorization = request.headers.authorization;
      const client = request.headers["x-onda-client"];
      if (
        !sameSecret(authorization, "Bearer " + apiKey) ||
        typeof client !== "string" ||
        !CLIENT.test(client)
      )
        return null;
      return createHash("sha256").update(client).digest("hex");
    },
  });
  let sourceCheck = cleanProbe({
    engine,
    status: env.ONDA_RUN_SOURCE_CHECK === "true" ? "checking" : "disabled",
  });
  const probeController = new AbortController();
  let downloadChecks;
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 30_000 },
    async (request, response) => {
      let url;
      try {
        url = new URL(request.url || "", "http://localhost");
      } catch {
        return mediaJson(response, 400, { error: "La dirección no es válida." });
      }
      const origin = request.headers.origin;
      const allowed = typeof origin === "string" && allowedOrigins.has(origin);
      response.setHeader("Vary", "Origin");
      if (allowed) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader(
          "Access-Control-Expose-Headers",
          "Content-Disposition, Content-Length, Retry-After",
        );
      }
      if (request.method === "GET" && url.pathname === "/healthz")
        return mediaJson(response, 200, {
          ok: true,
          service: "onda-media",
          version: 1,
          youtubeEngine: engine,
          downloadChecks,
          sourceCheck,
        });
      if (request.method === "OPTIONS") {
        if (!allowed) return mediaJson(response, 403, { error: "Este origen no está autorizado." });
        const requestedMethod = request.headers["access-control-request-method"];
        if (requestedMethod && !["GET", "POST", "DELETE"].includes(requestedMethod))
          return mediaJson(response, 405, { error: "Este método no está autorizado." });
        const requestedHeaders = String(request.headers["access-control-request-headers"] || "")
          .split(",")
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean);
        const permitted = new Set(
          HEADERS.toLowerCase()
            .split(",")
            .map((h) => h.trim()),
        );
        if (requestedHeaders.some((h) => !permitted.has(h)))
          return mediaJson(response, 403, { error: "Las cabeceras no están autorizadas." });
        response.writeHead(204, {
          "Access-Control-Allow-Methods": METHODS,
          "Access-Control-Allow-Headers": HEADERS,
          "Access-Control-Max-Age": "600",
          "Cache-Control": "no-store",
        });
        return response.end();
      }
      // Top-level download navigations lack Origin; their per-job capability is
      // checked by the service and authorizes only the selected audio/ZIP.
      const capabilityNavigation =
        !origin &&
        request.method === "GET" &&
        ARTIFACT.test(url.pathname) &&
        url.searchParams.has("download_token");
      if (!allowed && !capabilityNavigation)
        return mediaJson(response, 403, { error: "Este origen no está autorizado." });
      if (
        (sourceCheck.status === "checking" || downloadChecks?.status === "running") &&
        request.method === "POST" &&
        url.pathname === "/v1/media/jobs"
      ) {
        response.setHeader("Retry-After", "5");
        return mediaJson(response, 409, {
          error:
            "El servidor está comprobando las descargas. Espera a que termine y vuelve a intentarlo.",
          code: "source-check",
        });
      }
      try {
        await service.handle(request, response, () =>
          mediaJson(response, 404, { error: "Esta ruta no existe." }),
        );
      } catch (error) {
        logger.error?.(error.message);
        if (!response.headersSent && !response.destroyed)
          mediaJson(response, 500, { error: "El servidor no pudo completar la operación." });
      }
    },
  );
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, env.HOST || "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolveListen();
    });
  });
  let probePromise;
  if (env.ONDA_RUN_SOURCE_CHECK === "true") {
    probePromise = Promise.resolve()
      .then(async () => {
        if (env.ONDA_RUN_DOWNLOAD_TESTS !== "true")
          return (probe || processing.runSourceProbe)?.(env, { signal: probeController.signal });
        const result = await runDownloadChecks(env, {
          signal: probeController.signal,
          cobaltNetwork,
          runner: downloadRunner,
          onUpdate: (value) => {
            downloadChecks = value;
          },
        });
        const main = result.results.find(
          (row) => row.provider === "youtube" && row.engine === engine,
        );
        return {
          provider: "youtube",
          engine,
          status: main?.status === "passed" ? "passed" : "failed",
          code: main?.code || "probe-failed",
          upstreamCode: main?.upstreamCode,
          bytes: main?.bytes,
          elapsedMs: main?.elapsedMs,
          checkedAt: result.checkedAt,
        };
      })
      .then((result) => {
        if (!probeController.signal.aborted) {
          sourceCheck = cleanProbe(result);
          logger.info?.("Onda source check: " + JSON.stringify(sourceCheck));
        }
      })
      .catch(() => {
        if (!probeController.signal.aborted)
          sourceCheck = cleanProbe({
            status: "failed",
            code: "probe-failed",
            checkedAt: new Date().toISOString(),
          });
        if (downloadChecks?.status === "running")
          downloadChecks = { ...downloadChecks, status: "failed" };
      })
      .finally(stopCobaltDiagnostics);
  }
  let closing;
  function close() {
    if (closing) return closing;
    closing = (async () => {
      probeController.abort();
      const stopped = new Promise((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
      server.closeIdleConnections();
      await service.close();
      server.closeAllConnections();
      await stopped;
      // Probes receive cancellation; do not keep shutdown waiting on an
      // uncooperative externally supplied diagnostic implementation.
      if (probePromise)
        await Promise.race([
          probePromise,
          new Promise((resolveDone) => {
            const timer = setTimeout(resolveDone, 2000);
            timer.unref();
          }),
        ]);
    })();
    return closing;
  }
  return {
    server,
    service,
    close,
    get sourceCheck() {
      return sourceCheck;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCloudServer()
    .then((instance) => {
      console.log("Onda media API listening on port " + instance.server.address().port);
      let stopping = false;
      for (const signal of ["SIGTERM", "SIGINT"])
        process.once(signal, () => {
          if (stopping) return;
          stopping = true;
          instance
            .close()
            .then(() => {
              process.exitCode = 0;
            })
            .catch(() => {
              process.exitCode = 1;
            });
        });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
