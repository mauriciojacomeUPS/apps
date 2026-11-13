import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  FileMusic,
  FolderOpen,
  Link2,
  ListMusic,
  Plus,
  Share2,
  Smartphone,
} from "lucide-react";
import "./media-tools.css";

const endpoint = import.meta.env.BASE_URL + "__onda-media";
const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const ios =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fileLimit = 100 * 1024 * 1024;
const formats = ["MP3", "M4A", "FLAC", "WAV"];

async function readStatus(path, options) {
  const response = await fetch(endpoint + path, options);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("El servicio de descargas no está disponible en esta dirección.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

export default function MediaTools({ importing, onImport, onChooseFiles, onImportPlaylist }) {
  const [mode, setMode] = useState("youtube");
  const [url, setUrl] = useState("");
  const [fullPlaylist, setFullPlaylist] = useState(true);
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState(ios ? "m4a" : "mp3");
  const [availability, setAvailability] = useState(local ? null : {});
  const [job, setJob] = useState(null);
  const [posting, setPosting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [imported, setImported] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [preparingShare, setPreparingShare] = useState(false);
  const [error, setError] = useState("");
  const importController = useRef(null);

  useEffect(() => {
    if (!local) return;
    const controller = new AbortController();
    readStatus("/status", { signal: controller.signal })
      .then((status) => {
        setAvailability(status);
        setJob(status.job);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability({});
      });
    return () => controller.abort();
  }, []);
  useEffect(() => () => importController.current?.abort(), []);

  const jobId = job?.id;
  const working = job?.state === "working";
  useEffect(() => {
    setShareFile(null);
    setImported(false);
    setImportProgress(null);
  }, [jobId]);
  useEffect(() => {
    if (!working || !jobId) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const status = await readStatus("/jobs/" + jobId, { signal: controller.signal });
        setJob(status);
        if (status.state === "working") timer = setTimeout(poll, 1000);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
          setJob(null);
        }
      }
    }
    timer = setTimeout(poll, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobId, working]);

  const busy = posting || working || adding || preparingShare;
  const enabled = mode === "youtube" ? availability?.youtube : availability?.convert;
  const downloadUrl = jobId ? endpoint + "/jobs/" + jobId + "/result" : "";
  const playlist = job?.result?.type === "application/zip";
  let linkHasPlaylist = false;
  try {
    linkHasPlaylist = new URL(url).pathname === "/watch" && new URL(url).searchParams.has("list");
  } catch {}
  const canShare =
    typeof navigator.share === "function" && typeof navigator.canShare === "function";

  function changeMode(next) {
    setMode(next);
    setFile(null);
    setError("");
  }
  async function start(event) {
    event.preventDefault();
    if (!enabled || busy) return;
    if (mode === "file" && (!file?.size || file.size > fileLimit)) {
      setError(
        file?.size > fileLimit ? "El archivo supera 100 MB." : "Elige un archivo con audio.",
      );
      return;
    }
    setPosting(true);
    setError("");
    try {
      const options =
        mode === "youtube"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: url.trim(),
                format,
                playlist: linkHasPlaylist && fullPlaylist,
              }),
            }
          : {
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Onda-Format": format,
                "X-Onda-Filename": encodeURIComponent(file.name),
              },
              body: file,
            };
      const next = await readStatus("/jobs", { ...options, method: "POST" });
      setJob(next);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPosting(false);
    }
  }
  async function cancel() {
    setError("");
    try {
      setJob(await readStatus("/jobs/" + jobId, { method: "DELETE" }));
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function resultFile(item, signal) {
    const path =
      item.id === undefined ? downloadUrl : endpoint + "/jobs/" + jobId + "/tracks/" + item.id;
    const response = await fetch(path, { signal });
    if (!response.ok) throw new Error("Esta descarga caducó. Prepara el audio de nuevo.");
    const blob = await response.blob();
    if (blob.size > fileLimit) throw new Error("El archivo supera 100 MB.");
    return new File([blob], item.name, { type: item.type });
  }
  async function addToLibrary() {
    const items = playlist ? job.items || [] : [job.result];
    if (!items.length) return;
    const controller = new AbortController();
    importController.current = controller;
    setAdding(true);
    setError("");
    const progress = {
      done: 0,
      total: items.length,
      added: 0,
      duplicates: 0,
      failed: 0,
      cancelled: false,
    };
    setImportProgress({ ...progress });
    try {
      // Keep one audio in memory at a time rather than unpacking a potentially 1 GB ZIP.
      for (const item of items) {
        if (controller.signal.aborted) {
          progress.cancelled = true;
          break;
        }
        try {
          const audio = await resultFile(item, controller.signal);
          if (controller.signal.aborted) {
            progress.cancelled = true;
            break;
          }
          const report = await onImport([audio], { silent: true });
          if (!report) throw new Error("No se pudo importar el audio.");
          progress.added += report.added.length;
          progress.duplicates += report.duplicates;
          if (!report.added.length && !report.duplicates) progress.failed++;
          progress.done++;
        } catch (failure) {
          if (controller.signal.aborted) {
            progress.cancelled = true;
            break;
          }
          progress.failed++;
          progress.done++;
        }
        setImportProgress({ ...progress });
      }
      setImportProgress({ ...progress });
      setImported(!progress.cancelled && !progress.failed && progress.done === progress.total);
    } finally {
      setAdding(false);
      importController.current = null;
    }
  }
  async function prepareShare() {
    setPreparingShare(true);
    setError("");
    try {
      const audio = await resultFile(job.result);
      if (!navigator.canShare({ files: [audio] }))
        throw new Error("Este navegador no permite compartir este archivo. Usa Guardar archivo.");
      setShareFile(audio);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPreparingShare(false);
    }
  }
  async function share() {
    try {
      await navigator.share({ files: [shareFile], title: job.result.name });
    } catch (failure) {
      if (failure.name !== "AbortError")
        setError("No se pudo abrir Compartir. Prueba Guardar archivo.");
    }
  }

  return (
    <section className="media-tools" aria-labelledby="media-tools-title" data-ui>
      <h2 id="media-tools-title">
        <AudioLines size={20} aria-hidden="true" /> Descargas y conversión
      </h2>
      <div className="media-tools-modes" role="group" aria-label="Origen del audio">
        <button
          type="button"
          aria-pressed={mode === "youtube"}
          disabled={busy}
          onClick={() => changeMode("youtube")}
        >
          <Link2 size={17} /> YouTube
        </button>
        <button
          type="button"
          aria-pressed={mode === "spotify"}
          disabled={busy}
          onClick={() => changeMode("spotify")}
        >
          <ListMusic size={17} /> Spotify · listas
        </button>
        <button
          type="button"
          aria-pressed={mode === "file"}
          disabled={busy}
          onClick={() => changeMode("file")}
        >
          <FileMusic size={17} /> Archivo del equipo
        </button>
      </div>
      {mode === "spotify" ? (
        <div className="media-source-help">
          <h3>Tu playlist, con tus propios archivos.</h3>
          <p>
            Importa un CSV de tu lista de Spotify. Onda enlaza títulos y artistas con canciones que
            ya añadiste a este dispositivo y te muestra las que faltan.
          </p>
          <p>
            El enlace de Spotify no entrega archivos MP3 o M4A. Esta opción importa la selección, no
            descarga el audio de Spotify.
          </p>
          <button className="media-tools-action" onClick={onImportPlaylist}>
            <ListMusic size={16} /> Importar CSV de Spotify
          </button>
          <details>
            <summary>Formato del CSV</summary>
            <p>
              Usa columnas «Track Name» y «Artist Name(s)», o «Título» y «Artista». Se aceptan CSV
              separados por comas, punto y coma o tabuladores, hasta 5 MB.
            </p>
            <p>
              Si necesitas exportar la lista,{" "}
              <a href="https://exportify.app/" target="_blank" rel="noopener noreferrer">
                Exportify (sitio externo)
              </a>{" "}
              trabaja con metadatos de Spotify. Después trae el CSV a Onda.
            </p>
          </details>
        </div>
      ) : availability === null ? (
        <p className="media-tools-note" role="status">
          Buscando la herramienta de descargas…
        </p>
      ) : !enabled ? (
        <div className="media-source-help" role="status">
          <h3>
            {local
              ? "La herramienta de descargas necesita prepararse."
              : "Las descargas se preparan en un equipo con Onda."}
          </h3>
          <p>
            {local
              ? mode === "youtube" && availability?.convert
                ? "Falta yt-dlp en este equipo para preparar videos y playlists de YouTube."
                : "Abre Onda con su servidor local y FFmpeg para convertir o descargar audio."
              : "Esta versión web no tiene un servidor de descargas conectado. Puedes añadir MP3, M4A y otros audios desde tus archivos y escucharlos sin conexión."}
          </p>
          <button className="media-tools-action" onClick={onChooseFiles}>
            <FolderOpen size={16} />{" "}
            {ios ? "Añadir desde Archivos del iPhone" : "Añadir audio desde Archivos"}
          </button>
          <p className="media-tools-note">
            {ios
              ? "En iPhone: guarda el audio en Archivos, pulsa este botón y selecciona las canciones. M4A o MP3 ofrecen buena compatibilidad."
              : "Para preparar un enlace de YouTube, usa Onda en el PC; después guarda o transfiere el audio a este dispositivo."}
          </p>
        </div>
      ) : (
        <form className="media-tools-form" onSubmit={start}>
          {mode === "youtube" ? (
            <label className="media-tools-source">
              Enlace del video o la playlist
              <input
                type="url"
                value={url}
                placeholder="https://www.youtube.com/playlist?list=…"
                required
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
            </label>
          ) : (
            <label className="media-tools-source">
              Audio o video del equipo
              <input
                type="file"
                accept="audio/*,video/*,.mkv,.m4a,.m4b,.flac,.opus,.aiff,.wma"
                required
                aria-describedby="media-tools-limit"
                disabled={busy}
                onChange={(event) => setFile(event.target.files[0] || null)}
              />
            </label>
          )}
          <label className="media-tools-format">
            Formato de audio
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              disabled={busy}
            >
              {formats.map((option) => (
                <option key={option} value={option.toLowerCase()}>
                  {option}
                  {option === "M4A" ? " · iPhone" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-button" disabled={busy}>
            {mode === "youtube" ? "Preparar descarga" : "Convertir a audio"}
          </button>
          {mode === "file" && <small id="media-tools-limit">Hasta 100 MB por archivo.</small>}
          {mode === "youtube" && linkHasPlaylist && (
            <label className="media-playlist-choice">
              <input
                type="checkbox"
                checked={fullPlaylist}
                onChange={(event) => setFullPlaylist(event.target.checked)}
                disabled={busy}
              />{" "}
              Descargar toda la playlist
            </label>
          )}
        </form>
      )}
      {posting && (
        <p className="media-tools-note" role="status">
          Preparando la operación…
        </p>
      )}
      {working && (
        <div className="media-tools-result">
          <div className="media-tools-progress" role="status">
            <p>
              {job.message}
              {job.total ? " " + job.done + " de " + job.total : ""}
            </p>
            <progress aria-label="Progreso de la descarga" max={job.total || 1} value={job.done} />
          </div>
          <button className="media-tools-action" type="button" onClick={cancel}>
            Cancelar
          </button>
        </div>
      )}
      {job?.state === "ready" && (
        <div className="media-tools-result">
          <div className="media-tools-filename">
            <strong role="status">{job.result.name}</strong>
            {job.total && (
              <p>
                {job.saved} de {job.total} pistas
                {job.skipped ? " · el ZIP incluye un informe de pistas omitidas" : ""}
              </p>
            )}
            {job.notice && <p>{job.notice}</p>}
          </div>
          <div className="media-tools-actions">
            <a className="media-tools-action" href={downloadUrl} download={job.result.name}>
              <Download size={16} /> Guardar archivo
            </a>
            {(!playlist || job.items?.length > 0) && (
              <button
                className="media-tools-action"
                type="button"
                onClick={addToLibrary}
                disabled={adding || importing || imported || busy}
              >
                <Plus size={16} />
                {imported
                  ? "En tu biblioteca"
                  : adding
                    ? "Añadiendo…"
                    : playlist
                      ? "Añadir playlist a biblioteca"
                      : "Añadir a biblioteca"}
              </button>
            )}
            {!playlist &&
              canShare &&
              (shareFile ? (
                <button className="media-tools-action" onClick={share}>
                  <Share2 size={16} /> Compartir / Guardar en Archivos
                </button>
              ) : (
                <button className="media-tools-action" disabled={busy} onClick={prepareShare}>
                  <Smartphone size={16} />
                  {preparingShare ? "Preparando archivo…" : "Preparar para compartir"}
                </button>
              ))}
          </div>
        </div>
      )}
      {importProgress && (
        <div className="media-import-progress" role="status">
          <p>
            {importProgress.cancelled ? "Importación detenida. " : ""}
            {importProgress.done} de {importProgress.total} procesadas · {importProgress.added}{" "}
            añadidas · {importProgress.duplicates} duplicadas
            {importProgress.failed ? " · " + importProgress.failed + " no se pudieron añadir" : ""}
          </p>
          {adding && (
            <button
              className="media-tools-action"
              onClick={() => importController.current?.abort()}
            >
              Detener importación
            </button>
          )}
        </div>
      )}
      {job?.state === "cancelled" && (
        <p className="media-tools-note" role="status">
          {job.message}
        </p>
      )}
      {(error || job?.state === "error") && (
        <p className="media-tools-error" role="alert">
          {error || job.message}
        </p>
      )}
    </section>
  );
}
