import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import * as processing from "./media-processing.js";

const jobRoot = resolve(tmpdir());
const jobPrefix = "onda-media-";
const MB = 1024 * 1024;
const providers = ["youtube", "soundcloud", "bandcamp", "vimeo", "archive"];

export const HOSTED_LIMITS = Object.freeze({
  maxAudioBytes: 32 * MB,
  maxPlaylistBytes: 128 * MB,
  maxPlaylistTracks: 25,
  parallel: 1,
  resultLifetimeMs: 10 * 60_000,
  maxDurationMs: 5 * 60_000,
  maxRetainedJobs: 4,
  perOwnerStarts: 6,
  globalStarts: 20,
  rateWindowMs: 60 * 60_000,
});

export class MediaHttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function mediaJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(value));
}

function normalizedLimits(hosted, values) {
  const defaults = hosted
    ? HOSTED_LIMITS
    : {
        ...HOSTED_LIMITS,
        maxAudioBytes: processing.MAX_AUDIO_BYTES,
        maxPlaylistBytes: 1024 * MB,
        maxPlaylistTracks: 10000,
        parallel: 2,
        resultLifetimeMs: 30 * 60_000,
        maxDurationMs: 30 * 60_000,
        maxRetainedJobs: 1,
        perOwnerStarts: Number.MAX_SAFE_INTEGER,
        globalStarts: Number.MAX_SAFE_INTEGER,
      };
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (values[key] === undefined) continue;
    if (!Number.isSafeInteger(values[key]) || values[key] < 1)
      throw new Error("Invalid media service limit: " + key);
    result[key] = values[key];
  }
  // Download capabilities have a strict maximum lifetime on the public service.
  if (hosted) result.resultLifetimeMs = Math.min(result.resultLifetimeMs, 10 * 60_000);
  return result;
}

function sameSecret(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function contentLimit(maximum) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(
        received > maximum
          ? new processing.MediaError("El archivo supera el límite de audio.")
          : null,
        chunk,
      );
    },
  });
}

async function smallJson(request) {
  const maximum = 4096;
  if (Number(request.headers["content-length"]) > maximum) {
    const error = new MediaHttpError(413, "El enlace es demasiado largo.");
    error.closeConnection = true;
    throw error;
  }
  const body = await new Promise((resolveBody, reject) => {
    const chunks = [];
    let received = 0;
    const cleanup = () => {
      request.removeListener("data", data);
      request.removeListener("end", end);
      request.removeListener("error", failure);
      request.removeListener("aborted", aborted);
    };
    const failure = (error) => {
      cleanup();
      reject(error);
    };
    const aborted = () => failure(new MediaHttpError(400, "La solicitud se interrumpió."));
    const data = (chunk) => {
      received += chunk.length;
      if (received > maximum) {
        request.pause();
        cleanup();
        const error = new MediaHttpError(413, "El enlace es demasiado largo.");
        error.closeConnection = true;
        reject(error);
      } else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    };
    request.on("data", data);
    request.once("end", end);
    request.once("error", failure);
    request.once("aborted", aborted);
  });
  try {
    return JSON.parse(body);
  } catch {
    throw new MediaHttpError(400, "No se pudo leer el enlace.");
  }
}

async function requestSource(request, hosted, limits) {
  const type = String(request.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type === "application/octet-stream") {
    if (hosted)
      throw new MediaHttpError(
        415,
        "El servidor online solo prepara enlaces. Importa tus archivos directamente en el dispositivo.",
      );
    const length = Number(request.headers["content-length"]);
    if (length > limits.maxAudioBytes)
      throw new MediaHttpError(413, "El archivo supera el límite de audio.");
    if (length === 0) throw new MediaHttpError(400, "El archivo está vacío.");
    const format = request.headers["x-onda-format"],
      encoded = request.headers["x-onda-filename"];
    if (typeof encoded !== "string" || !encoded || encoded.length > 2048)
      throw new MediaHttpError(400, "Selecciona un archivo.");
    let originalName;
    try {
      originalName = decodeURIComponent(encoded);
    } catch {
      throw new MediaHttpError(400, "No se pudo leer el nombre del archivo.");
    }
    return { format, originalName };
  }
  if (type !== "application/json")
    throw new MediaHttpError(415, "Pega un enlace de una fuente compatible.");
  const data = await smallJson(request);
  const source = processing.mediaSource
    ? processing.mediaSource(data?.url, { preferPlaylist: data?.playlist === true })
    : {
        ...processing.youtubeSource(data?.url, { preferPlaylist: data?.playlist === true }),
        provider: "youtube",
      };
  return { format: data?.format, remote: source };
}

async function archive(job, output) {
  const path = join(job.dir, "playlist.zip");
  const zip = new yazl.ZipFile();
  zip.on("error", (error) => zip.outputStream.destroy(error));
  const write = pipeline(zip.outputStream, createWriteStream(path), {
    signal: job.controller.signal,
  });
  for (const file of output.files) zip.addFile(file.path, file.name, { compress: false });
  zip.addBuffer(
    Buffer.from("#EXTM3U\r\n" + output.files.map((file) => file.name).join("\r\n") + "\r\n"),
    "Playlist.m3u8",
  );
  if (output.skipped?.length)
    zip.addBuffer(Buffer.from(output.skipped.join("\r\n") + "\r\n"), "No descargadas.txt");
  zip.end();
  await write;
  return { path, name: output.name, type: "application/zip", size: (await stat(path)).size };
}

function publicResult(result) {
  return result && { name: result.name, type: result.type, size: result.size };
}

/** Isolated jobs shared by the localhost plugin and the authenticated cloud API. */
export function createMediaService({
  env = {},
  prefix = "/v1/media",
  authorize,
  hosted = false,
  logger = console,
  limits: requestedLimits = {},
}) {
  if (typeof authorize !== "function") throw new Error("A media authorization policy is required.");
  const limits = normalizedLimits(hosted, requestedLimits);
  const byOwner = new Map(),
    byId = new Map(),
    ownerStarts = new Map();
  let globalStarts = [],
    closed = false,
    toolsPromise,
    toolsCheckedAt = 0;

  async function toolsFor() {
    if (!toolsPromise || Date.now() - toolsCheckedAt > 30_000) {
      toolsCheckedAt = Date.now();
      toolsPromise = processing.localExecutables(env);
    }
    return toolsPromise;
  }
  function live(job) {
    return job && (!job.expiresAt || job.expiresAt > Date.now());
  }
  function describe(job) {
    if (!live(job)) return null;
    const {
      id,
      state,
      message,
      done,
      total,
      saved,
      skipped,
      notice,
      result,
      items,
      code,
      provider,
    } = job;
    return {
      id,
      state,
      message,
      done,
      total,
      saved,
      skipped,
      notice,
      code,
      provider,
      result: publicResult(result),
      items:
        state === "ready" && items
          ? items.map((item, index) => ({ id: index, ...publicResult(item) }))
          : undefined,
      downloadToken: hosted && state === "ready" ? job.downloadToken : undefined,
      expiresAt: job.expiresAt || undefined,
    };
  }
  async function removeFiles(job) {
    if (!job?.dir || dirname(job.dir) !== jobRoot || !basename(job.dir).startsWith(jobPrefix))
      return;
    await rm(job.dir, { recursive: true, force: true }).catch((error) =>
      logger.warn?.(error.message),
    );
  }
  function untrack(job) {
    clearTimeout(job.expiryTimer);
    clearTimeout(job.deadlineTimer);
    if (byOwner.get(job.owner) === job) byOwner.delete(job.owner);
    if (byId.get(job.id) === job) byId.delete(job.id);
  }
  async function removeJob(job) {
    untrack(job);
    await removeFiles(job);
  }
  function scheduleExpiry(job, refresh = false) {
    clearTimeout(job.expiryTimer);
    if (closed || byId.get(job.id) !== job) return;
    if (!job.expiresAt || (!hosted && refresh))
      job.expiresAt = Date.now() + limits.resultLifetimeMs;
    const expire = async () => {
      if (byId.get(job.id) !== job) return;
      if (job.transfers) {
        job.expiryTimer = setTimeout(expire, 1000);
        job.expiryTimer.unref();
        return;
      }
      await removeJob(job);
    };
    job.expiryTimer = setTimeout(expire, Math.max(1, job.expiresAt - Date.now()));
    job.expiryTimer.unref();
  }
  function consumeRate(owner) {
    const since = Date.now() - limits.rateWindowMs;
    globalStarts = globalStarts.filter((time) => time > since);
    for (const [key, values] of ownerStarts) {
      const current = values.filter((time) => time > since);
      if (current.length) ownerStarts.set(key, current);
      else ownerStarts.delete(key);
    }
    const previous = ownerStarts.get(owner) || [];
    if (previous.length >= limits.perOwnerStarts || globalStarts.length >= limits.globalStarts)
      throw new MediaHttpError(
        429,
        "Se alcanzó el límite de operaciones. Vuelve a intentarlo más tarde.",
        "rate-limit",
      );
    const now = Date.now();
    previous.push(now);
    ownerStarts.set(owner, previous);
    globalStarts.push(now);
  }
  function checkOutput(job, output) {
    const files = output.files || [output];
    if (!files.length || files.length > limits.maxPlaylistTracks)
      throw new processing.MediaError("La selección supera el límite de pistas de este servidor.");
    let bytes = 0;
    for (const file of files) {
      if (typeof file.path !== "string" || !resolve(file.path).startsWith(job.dir + sep))
        throw new processing.MediaError("No se encontró el audio preparado.");
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > limits.maxAudioBytes)
        throw new processing.MediaError("El audio supera el límite de este servidor.");
      bytes += file.size;
    }
    if (bytes > limits.maxPlaylistBytes)
      throw new processing.MediaError("La playlist supera el límite de este servidor.");
  }
  async function processJob(job, tools, source, input) {
    try {
      const output = source.remote
        ? await (processing.downloadMedia || processing.downloadYoutube)(tools, job, source.remote)
        : await processing.convertFile(tools, job, input, source.originalName);
      job.controller.signal.throwIfAborted();
      checkOutput(job, output);
      job.result = output.files ? await archive(job, output) : output;
      job.items = output.files;
      job.controller.signal.throwIfAborted();
      job.state = "ready";
      job.message = "Tu descarga está lista.";
      if (hosted) job.downloadToken = randomBytes(32).toString("base64url");
    } catch (error) {
      job.state = job.timedOut ? "error" : job.controller.signal.aborted ? "cancelled" : "error";
      job.code = job.timedOut ? "timeout" : error?.code;
      job.message = job.timedOut
        ? "La operación agotó el tiempo disponible en este servidor."
        : job.state === "cancelled"
          ? "Operación cancelada."
          : error instanceof processing.MediaError
            ? error.message
            : "No se pudo preparar el audio. Vuelve a intentarlo.";
      if (job.state === "error" && !(error instanceof processing.MediaError) && !job.timedOut)
        logger.error?.(error.message);
      await removeFiles(job);
    } finally {
      clearTimeout(job.deadlineTimer);
      if (input) await rm(input, { force: true }).catch(() => {});
      scheduleExpiry(job, true);
      job.finish();
    }
  }
  async function start(request, response, owner) {
    if (closed) throw new MediaHttpError(503, "El servicio se está cerrando.");
    const source = await requestSource(request, hosted, limits);
    if (!processing.supportsFormat(source.format))
      throw new MediaHttpError(400, "Elige un formato de audio disponible.");
    const tools = await toolsFor();
    if (!tools.ffmpeg || (source.remote && !tools.ytDlp))
      throw new MediaHttpError(503, "Faltan los programas necesarios para esta operación.");
    if (closed) throw new MediaHttpError(503, "El servicio se está cerrando.");
    const previous = byOwner.get(owner);
    if (previous && (previous.state === "working" || previous.transfers))
      throw new MediaHttpError(409, "Ya hay una operación en curso en tu dispositivo.");
    if ([...byId.values()].some((job) => job.state === "working"))
      throw new MediaHttpError(
        409,
        "El servidor está preparando otra descarga. Vuelve a intentarlo cuando termine.",
      );
    const removable = [...byId.values()]
      .filter((job) => job !== previous && job.state !== "working" && !job.transfers)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!previous && byId.size >= limits.maxRetainedJobs && !removable.length)
      throw new MediaHttpError(503, "El servicio está ocupado. Vuelve a intentarlo más tarde.");
    consumeRate(owner);
    const job = {
      id: randomUUID(),
      owner,
      state: "working",
      createdAt: Date.now(),
      transfers: 0,
      message: source.remote ? "Conectando con la fuente de audio…" : "Recibiendo el archivo…",
      controller: new AbortController(),
      format: source.format,
      provider: source.remote?.provider || "file",
      limits: {
        maxAudioBytes: limits.maxAudioBytes,
        maxPlaylistBytes: limits.maxPlaylistBytes,
        maxPlaylistTracks: limits.maxPlaylistTracks,
        parallel: limits.parallel,
      },
    };
    job.completion = new Promise((resolveJob) => {
      job.finish = resolveJob;
    });
    // Reserve the one active slot before asynchronous filesystem work.
    byOwner.set(owner, job);
    byId.set(job.id, job);
    job.deadlineTimer = setTimeout(() => {
      job.timedOut = true;
      job.controller.abort();
    }, limits.maxDurationMs);
    job.deadlineTimer.unref();
    try {
      if (previous) await removeJob(previous);
      while (byId.size > limits.maxRetainedJobs && removable.length)
        await removeJob(removable.shift());
      job.dir = await mkdtemp(join(jobRoot, jobPrefix));
      job.controller.signal.throwIfAborted();
      let input;
      if (!source.remote) {
        input = join(job.dir, "archivo");
        await pipeline(request, contentLimit(limits.maxAudioBytes), createWriteStream(input), {
          signal: job.controller.signal,
        });
        if (!(await stat(input)).size) throw new MediaHttpError(400, "El archivo está vacío.");
        job.message = "Convirtiendo el archivo…";
      }
      mediaJson(response, 202, describe(job));
      void processJob(job, tools, source, input);
    } catch (error) {
      clearTimeout(job.deadlineTimer);
      untrack(job);
      await removeFiles(job);
      job.finish();
      throw error;
    }
  }
  async function sendResult(job, response, selected = job.result) {
    if (job.state !== "ready") throw new MediaHttpError(409, "La descarga aún no está lista.");
    const { name, type, size, path } = selected;
    const filename = encodeURIComponent(name).replace(
      /['()]/g,
      (character) => "%" + character.charCodeAt(0).toString(16),
    );
    job.transfers++;
    try {
      response.writeHead(200, {
        "Content-Type": type,
        "Content-Length": size,
        "Content-Disposition":
          'attachment; filename="' +
          name.replace(/[^\x20-\x7e]|["\\]/g, "_") +
          "\"; filename*=UTF-8''" +
          filename,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      await pipeline(createReadStream(path), response);
    } finally {
      job.transfers--;
      scheduleExpiry(job, true);
    }
  }

  async function handle(request, response, next) {
    let url;
    try {
      url = new URL(request.url || "", "http://localhost");
    } catch {
      return mediaJson(response, 400, { error: "La dirección no es válida." });
    }
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) {
      if (next) return next();
      return false;
    }
    const route = url.pathname.slice(prefix.length);
    const match = /^\/jobs\/([a-f0-9-]{36})(?:\/(result)|\/tracks\/(0|[1-9][0-9]{0,4}))?$/.exec(
      route,
    );
    const artifact = request.method === "GET" && match && (match[2] || match[3] !== undefined);
    try {
      let job, owner;
      if (hosted && artifact && url.searchParams.has("download_token")) {
        job = byId.get(match[1]);
        if (
          !live(job) ||
          job.state !== "ready" ||
          !sameSecret(url.searchParams.get("download_token"), job.downloadToken)
        )
          throw new MediaHttpError(401, "El enlace de descarga caducó o no es válido.");
      } else {
        owner = await authorize(request);
        if (!owner)
          throw new MediaHttpError(
            hosted ? 401 : 403,
            hosted
              ? "Configura la clave del servidor para usar esta herramienta."
              : "Abre Onda desde localhost para usar esta herramienta.",
          );
        if (route === "/status" && request.method === "GET") {
          const { ffmpeg, ytDlp } = await toolsFor();
          return mediaJson(response, 200, {
            convert: !!ffmpeg && !hosted,
            youtube: !!(ffmpeg && ytDlp),
            uploads: !hosted,
            sources: ffmpeg && ytDlp ? processing.MEDIA_SOURCES || providers : [],
            limits: {
              maxAudioBytes: limits.maxAudioBytes,
              maxPlaylistBytes: limits.maxPlaylistBytes,
              maxPlaylistTracks: limits.maxPlaylistTracks,
            },
            job: describe(byOwner.get(owner)),
          });
        }
        if (route === "/jobs" && request.method === "POST")
          return await start(request, response, owner);
        job = match && byId.get(match[1]);
        if (!live(job) || job.owner !== owner)
          throw new MediaHttpError(404, "Esta operación ya no está disponible.");
      }
      if (request.method === "GET" && match[2]) return await sendResult(job, response);
      if (request.method === "GET" && match[3] !== undefined) {
        const item = job.items?.[Number(match[3])];
        if (!item || job.state !== "ready")
          throw new MediaHttpError(404, "Esta pista no está disponible.");
        return await sendResult(job, response, item);
      }
      if (request.method === "GET") return mediaJson(response, 200, describe(job));
      if (
        request.method === "DELETE" &&
        !match[2] &&
        match[3] === undefined &&
        job.state === "working"
      ) {
        job.controller.abort();
        return mediaJson(response, 202, describe(job));
      }
      response.setHeader("Allow", "GET, POST, DELETE");
      throw new MediaHttpError(405, "Esta acción no está disponible.");
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (error.closeConnection) response.setHeader("Connection", "close");
      if (error.status === 429) response.setHeader("Retry-After", "3600");
      if (error instanceof MediaHttpError || error instanceof processing.MediaError)
        return mediaJson(response, error.status || 400, { error: error.message, code: error.code });
      logger.error?.(error.message);
      return mediaJson(response, 500, { error: "La herramienta no pudo completar la operación." });
    }
  }
  async function close() {
    if (closed) return;
    closed = true;
    const jobs = [...byId.values()];
    for (const job of jobs) {
      clearTimeout(job.expiryTimer);
      clearTimeout(job.deadlineTimer);
      job.controller.abort();
    }
    await Promise.allSettled(jobs.map((job) => job.completion));
    await Promise.all(jobs.map(removeJob));
  }
  return { handle, close };
}
