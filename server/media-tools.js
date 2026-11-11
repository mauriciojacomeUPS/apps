import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import {
  MAX_AUDIO_BYTES,
  MediaError,
  convertFile,
  downloadYoutube,
  localExecutables,
  supportsFormat,
  youtubeSource,
} from "./media-processing.js";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const localPeers = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const resultLifetime = 30 * 60_000;
const jobRoot = resolve(tmpdir());
const jobPrefix = "onda-media-";

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function isLocal(request) {
  if (!localPeers.has(request.socket.remoteAddress)) return false;
  if (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin") return false;
  try {
    const protocol = request.socket.encrypted ? "https://" : "http://";
    const url = new URL(protocol + request.headers.host);
    if (!localHosts.has(url.hostname)) return false;
    if (request.headers.origin || request.method !== "GET") {
      return request.headers.origin === url.origin;
    }
    return true;
  } catch {
    return false;
  }
}

function describe(job) {
  if (!job) return null;
  const { id, state, message, done, total, saved, skipped, notice, result } = job;
  return {
    id, state, message, done, total, saved, skipped, notice,
    result: result && { name: result.name, type: result.type, size: result.size },
  };
}

function contentLimit(maximum) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > maximum ? new MediaError("El archivo supera 100 MB.") : null, chunk);
    },
  });
}

async function requestSource(request) {
  const type = request.headers["content-type"];
  if (type === "application/octet-stream") {
    const length = Number(request.headers["content-length"]);
    if (length > MAX_AUDIO_BYTES) throw new MediaError("El archivo supera 100 MB.");
    if (length === 0) throw new MediaError("El archivo está vacío.");
    const format = request.headers["x-onda-format"];
    const encoded = request.headers["x-onda-filename"];
    if (!encoded || encoded.length > 2048) throw new MediaError("Selecciona un archivo.");
    let originalName;
    try {
      originalName = decodeURIComponent(encoded);
    } catch {
      throw new MediaError("No se pudo leer el nombre del archivo.");
    }
    return { format, originalName };
  }
  if (type !== "application/json") throw new MediaError("Selecciona un archivo o pega un enlace de YouTube.");
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (body.length > 4096) throw new MediaError("El enlace es demasiado largo.");
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new MediaError("No se pudo leer el enlace.");
  }
  return { format: data?.format, youtube: youtubeSource(data?.url) };
}

async function archive(job, output) {
  const path = join(job.dir, "playlist.zip");
  const zip = new yazl.ZipFile();
  zip.on("error", (error) => zip.outputStream.destroy(error));
  const write = pipeline(zip.outputStream, createWriteStream(path), { signal: job.controller.signal });
  for (const file of output.files) zip.addFile(file.path, file.name, { compress: false });
  zip.addBuffer(Buffer.from("#EXTM3U\r\n" + output.files.map((file) => file.name).join("\r\n") + "\r\n"), "Playlist.m3u8");
  if (output.skipped.length) {
    zip.addBuffer(Buffer.from(output.skipped.join("\r\n") + "\r\n"), "No descargadas.txt");
  }
  zip.end();
  await write;
  const { size } = await stat(path);
  await Promise.all(output.files.map((file) => rm(file.path, { force: true })));
  return { path, name: output.name, type: "application/zip", size };
}

export function mediaTools(env) {
  function attach(server) {
    const prefix = server.config.base + "__onda-media";
    let current;
    let expiry;
    const log = server.config.logger;

    async function removeFiles(job) {
      if (!job?.dir || dirname(job.dir) !== jobRoot || !basename(job.dir).startsWith(jobPrefix)) return;
      await rm(job.dir, { recursive: true, force: true }).catch((error) => log.warn(error.message));
    }

    function expire(job) {
      clearTimeout(expiry);
      expiry = setTimeout(async () => {
        if (current !== job) return;
        if (job.transfers) return expire(job);
        current = null;
        await removeFiles(job);
      }, resultLifetime);
      expiry.unref();
    }

    async function processJob(job, tools, source, input) {
      try {
        const output = source.youtube
          ? await downloadYoutube(tools, job, source.youtube)
          : await convertFile(tools, job, input, source.originalName);
        job.result = output.files ? await archive(job, output) : output;
        job.controller.signal.throwIfAborted();
        job.state = "ready";
        job.message = "Tu descarga está lista.";
      } catch (error) {
        job.state = job.controller.signal.aborted ? "cancelled" : "error";
        job.message = job.state === "cancelled" ? "Operación cancelada." : error instanceof MediaError
          ? error.message : "No se pudo preparar el audio. Vuelve a intentarlo.";
        if (job.state === "error" && !(error instanceof MediaError)) log.error(error.message);
        await removeFiles(job);
      } finally {
        if (input) await rm(input, { force: true }).catch(() => {});
        if (current === job) expire(job);
      }
    }

    async function start(request, response) {
      const source = await requestSource(request);
      if (!supportsFormat(source.format)) throw new MediaError("Elige un formato de audio disponible.");
      const tools = await localExecutables(env);
      if (!tools.ffmpeg || (source.youtube && !tools.ytDlp)) {
        return json(response, 503, { error: "Faltan los programas locales para esta operación." });
      }
      if (current && (current.state === "working" || current.transfers)) {
        return json(response, 409, { error: "Ya hay una operación en curso en Onda." });
      }
      const previous = current;
      const job = {
        id: randomUUID(),
        state: "working",
        message: source.youtube ? "Conectando con YouTube…" : "Recibiendo el archivo…",
        controller: new AbortController(),
        format: source.format,
        transfers: 0,
      };
      current = job;
      clearTimeout(expiry);
      try {
        await removeFiles(previous);
        job.dir = await mkdtemp(join(jobRoot, jobPrefix));
        let input;
        if (!source.youtube) {
          input = join(job.dir, "archivo");
          await pipeline(request, contentLimit(MAX_AUDIO_BYTES), createWriteStream(input), {
            signal: job.controller.signal,
          });
          if (!(await stat(input)).size) throw new MediaError("El archivo está vacío.");
          job.message = "Convirtiendo el archivo…";
        }
        json(response, 202, describe(job));
        void processJob(job, tools, source, input);
      } catch (error) {
        current = null;
        await removeFiles(job);
        throw error;
      }
    }

    async function sendResult(job, response) {
      if (job.state !== "ready") return json(response, 409, { error: "La descarga aún no está lista." });
      const { name, type, size, path } = job.result;
      const filename = encodeURIComponent(name).replace(/['()]/g, (character) =>
        "%" + character.charCodeAt(0).toString(16),
      );
      job.transfers++;
      try {
        response.writeHead(200, {
          "Content-Type": type,
          "Content-Length": size,
          "Content-Disposition": "attachment; filename*=UTF-8''" + filename,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        await pipeline(createReadStream(path), response);
      } finally {
        job.transfers--;
        if (current === job) expire(job);
      }
    }

    server.middlewares.use(async (request, response, next) => {
      const path = (request.url || "").split("?")[0];
      if (path !== prefix && !path.startsWith(prefix + "/")) return next();
      if (!isLocal(request)) {
        return json(response, 403, { error: "Abre Onda desde localhost para usar esta herramienta." });
      }
      const route = path.slice(prefix.length);
      try {
        if (route === "/status" && request.method === "GET") {
          const { ffmpeg, ytDlp } = await localExecutables(env);
          return json(response, 200, { convert: !!ffmpeg, youtube: !!(ffmpeg && ytDlp), job: describe(current) });
        }
        if (route === "/jobs" && request.method === "POST") return await start(request, response);
        const match = /^\/jobs\/([a-f0-9-]+)(\/result)?$/.exec(route);
        const job = current;
        if (!job || job.id !== match?.[1]) return json(response, 404, { error: "Esta operación ya no está disponible." });
        if (request.method === "GET" && match[2]) return await sendResult(job, response);
        if (request.method === "GET") return json(response, 200, describe(job));
        if (request.method === "DELETE" && !match[2] && job.state === "working") {
          job.controller.abort();
          return json(response, 202, describe(job));
        }
        return json(response, 405, { error: "Esta acción no está disponible." });
      } catch (error) {
        if (response.destroyed || response.headersSent) return;
        if (error instanceof MediaError) return json(response, 400, { error: error.message });
        log.error(error.message);
        return json(response, 500, { error: "La herramienta local no pudo completar la operación." });
      }
    });

    server.httpServer?.once("close", () => {
      clearTimeout(expiry);
      const job = current;
      current = null;
      job?.controller.abort();
      if (job?.state !== "working") void removeFiles(job);
    });
  }
  return { name: "onda-media-tools", configureServer: attach, configurePreviewServer: attach };
}
