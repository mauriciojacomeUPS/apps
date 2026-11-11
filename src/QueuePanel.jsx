import { ArrowUp, ArrowDown, X, Headphones, Volume2, ListMusic } from "lucide-react";
import { img, formatTime } from "./data";
import { upcomingEntries } from "./player-queue";
import "./library-controls.css";

function Action({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export default function QueuePanel({
  queue,
  current,
  playing,
  onPlay,
  onClose,
  onMove,
  onRemove,
  onClear,
}) {
  const upcoming = upcomingEntries(queue, current);
  return (
    <aside className="queue-panel" aria-label="Cola de reproducción">
      <div className="queue-heading">
        <h2>A continuación</h2>
        <Action label="Cerrar cola" onClick={onClose}>
          <X size={20} />
        </Action>
      </div>
      <span className="eyebrow">{playing ? "AHORA SUENA" : "EN PAUSA"}</span>
      <img className="queue-cover" src={img(current.cover)} alt={`Portada de ${current.album}`} />
      <h3>{current.title}</h3>
      <p>{current.artist}</p>
      <div className="queue-tracklist">
        <div className="queue-list-title">
          <h4>
            Próximas canciones <span>{upcoming.length}</span>
          </h4>
          <button className="queue-clear" onClick={onClear} disabled={!upcoming.length}>
            Vaciar cola
          </button>
        </div>
        {upcoming.length ? (
          upcoming.map((entry, index) => (
            <div className="queue-entry" key={entry.queueId} data-queue-id={entry.queueId}>
              <button
                className="queue-item"
                onClick={() => onPlay(entry, queue)}
                aria-label={`Reproducir ${entry.title} desde la cola`}
              >
                <img src={img(entry.cover)} alt="" />
                <span>
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.artist} · {formatTime(entry.duration)}
                  </small>
                </span>
              </button>
              <div className="queue-actions">
                <Action
                  label={`Subir ${entry.title} en la cola`}
                  disabled={index === 0}
                  onClick={() => onMove(entry.queueId, -1)}
                >
                  <ArrowUp size={14} />
                </Action>
                <Action
                  label={`Bajar ${entry.title} en la cola`}
                  disabled={index === upcoming.length - 1}
                  onClick={() => onMove(entry.queueId, 1)}
                >
                  <ArrowDown size={14} />
                </Action>
                <Action
                  label={`Quitar ${entry.title} de la cola`}
                  onClick={() => onRemove(entry.queueId)}
                >
                  <X size={14} />
                </Action>
              </div>
            </div>
          ))
        ) : (
          <div className="queue-empty">
            <ListMusic size={26} />
            <p>El siguiente tema lo eliges tú.</p>
            <small>Añade canciones desde su menú. La canción actual seguirá sonando.</small>
          </div>
        )}
      </div>
      <span className="queue-footer">
        <Headphones size={15} /> Tu música, en el orden que tú quieras.
      </span>
    </aside>
  );
}
