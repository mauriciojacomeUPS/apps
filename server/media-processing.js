import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_PLAYLIST_BYTES = 1024 * 1024 * 1024;
const execute = promisify(execFile);
const videoId = /^[a-z0-9_-]{11}$/i;
const playlistId = /^[a-z0-9_-]{10,100}$/i;
const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
export const MEDIA_SOURCES = ["youtube", "soundcloud", "bandcamp", "vimeo", "archive"];
const formats = new Map([
  ["mp3", { type: "audio/mpeg", args: ["-c:a", "libmp3lame", "-q:a", "2"] }],
  ["m4a", { type: "audio/mp4", args: ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"] }],
  ["flac", { type: "audio/flac", args: ["-c:a", "flac"] }],
  ["wav", { type: "audio/wav", args: ["-c:a", "pcm_s16le"] }],
]);

export class MediaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function supportsFormat(format) {
  return formats.has(format);
}

export function youtubeSource(value, { preferPlaylist = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MediaError("Pega un enlace completo a un video o una playlist de YouTube.");
  }
  if (url.hostname === "open.spotify.com" || url.hostname === "spotify.link")
    throw new MediaError(
      "Spotify no entrega archivos de audio para esta descarga. Usa la opción Spotify · listas para importar un CSV de la playlist.",
      "unsupported-source",
    );
  if (url.protocol === "https:" && !url.username && !url.password && !url.port) {
    const [first, second] = url.pathname.split("/").slice(1);
    if (preferPlaylist && youtubeHosts.has(url.hostname) && url.pathname === "/watch") {
      const id = url.searchParams.get("list");
      if (!playlistId.test(id)) throw new MediaError("El enlace no contiene una playlist válida.");
      return { url: "https://www.youtube.com/playlist?list=" + id, playlist: true };
    }
    if (youtubeHosts.has(url.hostname) && url.pathname === "/playlist") {
      const id = url.searchParams.get("list");
      if (playlistId.test(id)) {
        return { url: "https://www.youtube.com/playlist?list=" + id, playlist: true };
      }
    }
    let id;
    if (url.hostname === "youtu.be" && !second) id = first;
    if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      if (["shorts", "embed", "live"].includes(first) && !url.pathname.split("/")[3]) id = second;
    }
    if (videoId.test(id)) return { url: "https://www.youtube.com/watch?v=" + id, playlist: false };
  }
  throw new MediaError("El enlace debe apuntar a un video o una playlist de YouTube.");
}

export function mediaSource(value, options = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MediaError("Pega un enlace HTTPS completo a una fuente compatible.");
  }
  if (youtubeHosts.has(url.hostname) || url.hostname === "youtu.be")
    return { ...youtubeSource(value, options), provider: "youtube" };
  if (["open.spotify.com", "spotify.link"].includes(url.hostname))
    return youtubeSource(value, options);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    /%2f|%5c|%00/i.test(url.pathname)
  )
    throw new MediaError("Usa un enlace HTTPS público sin credenciales ni puertos especiales.");
  const path = url.pathname.replace(/\/+$/, "");
  if (["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"].includes(url.hostname)) {
    if (url.searchParams.has("secret_token"))
      throw new MediaError("Esta fuente requiere un enlace público.");
    if (/^\/[a-z0-9_-]+\/(?:sets\/)?[a-z0-9_-]+$/i.test(path))
      return {
        provider: "soundcloud",
        url: "https://soundcloud.com" + path,
        playlist: path.split("/")[2] === "sets",
      };
  }
  if (
    /^[a-z0-9][a-z0-9-]*\.bandcamp\.com$/i.test(url.hostname) &&
    !["www.bandcamp.com", "daily.bandcamp.com"].includes(url.hostname) &&
    /^\/(track|album)\/[a-z0-9_-]+$/i.test(path)
  )
    return { provider: "bandcamp", url: url.origin + path, playlist: path.startsWith("/album/") };
  if (["vimeo.com", "www.vimeo.com"].includes(url.hostname) && /^\/[0-9]{1,12}$/.test(path))
    return { provider: "vimeo", url: "https://vimeo.com" + path, playlist: false };
  if (url.hostname === "player.vimeo.com" && /^\/video\/[0-9]{1,12}$/.test(path))
    return {
      provider: "vimeo",
      url: "https://vimeo.com/" + path.split("/").at(-1),
      playlist: false,
    };
  if (
    ["archive.org", "www.archive.org"].includes(url.hostname) &&
    /^\/details\/[a-z0-9][a-z0-9._-]{0,99}$/i.test(path)
  )
    return { provider: "archive", url: "https://archive.org" + path, playlist: true };
  throw new MediaError(
    "Usa un video o lista pública de YouTube, SoundCloud, Bandcamp, Vimeo o Internet Archive. Spotify se importa como CSV.",
  );
}

const audioLimit = (job) => job.limits?.maxAudioBytes || MAX_AUDIO_BYTES;
const sourceName = (provider) =>
  ({
    youtube: "YouTube",
    soundcloud: "SoundCloud",
    bandcamp: "Bandcamp",
    vimeo: "Vimeo",
    archive: "Internet Archive",
  })[provider] || "La fuente";

export async function localExecutables(env) {
  async function locate(name, setting) {
    const extension = process.platform === "win32" ? ".exe" : "";
    const local =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? [join(process.env.LOCALAPPDATA, "Onda", "bin")]
        : [];
    const paths = [...local, ...(process.env.PATH || "").split(delimiter).filter(Boolean)];
    const candidates = env[setting]
      ? [resolve(env[setting])]
      : paths.map((folder) => resolve(folder.replace(/^"|"$/g, ""), name + extension));
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try {
        if ((await stat(path)).isFile()) {
          await access(path, constants.X_OK);
          return path;
        }
      } catch {
        // Try the next directory in PATH.
      }
    }
    return null;
  }
  const [ffmpeg, ytDlp] = await Promise.all([
    locate("ffmpeg", "ONDA_FFMPEG_PATH"),
    locate("yt-dlp", "ONDA_YTDLP_PATH"),
  ]);
  return { ffmpeg, ytDlp };
}

function safeName(value) {
  const clean = String(value || "Audio de Onda")
    .toWellFormed()
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "-")
    .trim()
    .replace(/^[.]+|[. ]+$/g, "");
  return [...(clean || "Audio de Onda")].slice(0, 115).join("");
}

function run(command, args, job, timeout = 120_000) {
  return execute(command, args, {
    signal: job.controller.signal,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout,
  });
}

async function convert(tools, job, input, index, title, tags = []) {
  const { type, args } = formats.get(job.format);
  const path = join(job.dir, `audio-${index}.${job.format}`);
  try {
    await run(
      tools.ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm,mp3,flac,wav,ogg,aac,avi,mpeg,mpegts,aiff,asf,amr,ac3,eac3,flv,au,caf",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        ...args,
        ...tags,
        "-threads",
        "1",
        "-fs",
        String(audioLimit(job) + 1),
        path,
      ],
      job,
    );
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    if (/matches no streams|cannot find a matching stream/i.test(error.stderr || "")) {
      throw new MediaError("El archivo no tiene una pista de audio.", "no-audio");
    }
    throw new MediaError(
      "FFmpeg no pudo convertir este archivo. Comprueba su formato y vuelve a intentarlo.",
      "conversion-failed",
    );
  }
  const { size } = await stat(path);
  if (!size || size > audioLimit(job)) {
    await rm(path, { force: true });
    throw new MediaError(
      "El audio supera " + Math.round(audioLimit(job) / 1024 / 1024) + " MB. Prueba con MP3 o M4A.",
      "audio-too-large",
    );
  }
  return { path, name: safeName(title) + "." + job.format, type, size };
}

export function convertFile(tools, job, input, originalName) {
  return convert(tools, job, input, 1, originalName.replace(/\.[^.]+$/, ""));
}

function ytArgs(job) {
  return [
    "--ignore-config",
    "--no-warnings",
    "--no-progress",
    "--encoding",
    "utf-8",
    "--no-js-runtimes",
    "--js-runtimes",
    "node:" + process.execPath,
    "--cache-dir",
    join(job.dir, "youtube-cache"),
    "--socket-timeout",
    "15",
    "--retries",
    "1",
    "--extractor-retries",
    "1",
    "--fragment-retries",
    "1",
    "--sleep-requests",
    "1",
  ];
}

export function youtubeError(error) {
  const detail = error.stderr || "";
  if (/tunnel connection failed.*403|proxy.*403|CONNECT.*403/i.test(detail))
    return new MediaError(
      "La red de este servidor bloquea la conexión con YouTube. Revisa el acceso a internet del equipo que prepara la descarga.",
      "proxy-blocked",
    );
  if (/not a bot|captcha|unusual traffic|automated queries/i.test(detail))
    return new MediaError(
      "YouTube pide una verificación contra bots a este servidor. La descarga desde aquí no está disponible para esta solicitud.",
      "source-challenge",
    );
  if (/HTTP Error 429|too many requests/i.test(detail)) {
    return new MediaError(
      "YouTube respondió con un límite de solicitudes (429). Espera antes de volver a probar.",
      "rate-limit",
    );
  }
  if (/sign in|login|members.only|age.restrict|private video/i.test(detail)) {
    return new MediaError(
      "YouTube requiere acceso a este video. Prueba con un video público.",
      "access-required",
    );
  }
  if (/max.filesize|larger than/i.test(detail))
    return new MediaError("El video supera el límite de tamaño de audio.", "audio-too-large");
  if (/HTTP Error 403|Forbidden/i.test(detail))
    return new MediaError("YouTube rechazó la solicitud desde este servidor.", "source-forbidden");
  if (/requested format.*not available|no video formats|only images/i.test(detail))
    return new MediaError(
      "YouTube no ofreció un formato de audio disponible.",
      "formats-unavailable",
    );
  if (
    /timed out|timeout|unable to connect|connection reset|name resolution|certificate verify/i.test(
      detail,
    )
  )
    return new MediaError(
      "El servidor no pudo completar la conexión con YouTube.",
      "source-network",
    );
  return new MediaError(
    "YouTube no entregó el audio. Comprueba el enlace y que el video esté disponible.",
    "source-unavailable",
  );
}

async function downloadVideo(
  tools,
  job,
  url,
  index,
  prefix = "",
  source = { provider: "youtube" },
  playlistIndex,
) {
  async function download(format) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    job.controller.signal.addEventListener("abort", abort, { once: true });
    if (job.controller.signal.aborted) abort();
    let exceeded = false,
      checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        for (const name of await readdir(job.dir))
          if (
            name.startsWith("input-" + index + ".") &&
            (await stat(join(job.dir, name))).size > audioLimit(job)
          ) {
            exceeded = true;
            controller.abort();
            break;
          }
      } catch {
      } finally {
        checking = false;
      }
    }, 400);
    timer.unref();
    try {
      const { stdout } = await run(
        tools.ytDlp,
        [
          ...ytArgs(job),
          ...(playlistIndex
            ? ["--yes-playlist", "--playlist-items", String(playlistIndex)]
            : ["--no-playlist"]),
          "--use-extractors",
          {
            youtube: "Youtube.*",
            soundcloud: "Soundcloud.*",
            bandcamp: "Bandcamp.*",
            vimeo: "Vimeo.*",
            archive: "ArchiveOrg",
          }[source.provider],
          "--match-filters",
          "!is_live",
          "--max-filesize",
          String(audioLimit(job)),
          "-f",
          format,
          "--no-simulate",
          "--print",
          "after_move:%(.{filepath,title,artist,uploader})j",
          "-o",
          join(job.dir, `input-${index}.%(ext)s`),
          "--",
          url,
        ],
        { ...job, controller },
      );
      const metadata = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "null");
      if (typeof metadata?.filepath !== "string") throw new Error("No downloaded audio");
      return metadata;
    } catch (error) {
      if (exceeded)
        throw new MediaError(
          "El audio supera el límite de tamaño del servidor.",
          "audio-too-large",
        );
      throw error;
    } finally {
      clearInterval(timer);
      job.controller.signal.removeEventListener("abort", abort);
    }
  }
  let metadata;
  try {
    metadata = await download(
      source.provider === "youtube" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio/best",
    );
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    if (error instanceof MediaError) throw error;
    throw source.provider === "youtube"
      ? youtubeError(error)
      : new MediaError(
          sourceName(source.provider) +
            " no entregó un audio público. Puede requerir acceso o no permitir su descarga.",
        );
  }
  const inputName = basename(metadata.filepath);
  if (!inputName.startsWith(`input-${index}.`)) {
    throw new MediaError("No se encontró el archivo descargado de YouTube.");
  }
  const input = join(job.dir, inputName);
  const title = metadata.title || "Audio de YouTube";
  const artist = metadata.artist || metadata.uploader || "";
  try {
    if ((await stat(input)).size > audioLimit(job)) {
      throw new MediaError("El audio supera el límite de tamaño del servidor.", "audio-too-large");
    }
    const tags = ["-metadata", "title=" + title];
    if (artist) tags.push("-metadata", "artist=" + artist);
    return await convert(tools, job, input, index, prefix + title, tags);
  } finally {
    await rm(input, { force: true }).catch(() => {});
  }
}

async function playlistInfo(tools, job, url) {
  try {
    const { stdout } = await run(
      tools.ytDlp,
      [
        ...ytArgs(job),
        "--flat-playlist",
        "--dump-single-json",
        "--playlist-end",
        String((job.limits?.maxPlaylistTracks || 200) + 1),
        "--",
        url,
      ],
      job,
    );
    return JSON.parse(stdout);
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    throw youtubeError(error);
  }
}

export async function downloadMedia(tools, job, source) {
  source = { ...source, provider: source.provider || "youtube" };
  if (!source.playlist) {
    job.message = "Descargando y convirtiendo el audio…";
    try {
      return await downloadVideo(tools, job, source.url, 1, "", source);
    } finally {
      for (const name of await readdir(job.dir).catch(() => []))
        if (name.startsWith("input-1."))
          await rm(join(job.dir, name), { force: true, recursive: true });
    }
  }
  job.message = "Leyendo la lista de " + sourceName(source.provider) + "…";
  const info = await playlistInfo(tools, job, source.url);
  const maximum = job.limits?.maxPlaylistTracks || 200;
  const entries = info?.entries?.slice(0, maximum);
  if (!entries?.length) throw new MediaError("La playlist está vacía o no se puede abrir.");
  const files = [];
  const skipped = [];
  let bytes = 0;
  let stopReason, stopCode;
  const capped = info.entries.length > maximum;
  if (capped) job.notice = "Este servidor procesa hasta " + maximum + " pistas por operación.";
  job.total = entries.length;
  job.done = 0;
  job.message = "Descargando y convirtiendo la playlist…";
  const parallel = job.limits?.parallel || 2;
  const width = String(entries.length).length;
  for (let offset = 0; offset < entries.length; offset += parallel) {
    job.controller.signal.throwIfAborted();
    const batch = entries.slice(offset, offset + parallel);
    const results = await Promise.allSettled(
      batch.map(async (entry, index) => {
        const position = offset + index + 1;
        try {
          if (source.provider === "youtube" && !videoId.test(entry?.id))
            throw new MediaError("Video no disponible.");
          const number = String(position).padStart(width, "0");
          return await downloadVideo(
            tools,
            job,
            source.provider === "youtube"
              ? "https://www.youtube.com/watch?v=" + entry.id
              : source.url,
            position,
            number + " - ",
            source,
            source.provider === "youtube" ? undefined : position,
          );
        } finally {
          for (const name of await readdir(job.dir).catch(() => []))
            if (name.startsWith("input-" + position + "."))
              await rm(join(job.dir, name), { force: true, recursive: true });
          job.done++;
        }
      }),
    );
    job.controller.signal.throwIfAborted();
    for (const [index, result] of results.entries()) {
      const number = String(offset + index + 1).padStart(width, "0");
      const title = safeName(batch[index]?.title || "Video no disponible");
      if (result.status === "rejected") {
        const reason =
          result.reason instanceof MediaError ? result.reason.message : "No se pudo procesar.";
        skipped.push(`${number}. ${title} — ${reason}`);
        if (["rate-limit", "source-challenge", "proxy-blocked"].includes(result.reason?.code)) {
          stopReason = result.reason.message;
          stopCode = result.reason.code;
        }
        continue;
      }
      const file = result.value;
      if (bytes + file.size > (job.limits?.maxPlaylistBytes || MAX_PLAYLIST_BYTES)) {
        await rm(file.path, { force: true });
        skipped.push(`${number}. ${title} — se alcanzó el límite de tamaño de la playlist.`);
        stopReason ||= "Se alcanzó el límite de tamaño de la playlist.";
      } else {
        bytes += file.size;
        files.push(file);
      }
    }
    if (stopReason) {
      const remaining = entries.length - offset - batch.length;
      if (remaining) {
        const label = remaining === 1 ? "video quedó pendiente." : "videos quedaron pendientes.";
        skipped.push(`${remaining} ${label} ${stopReason}`);
      }
      break;
    }
  }
  if (!files.length) {
    throw new MediaError(
      stopReason || "No se pudo descargar ningún video de esta playlist.",
      stopCode,
    );
  }
  job.message = "Preparando el archivo ZIP…";
  job.saved = files.length;
  job.skipped = entries.length - files.length;
  job.notice = [job.notice, stopReason].filter(Boolean).join(" ") || undefined;
  return {
    files,
    skipped,
    name: safeName(info.title || "Playlist de " + sourceName(source.provider)) + ".zip",
  };
}

export const downloadYoutube = (tools, job, source) =>
  downloadMedia(tools, job, { ...source, provider: "youtube" });

export async function runSourceProbe(env, { signal } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 90000);
  timer.unref();
  let dir;
  try {
    const tools = await localExecutables(env);
    if (!tools.ffmpeg || !tools.ytDlp)
      throw new MediaError("Faltan FFmpeg o yt-dlp en este servidor.", "tools-unavailable");
    dir = await mkdtemp(join(tmpdir(), "onda-probe-"));
    const output = await downloadMedia(
      tools,
      { dir, controller, format: "m4a", limits: { maxAudioBytes: 16 * 1024 * 1024 } },
      mediaSource("https://www.youtube.com/watch?v=BaW_jenozKc"),
    );
    return {
      provider: "youtube",
      status: "passed",
      message: "Se descargó y convirtió el video público de prueba.",
      bytes: output.size,
      elapsedMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: "youtube",
      status:
        !controller.signal.aborted &&
        [
          "proxy-blocked",
          "rate-limit",
          "source-challenge",
          "access-required",
          "source-forbidden",
        ].includes(error.code)
          ? "blocked"
          : "failed",
      code: controller.signal.aborted ? "probe-timeout" : error.code || "probe-failed",
      elapsedMs: Date.now() - startedAt,
      message: controller.signal.aborted
        ? "La comprobación agotó su tiempo o se detuvo."
        : error instanceof MediaError
          ? error.message
          : "No se pudo completar la comprobación de YouTube.",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (dir) await rm(dir, { force: true, recursive: true });
  }
}
