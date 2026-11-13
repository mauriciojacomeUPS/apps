import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { downloadMedia, localExecutables, mediaSource, MediaError } from "./media-processing.js";

const execute = promisify(execFile);
export const DOWNLOAD_SAMPLES = Object.freeze([
  {
    id: "youtube-cobalt",
    label: "YouTube · Cobalt",
    provider: "youtube",
    engine: "cobalt",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    id: "youtube-ytdlp",
    label: "YouTube · yt-dlp",
    provider: "youtube",
    engine: "yt-dlp",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    id: "archive",
    label: "Internet Archive",
    provider: "archive",
    engine: "yt-dlp",
    url: "https://archive.org/details/testmp3testfile",
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    provider: "soundcloud",
    engine: "yt-dlp",
    url: "https://soundcloud.com/ethmusic/lostin-powers-she-so-heavy",
  },
  {
    id: "bandcamp",
    label: "Bandcamp",
    provider: "bandcamp",
    engine: "yt-dlp",
    url: "https://youtube-dl.bandcamp.com/track/youtube-dl-test-song",
  },
  {
    id: "vimeo",
    label: "Vimeo",
    provider: "vimeo",
    engine: "yt-dlp",
    url: "https://vimeo.com/76979871",
  },
]);

async function downloadSample(env, sample, signal) {
  const tools = await localExecutables({ ...env, ONDA_YOUTUBE_ENGINE: sample.engine });
  if (!tools.ffmpeg || !(sample.engine === "cobalt" ? tools.cobalt : tools.ytDlp))
    throw new MediaError("El motor de esta prueba no está disponible.", "tools-unavailable");
  const dir = await mkdtemp(join(tmpdir(), "onda-validation-"));
  try {
    const job = {
      dir,
      format: "m4a",
      controller: { signal },
      limits: {
        maxAudioBytes: 8 * 1024 * 1024,
        maxPlaylistBytes: 8 * 1024 * 1024,
        maxPlaylistTracks: 1,
        parallel: 1,
      },
    };
    const result = await downloadMedia(tools, job, mediaSource(sample.url));
    const file = result.files?.length === 1 ? result.files[0] : result;
    if (!file.path || !file.size || file.size > 8 * 1024 * 1024)
      throw new MediaError("La prueba no produjo un audio dentro del límite.", "audio-too-large");
    await execute(
      tools.ffmpeg,
      ["-v", "error", "-nostdin", "-i", file.path, "-map", "0:a:0", "-f", "null", "-"],
      { signal, timeout: 30000, maxBuffer: 16384 },
    );
    const bytes = await readFile(file.path);
    return {
      bytes: bytes.length,
      type: file.type,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      verifiedAudio: true,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runDownloadChecks(
  env,
  {
    signal,
    onUpdate = () => {},
    cobaltNetwork = () => [],
    runner = downloadSample,
    caseTimeoutMs = 60000,
    totalTimeoutMs = 300000,
  } = {},
) {
  const rows = DOWNLOAD_SAMPLES.map((sample) => ({ ...sample, status: "pending" }));
  const startedAt = new Date().toISOString(),
    deadline = Date.now() + totalTimeoutMs;
  const restricted = new Set();
  const snapshot = (status) => ({
    status,
    startedAt,
    checkedAt: status === "complete" ? new Date().toISOString() : undefined,
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    results: rows.map((row) => ({ ...row })),
  });
  onUpdate(snapshot("running"));
  for (const row of rows) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline || restricted.has(row.provider)) {
      Object.assign(row, {
        status: "skipped",
        message: restricted.has(row.provider)
          ? "La fuente ya rechazó el acceso en esta ronda."
          : "Se alcanzó el tiempo total de la ronda.",
      });
      onUpdate(snapshot("running"));
      continue;
    }
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.min(caseTimeoutMs, deadline - Date.now()));
    timer.unref();
    const start = Date.now(),
      firstSequence = cobaltNetwork().at(-1)?.sequence || 0;
    row.status = "running";
    onUpdate(snapshot("running"));
    try {
      const result = await runner(env, row, controller.signal);
      if (
        result?.verifiedAudio !== true ||
        !Number.isSafeInteger(result.bytes) ||
        result.bytes <= 0 ||
        result.bytes > 8 * 1024 * 1024 ||
        result.type !== "audio/mp4" ||
        !/^[a-f0-9]{64}$/.test(result.sha256 || "")
      )
        throw new MediaError(
          "La prueba no produjo un archivo de audio verificado.",
          "audio-unverified",
        );
      Object.assign(row, {
        bytes: result.bytes,
        type: result.type,
        sha256: result.sha256,
        verifiedAudio: true,
        status: "passed",
        message: "Audio descargado, convertido y decodificado por completo.",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      const code = controller.signal.aborted
        ? "timeout"
        : error instanceof MediaError
          ? error.code || "download-failed"
          : "download-failed";
      Object.assign(row, {
        status: "failed",
        code,
        message: controller.signal.aborted
          ? "La prueba agotó su tiempo."
          : error instanceof MediaError
            ? error.message
            : "La prueba no pudo completar la descarga y decodificación.",
      });
      if (
        typeof error.upstreamCode === "string" &&
        /^error\.api\.[a-z0-9_.]{1,100}$/.test(error.upstreamCode)
      )
        row.upstreamCode = error.upstreamCode;
      if (["proxy-blocked", "source-challenge", "rate-limit", "access-required"].includes(code))
        restricted.add(row.provider);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      row.elapsedMs = Date.now() - start;
      if (row.engine === "cobalt") {
        row.client = env.ONDA_COBALT_YOUTUBE_CLIENT || "IOS";
        row.network = cobaltNetwork()
          .filter((e) => e.sequence > firstSequence)
          .map((e) => ({ ...e }));
        if (row.status === "failed" && row.code === "source-unavailable") {
          const rejected = row.network.find((e) => [403, 429].includes(e.status));
          if (rejected) {
            row.code = rejected.status === 429 ? "rate-limit" : "source-forbidden";
            row.message =
              rejected.status === 429
                ? "YouTube limitó las solicitudes desde el servidor (429)."
                : "YouTube rechazó el acceso desde el servidor (403).";
            restricted.add(row.provider);
          }
        }
      }
      onUpdate(snapshot("running"));
    }
  }
  const result = snapshot("complete");
  onUpdate(result);
  return result;
}
