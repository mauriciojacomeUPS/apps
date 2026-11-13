import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "./AccountGate";
import MediaServerSettings from "./MediaServerSettings";
import {
  createMediaClient,
  mediaClientToken,
  readMediaConnection,
  saveMediaConnection,
} from "./media-client";

const endpoint = import.meta.env.BASE_URL + "__onda-media";
const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const ios =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fileLimit = 100 * 1024 * 1024;
const formats = ["MP3", "M4A", "FLAC", "WAV"];

export default function MediaTools({ importing, onImport, onChooseFiles, onImportPlaylist }) {
  const { user } = useAuth();
  const owner = user?.id || "guest";
  const [connection, setConnection] = useState(() =>
    readMediaConnection(owner, { defaultUrl: import.meta.env.VITE_MEDIA_API_URL || "" }),
  );
  const [clientToken] = useState(() => mediaClientToken(owner));
  const [retry, setRetry] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const [probe, setProbe] = useState(null);
  const client = useMemo(
    () =>
      createMediaClient({
        url: connection.url,
        key: connection.key,
        clientToken,
        localBase: endpoint,
      }),
    [connection.url, connection.key, clientToken],
  );
  const [mode, setMode] = useState("youtube");
  const [url, setUrl] = useState("");
  const [fullPlaylist, setFullPlaylist] = useState(true);
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState(ios ? "m4a" : "mp3");
  const [availability, setAvailability] = useState(
    local || (connection.url && connection.key) ? null : {},
  );
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
    if ((!local && !connection.url) || (connection.url && !connection.key)) {
      setAvailability({});
      return;
    }
    const controller = new AbortController();
    setAvailability(null);
    setConnectionError("");
    setJob(null);
    setProbe(null);
    client
      .json("/status", { signal: controller.signal })
      .then((status) => {
        setAvailability(status);
        setJob(status.job);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setAvailability({});
          setConnectionError(error.message);
        }
      });
    let timer;
    if (client.remote) {
      const health = async () => {
        try {
          const value = await client.health();
          if (controller.signal.aborted) return;
          setProbe(value.sourceCheck);
          if (value.sourceCheck?.status === "checking") timer = setTimeout(health, 5000);
        } catch {}
      };
      health();
    }
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, retry]);
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
        const status = await client.json("/jobs/" + jobId, { signal: controller.signal });
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
  }, [jobId, working, client]);

  const busy = posting || working || adding || preparingShare;
  const linkMode = mode === "youtube" || mode === "links";
  const enabled = linkMode
    ? availability?.youtube
    : availability?.convert && availability?.uploads !== false;
  const downloadUrl = jobId ? client.downloadUrl(job) : "";
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
    if (job?.state === "error") setJob(null);
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
      const options = linkMode
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
      const next = await client.json("/jobs", { ...options, method: "POST" });
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
      setJob(await client.json("/jobs/" + jobId, { method: "DELETE" }));
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function resultFile(item, signal) {
    const path = "/jobs/" + jobId + (item.id === undefined ? "/result" : "/tracks/" + item.id);
    const response = await client.request(path, { signal });
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
      <MediaServerSettings
        connection={connection}
        onSave={(value) => {
          setConnection(saveMediaConnection(owner, value, { allowLocal: local }));
          setJob(null);
          setError("");
        }}
        busy={busy}
        connecting={Boolean(connection.url && availability === null)}
        error={connectionError}
        probe={probe}
        onRetry={() => setRetry((value) => value + 1)}
      />
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
          aria-pressed={mode === "links"}
          disabled={busy}
          onClick={() => changeMode("links")}
        >
          <Link2 size={17} /> Otros sitios
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
          {client.remote
            ? "Conectando con el servidor. Render Free puede tardar aproximadamente un minuto en despertar…"
            : "Buscando la herramienta de descargas…"}
        </p>
      ) : !enabled ? (
        <div className="media-source-help" role="status">
          <h3>
            {client.remote && mode === "file"
              ? "Los archivos del dispositivo se añaden directamente a tu biblioteca."
              : local
                ? "La herramienta de descargas necesita prepararse."
                : "Las descargas se preparan en un equipo con Onda."}
          </h3>
          <p>
            {client.remote && mode === "file"
              ? "El servicio online prepara enlaces públicos. Para convertir un archivo propio, usa Onda local en tu equipo."
              : local
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
          {linkMode ? (
            <label className="media-tools-source">
              {mode === "links"
                ? "Enlace público de audio o video"
                : "Enlace del video o la playlist"}
              <input
                type="url"
                value={url}
                placeholder={
                  mode === "links"
                    ? "https://soundcloud.com/artista/cancion"
                    : "https://www.youtube.com/playlist?list=…"
                }
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
            {linkMode ? "Preparar descarga" : "Convertir a audio"}
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
      {mode === "links" && (
        <p className="media-tools-note">
          Enlaces públicos de SoundCloud, Bandcamp, Vimeo e Internet Archive. Su disponibilidad
          depende de cada fuente; Spotify se importa en «Spotify · listas».
        </p>
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
      {!error &&
        job?.state === "error" &&
        ["source-challenge", "rate-limit"].includes(job.code) && (
          <div className="media-source-help">
            <h3>La descarga desde YouTube está restringida.</h3>
            <p>
              YouTube puede restringir el acceso desde servidores como Render. Cambiar de formato no
              resuelve esta respuesta. Puedes añadir tus archivos o probar un enlace público de otra
              fuente; su disponibilidad depende de cada sitio.
            </p>
            <div className="media-tools-actions">
              <button className="media-tools-action" type="button" onClick={onChooseFiles}>
                <FolderOpen size={16} /> Elegir audio del dispositivo
              </button>
              <button
                className="media-tools-action"
                type="button"
                onClick={() => changeMode("links")}
              >
                <Link2 size={16} /> Probar otro sitio
              </button>
            </div>
          </div>
        )}
    </section>
  );
}
