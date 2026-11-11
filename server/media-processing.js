import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, rm, stat } from "node:fs/promises";
import { basename, delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_PLAYLIST_BYTES = 1024 * 1024 * 1024;
const execute = promisify(execFile);
const videoId = /^[a-z0-9_-]{11}$/i;
const playlistId = /^[a-z0-9_-]{10,100}$/i;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
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

export function youtubeSource(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MediaError("Pega un enlace completo a un video o una playlist de YouTube.");
  }
  if (url.protocol === "https:" && !url.username && !url.password && !url.port) {
    const [first, second] = url.pathname.split("/").slice(1);
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

export async function localExecutables(env) {
  async function locate(name, setting) {
    const extension = process.platform === "win32" ? ".exe" : "";
    const local = process.platform === "win32" && process.env.LOCALAPPDATA
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
    await run(tools.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-protocol_whitelist", "file,pipe",
      "-format_whitelist", "mov,matroska,webm,mp3,flac,wav,ogg,aac,avi,mpeg,mpegts,aiff,asf,amr,ac3,eac3,flv,au,caf",
      "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn",
      ...args, ...tags, "-fs", String(MAX_AUDIO_BYTES + 1), path,
    ], job);
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    if (/matches no streams|cannot find a matching stream/i.test(error.stderr || "")) {
      throw new MediaError("El archivo no tiene una pista de audio.");
    }
    throw new MediaError("FFmpeg no pudo convertir este archivo. Comprueba su formato y vuelve a intentarlo.");
  }
  const { size } = await stat(path);
  if (!size || size > MAX_AUDIO_BYTES) {
    await rm(path, { force: true });
    throw new MediaError("El audio supera 100 MB. Prueba con MP3 o M4A.");
  }
  return { path, name: safeName(title) + "." + job.format, type, size };
}

export function convertFile(tools, job, input, originalName) {
  return convert(tools, job, input, 1, originalName.replace(/\.[^.]+$/, ""));
}

function ytArgs(job) {
  return [
    "--ignore-config", "--no-warnings", "--no-progress", "--encoding", "utf-8",
    "--no-js-runtimes", "--js-runtimes", "node:" + process.execPath,
    "--cache-dir", join(job.dir, "youtube-cache"), "--socket-timeout", "15", "--retries", "1",
    "--extractor-retries", "1", "--fragment-retries", "1", "--sleep-requests", "1",
  ];
}

function youtubeError(error) {
  const detail = error.stderr || "";
  if (/not a bot|HTTP Error 429|too many requests|captcha/i.test(detail)) {
    return new MediaError("YouTube limitó las solicitudes. Vuelve a intentarlo más tarde.", "rate-limit");
  }
  if (/sign in|login|members.only|age.restrict|private video/i.test(detail)) {
    return new MediaError("YouTube requiere acceso a este video. Prueba con un video público.");
  }
  if (/max.filesize|larger than/i.test(detail)) return new MediaError("El video supera 100 MB de audio.");
  return new MediaError("YouTube no entregó el audio. Comprueba el enlace y que el video esté disponible.");
}

async function downloadVideo(tools, job, url, index, prefix = "") {
  async function download(format) {
    const { stdout } = await run(tools.ytDlp, [
      ...ytArgs(job), "--no-playlist", "--match-filters", "!is_live",
      "--max-filesize", "100M", "-f", format,
      "--no-simulate", "--print", "after_move:%(.{filepath,title,artist,uploader})j",
      "-o", join(job.dir, `input-${index}.%(ext)s`), "--", url,
    ], job);
    const metadata = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "null");
    if (typeof metadata?.filepath !== "string") throw new Error("No downloaded audio");
    return metadata;
  }
  let metadata;
  try {
    try {
      metadata = await download("bestaudio[ext=m4a]/bestaudio");
    } catch (error) {
      if (job.controller.signal.aborted || !/HTTP Error 403/i.test(error.stderr || "")) throw error;
      metadata = await download("bestaudio[ext=webm]");
    }
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    throw youtubeError(error);
  }
  const inputName = basename(metadata.filepath);
  if (!inputName.startsWith(`input-${index}.`)) {
    throw new MediaError("No se encontró el archivo descargado de YouTube.");
  }
  const input = join(job.dir, inputName);
  const title = metadata.title || "Audio de YouTube";
  const artist = metadata.artist || metadata.uploader || "";
  try {
    if ((await stat(input)).size > MAX_AUDIO_BYTES) {
      throw new MediaError("El video supera 100 MB de audio.");
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
    const { stdout } = await run(tools.ytDlp, [
      ...ytArgs(job), "--flat-playlist", "--dump-single-json", "--", url,
    ], job);
    return JSON.parse(stdout);
  } catch (error) {
    if (job.controller.signal.aborted) throw error;
    throw youtubeError(error);
  }
}

export async function downloadYoutube(tools, job, source) {
  if (!source.playlist) {
    job.message = "Descargando y convirtiendo el audio…";
    return downloadVideo(tools, job, source.url, 1);
  }
  job.message = "Leyendo la playlist de YouTube…";
  const info = await playlistInfo(tools, job, source.url);
  const entries = info?.entries;
  if (!entries?.length) throw new MediaError("La playlist está vacía o no se puede abrir.");
  const files = [];
  const skipped = [];
  let bytes = 0;
  let stopReason;
  job.total = entries.length;
  job.done = 0;
  job.message = "Descargando y convirtiendo la playlist…";
  const parallel = 2;
  const width = String(entries.length).length;
  for (let offset = 0; offset < entries.length; offset += parallel) {
    job.controller.signal.throwIfAborted();
    const batch = entries.slice(offset, offset + parallel);
    const results = await Promise.allSettled(batch.map(async (entry, index) => {
      const position = offset + index + 1;
      try {
        if (!videoId.test(entry?.id)) throw new MediaError("Video no disponible.");
        const number = String(position).padStart(width, "0");
        return await downloadVideo(tools, job, "https://www.youtube.com/watch?v=" + entry.id, position, number + " - ");
      } finally {
        job.done++;
      }
    }));
    job.controller.signal.throwIfAborted();
    for (const [index, result] of results.entries()) {
      const number = String(offset + index + 1).padStart(width, "0");
      const title = safeName(batch[index]?.title || "Video no disponible");
      if (result.status === "rejected") {
        const reason = result.reason instanceof MediaError ? result.reason.message : "No se pudo procesar.";
        skipped.push(`${number}. ${title} — ${reason}`);
        if (result.reason?.code === "rate-limit") stopReason = result.reason.message;
        continue;
      }
      const file = result.value;
      if (bytes + file.size > MAX_PLAYLIST_BYTES) {
        await rm(file.path, { force: true });
        skipped.push(`${number}. ${title} — se alcanzó el límite de 1 GB.`);
        stopReason ||= "Se alcanzó el límite de 1 GB.";
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
    throw new MediaError(stopReason || "No se pudo descargar ningún video de esta playlist.");
  }
  job.message = "Preparando el archivo ZIP…";
  job.saved = files.length;
  job.skipped = entries.length - files.length;
  job.notice = stopReason;
  return { files, skipped, name: safeName(info.title || "Playlist de YouTube") + ".zip" };
}
