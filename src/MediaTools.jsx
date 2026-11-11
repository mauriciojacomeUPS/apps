import { useEffect, useState } from "react";
import { AudioLines, Download, FileMusic, Link2, Plus } from "lucide-react";
import "./media-tools.css";

const endpoint = import.meta.env.BASE_URL + "__onda-media";
const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const fileLimit = 100 * 1024 * 1024;
const formats = ["MP3", "M4A", "FLAC", "WAV"];

async function readStatus(path, options) {
  const response = await fetch(endpoint + path, options);
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("El servicio local de Onda no está disponible.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

export default function MediaTools({ importing, onImport }) {
  const [mode, setMode] = useState("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState("mp3");
  const [availability, setAvailability] = useState(local ? null : {});
  const [job, setJob] = useState(null);
  const [posting, setPosting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!local) return;
    const controller = new AbortController();
    readStatus("/status", { signal: controller.signal })
      .then((status) => {
        setAvailability(status);
        setJob(status.job);
        if (!status.youtube && status.convert) setMode("file");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability({});
      });
    return () => controller.abort();
  }, []);

  const jobId = job?.id;
  const working = job?.state === "working";
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
        if (controller.signal.aborted) return;
        setError(failure.message);
        setJob(null);
      }
    }
    timer = setTimeout(poll, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobId, working]);

  const busy = posting || working || adding;
  const enabled = mode === "youtube" ? availability?.youtube : availability?.convert;
  const downloadUrl = jobId ? endpoint + "/jobs/" + jobId + "/result" : "";

  async function start(event) {
    event.preventDefault();
    if (!enabled || busy) return;
    if (mode === "file" && (!file?.size || file.size > fileLimit)) {
      setError(file?.size > fileLimit ? "El archivo supera 100 MB." : "Elige un archivo con audio.");
      return;
    }
    setPosting(true);
    setError("");
    try {
      const options = mode === "youtube"
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), format }) }
        : {
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Onda-Format": format,
              "X-Onda-Filename": encodeURIComponent(file.name.toWellFormed()),
            },
            body: file,
          };
      const next = await readStatus("/jobs", { ...options, method: "POST" });
      setImported(false);
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

  async function addToLibrary() {
    setAdding(true);
    setError("");
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Esta descarga caducó. Prepara el audio de nuevo.");
      const audio = new File([await response.blob()], job.result.name, { type: job.result.type });
      const report = await onImport([audio]);
      if (report?.added.length || report?.duplicates) setImported(true);
      else throw new Error("No se pudo añadir este audio a la biblioteca.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="media-tools" aria-labelledby="media-tools-title" data-ui>
      <h2 id="media-tools-title"><AudioLines size={20} aria-hidden="true" /> Descargas y conversión</h2>
      {availability === null ? (
        <p className="media-tools-note" role="status">Buscando la herramienta local…</p>
      ) : !availability.convert ? (
        <p className="media-tools-note">
          {local
            ? "Abre Onda con su servidor local y FFmpeg para descargar o convertir audio."
            : "Abre Onda en tu equipo para descargar o convertir audio."}
        </p>
      ) : (
        <>
          <div className="media-tools-modes" role="group" aria-label="Origen del audio">
            <button type="button" aria-pressed={mode === "youtube"} disabled={busy}
              onClick={() => { setMode("youtube"); setFile(null); setError(""); }}>
              <Link2 size={17} aria-hidden="true" /> YouTube
            </button>
            <button type="button" aria-pressed={mode === "file"} disabled={busy}
              onClick={() => { setMode("file"); setError(""); }}>
              <FileMusic size={17} aria-hidden="true" /> Archivo del equipo
            </button>
          </div>
          {mode === "youtube" && !enabled ? (
            <p className="media-tools-note">Instala yt-dlp en el equipo para habilitar YouTube.</p>
          ) : (
            <form className="media-tools-form" onSubmit={start}>
              {mode === "youtube" ? (
                <label className="media-tools-source">
                  Enlace del video o la playlist
                  <input type="url" value={url} placeholder="https://youtu.be/…" required
                    onChange={(event) => setUrl(event.target.value)} disabled={busy} />
                </label>
              ) : (
                <label className="media-tools-source">
                  Audio o video del equipo
                  <input type="file" accept="audio/*,video/*,.mkv,.m4a,.m4b,.flac,.opus,.aiff,.wma"
                    required aria-describedby="media-tools-limit" disabled={busy}
                    onChange={(event) => setFile(event.target.files[0] || null)} />
                </label>
              )}
              <label className="media-tools-format">
                Formato de audio
                <select value={format} onChange={(event) => setFormat(event.target.value)} disabled={busy}>
                  {formats.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}
                </select>
              </label>
              <button type="submit" className="primary-button" disabled={busy}>
                {mode === "youtube" ? "Preparar descarga" : "Convertir a audio"}
              </button>
              {mode === "file" && <small id="media-tools-limit">Hasta 100 MB por archivo.</small>}
            </form>
          )}
        </>
      )}
      {posting && <p className="media-tools-note" role="status">Preparando la operación…</p>}
      {working && (
        <div className="media-tools-result">
          <div className="media-tools-progress" role="status">
            <p>{job.message}{job.total ? ` ${job.done} de ${job.total}` : ""}</p>
            <progress aria-label="Progreso de la descarga" max={job.total || 1} value={job.done} />
          </div>
          <button className="media-tools-action" type="button" onClick={cancel}>Cancelar</button>
        </div>
      )}
      {job?.state === "ready" && (
        <div className="media-tools-result">
          <div className="media-tools-filename">
            <strong role="status">{job.result.name}</strong>
            {job.total && <p>{job.saved} de {job.total} pistas{job.skipped ? " · el ZIP incluye un informe de pistas omitidas" : ""}</p>}
            {job.notice && <p>{job.notice}</p>}
          </div>
          <div className="media-tools-actions">
            <a className="media-tools-action" href={downloadUrl} download={job.result.name}>
              <Download size={16} aria-hidden="true" /> Guardar archivo
            </a>
            {job.result.type !== "application/zip" && (
              <button className="media-tools-action" type="button" onClick={addToLibrary}
                disabled={adding || importing || imported || posting}>
                <Plus size={16} aria-hidden="true" />
                {imported ? "En tu biblioteca" : adding ? "Añadiendo…" : "Añadir a biblioteca"}
              </button>
            )}
          </div>
        </div>
      )}
      {job?.state === "cancelled" && <p className="media-tools-note" role="status">{job.message}</p>}
      {(error || job?.state === "error") && <p className="media-tools-error" role="alert">{error || job.message}</p>}
    </section>
  );
}
