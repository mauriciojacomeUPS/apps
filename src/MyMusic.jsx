import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  FileMusic,
  HardDrive,
  Plus,
  Search,
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  Pencil,
  Trash2,
  ListPlus,
  X,
  CheckCircle2,
} from "lucide-react";
import { img, formatTime } from "./data";
import { localAudioAccept } from "./device-library";
import MediaTools from "./MediaTools";
import "./device.css";

const bytesLabel = (bytes) =>
  bytes < 1024 * 1024 ? Math.round(bytes / 1024) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export default function MyMusic({
  tracks,
  library,
  onRefresh,
  onPlay,
  onLike,
  liked,
  current,
  playing,
  notify,
  onRemove,
  onOptions,
  onImportPlaylist,
}) {
  const filesInput = useRef(null);
  const folderInput = useRef(null);
  const modalRoot = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [details, setDetails] = useState({ title: "", artist: "", album: "" });
  useEffect(() => {
    if (!modal) return;
    const root = modalRoot.current,
      previous = document.activeElement;
    const targets = () => [...root.querySelectorAll("input, button:not(:disabled)")];
    (root.querySelector("input") || targets()[0])?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) setModal(null);
      if (event.key !== "Tab") return;
      const list = targets();
      if (event.shiftKey && document.activeElement === list[0]) {
        event.preventDefault();
        list.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
        event.preventDefault();
        list[0]?.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal, busy]);
  const selected = useMemo(() => {
    const result = tracks.filter((track) =>
      normalize(track.title + " " + track.artist + " " + track.album).includes(normalize(query)),
    );
    return result.sort((a, b) =>
      sort === "recent" ? b.createdAt - a.createdAt : a[sort].localeCompare(b[sort], "es"),
    );
  }, [tracks, query, sort]);
  const importFiles = async (selection, { silent = false } = {}) => {
    if (busy || !selection.length) return;
    setBusy(true);
    setError("");
    setReport(null);
    setProgress(0);
    try {
      const result = await library.importFiles(selection, setProgress);
      setReport(result);
      if (result.added.length && !silent)
        notify(
          result.added.length +
            (result.added.length === 1
              ? " canción añadida a tu biblioteca."
              : " canciones añadidas a tu biblioteca."),
        );
      else if (result.duplicates && !silent) notify("Estas canciones ya están en tu biblioteca.");
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      await onRefresh();
      setBusy(false);
    }
  };
  const edit = (track) => {
    setMenu(null);
    setError("");
    setDetails({
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist || track.artist,
      year: track.year || "",
      genres: (track.genres || []).join(", "),
    });
    setModal({ type: "edit", track });
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await library.update(modal.track.id, details);
      await onRefresh();
      setModal(null);
      notify("Detalles actualizados.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      const track = modal.track;
      await library.remove(track.id);
      onRemove(track);
      await onRefresh();
      setModal(null);
      notify("Canción quitada de esta biblioteca.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="page-content device-page"
      onClick={() => {
        if (menu) setMenu(null);
      }}
    >
      <div className="device-title">
        <div>
          <span className="eyebrow">TUS ARCHIVOS. TU PROPIO SONIDO.</span>
          <h1>
            En este dispositivo<span>.</span>
          </h1>
        </div>
        <HardDrive size={30} />
      </div>
      <p className="page-description">
        Tus canciones tienen un lugar aquí. Sin subirlas a internet.
      </p>
      <section
        className={"device-import " + (dragging ? "drag-active" : "")}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          importFiles([...event.dataTransfer.files]);
        }}
        aria-label="Añadir archivos de música"
      >
        <div className="device-import-icon">
          <FolderOpen size={31} />
        </div>
        <div className="device-import-copy">
          <h2>{busy ? "Preparando tu música…" : "Hazle espacio a tus favoritos."}</h2>
          <p>Arrastra tus canciones o elige archivos y carpetas.</p>
          <small>
            MP3, AAC, M4A, M4B, FLAC, WAV, Ogg, Opus, MP4 y WebM de audio · hasta 100 MB por canción
          </small>
        </div>
        <div className="device-import-actions">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => filesInput.current.click()}
          >
            <Plus size={17} /> Elegir archivos
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => folderInput.current.click()}
          >
            <FolderOpen size={16} /> Elegir carpeta
          </button>
        </div>
        <input
          ref={filesInput}
          type="file"
          multiple
          accept={localAudioAccept}
          aria-label="Seleccionar canciones locales"
          hidden
          onChange={(event) => {
            importFiles([...event.target.files]);
            event.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          aria-label="Seleccionar carpeta de música"
          hidden
          onChange={(event) => {
            importFiles([...event.target.files]);
            event.target.value = "";
          }}
        />
        {busy && (
          <div
            className="device-progress"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Importación local"
          >
            <span style={{ width: progress + "%" }} />
            <small>{progress}%</small>
          </div>
        )}
      </section>
      <p className="device-storage-note">
        <HardDrive size={14} />
        <span>
          Se conservan copias solo en este navegador. Si borras sus datos o cambias de dispositivo,
          vuelve a seleccionar los archivos. Los originales permanecen intactos.
        </span>
      </p>
      <MediaTools
        importing={busy}
        onImport={importFiles}
        onChooseFiles={() => filesInput.current.click()}
        onImportPlaylist={onImportPlaylist}
      />
      {error && !modal && (
        <p className="device-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="device-import-report" role="status">
          <CheckCircle2 size={17} />
          <span>
            {report.added.length} {report.added.length === 1 ? "añadida" : "añadidas"}
            {report.duplicates
              ? " · " +
                report.duplicates +
                (report.duplicates === 1 ? " duplicada omitida" : " duplicadas omitidas")
              : ""}
            {report.skipped ? " · " + report.skipped + " archivos de otro tipo omitidos" : ""}
          </span>
          {report.errors.length > 0 && (
            <details>
              <summary>
                {report.errors.length}{" "}
                {report.errors.length === 1
                  ? "archivo no se pudo leer"
                  : "archivos no se pudieron leer"}
              </summary>
              <ul>
                {report.errors.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="device-list-heading">
        <div>
          <h2>Tu colección local</h2>
          <span>
            {tracks.length} canciones · {bytesLabel(tracks.reduce((sum, t) => sum + t.bytes, 0))}
          </span>
        </div>
        <label className="device-sort">
          Ordenar
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Ordenar canciones locales"
          >
            <option value="recent">Más recientes</option>
            <option value="title">Título</option>
            <option value="artist">Artista</option>
            <option value="album">Álbum</option>
          </select>
        </label>
      </div>
      {tracks.length > 0 && (
        <label className="device-search">
          <Search size={17} />
          <input
            aria-label="Buscar en tus archivos locales"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por canción, artista o álbum"
          />
        </label>
      )}
      {!tracks.length ? (
        <div className="empty-state device-empty">
          <FileMusic size={42} />
          <h2>Tu colección empieza contigo.</h2>
          <p>Selecciona la música de tu dispositivo y escúchala con el reproductor de Onda.</p>
        </div>
      ) : !selected.length ? (
        <div className="empty-state">
          <Search size={34} />
          <h2>No hay coincidencias</h2>
          <p>Prueba con otro título o artista.</p>
          <button className="secondary-button" onClick={() => setQuery("")}>
            Ver toda mi música
          </button>
        </div>
      ) : (
        <div className="device-tracks">
          {selected.map((track) => (
            <div
              className={
                "device-track " + (current.id === track.id && playing ? "track-active" : "")
              }
              key={track.id}
            >
              <button
                className="device-track-play"
                aria-label={
                  (current.id === track.id && playing ? "Pausar " : "Reproducir ") + track.title
                }
                onClick={() => onPlay(track, selected)}
              >
                {current.id === track.id && playing ? (
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
              </button>
              <button className="track-info" onClick={() => onPlay(track, selected)}>
                <img src={img(track.cover)} alt="" />
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
              <span className="device-track-album">{track.album}</span>
              <button
                className={"icon-button " + (liked.includes(track.id) ? "is-liked" : "")}
                aria-label={
                  (liked.includes(track.id) ? "Quitar de me gusta " : "Me gusta ") + track.title
                }
                onClick={() => onLike(track.id)}
              >
                <Heart size={16} fill={liked.includes(track.id) ? "currentColor" : "none"} />
              </button>
              <span className="device-track-duration">{formatTime(track.duration)}</span>
              <div className="device-menu-anchor">
                <button
                  className="icon-button"
                  aria-label={"Opciones locales de " + track.title}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenu(menu === track.id ? null : track.id);
                  }}
                >
                  <MoreHorizontal size={19} />
                </button>
                {menu === track.id && (
                  <div className="dropdown device-track-menu">
                    <button
                      onClick={() => {
                        setMenu(null);
                        onOptions(track);
                      }}
                    >
                      <ListPlus size={15} /> Playlist y cola
                    </button>
                    <button onClick={() => edit(track)}>
                      <Pencil size={15} /> Editar detalles
                    </button>
                    <button
                      onClick={() => {
                        setError("");
                        setMenu(null);
                        setModal({ type: "delete", track });
                      }}
                    >
                      <Trash2 size={15} /> Quitar de la biblioteca
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="device-bottom-note">
        <FileMusic size={15} />
        La reproducción de algunos formatos depende de tu navegador. MP3 es la opción más
        compatible.
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            ref={modalRoot}
            className="modal device-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-modal-title"
          >
            <button
              className="icon-button modal-close"
              aria-label="Cerrar detalles de canción"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal.type === "edit" ? (
              <>
                <span className="eyebrow">PONLE NOMBRE A TU SONIDO</span>
                <h2 id="device-modal-title">Editar detalles</h2>
                <p>Los cambios se guardan en Onda. El archivo original no se modifica.</p>
                <form onSubmit={save}>
                  {[
                    ["title", "Título"],
                    ["artist", "Artista"],
                    ["album", "Álbum"],
                    ["albumArtist", "Artista del álbum"],
                    ["year", "Año"],
                    ["genres", "Géneros (separados por comas)"],
                  ].map(([field, label]) => (
                    <React.Fragment key={field}>
                      <label htmlFor={"edit-" + field}>{label}</label>
                      <input
                        id={"edit-" + field}
                        type={field === "year" ? "number" : "text"}
                        min={field === "year" ? 1 : undefined}
                        max={field === "year" ? 9999 : undefined}
                        maxLength={200}
                        required={field === "title"}
                        value={details[field]}
                        disabled={busy}
                        onChange={(event) =>
                          setDetails({ ...details, [field]: event.target.value })
                        }
                      />
                    </React.Fragment>
                  ))}
                  {error && (
                    <p className="device-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Guardando…" : "Guardar cambios"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="eyebrow">TU COLECCIÓN LOCAL</span>
                <h2 id="device-modal-title">¿Quitar esta canción?</h2>
                <p>
                  «{modal.track.title}» se quitará de esta biblioteca y de tus playlists de Onda. El
                  archivo original seguirá en tu dispositivo.
                </p>
                {error && (
                  <p className="device-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="device-confirm-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Conservar canción
                  </button>
                  <button className="primary-button" disabled={busy} onClick={remove}>
                    {busy ? "Quitando…" : "Quitar canción"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
