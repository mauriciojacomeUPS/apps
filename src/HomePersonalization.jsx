import { ArrowUpRight, Clock3, Play } from "lucide-react";
import { img, formatTime } from "./data";
import "./discovery.css";

export default function HomePersonalization({
  history,
  tracks,
  localTracks,
  current,
  progress,
  playing,
  onResume,
  onPlay,
  onLibrary,
  renderTracks,
}) {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const recent = history.filter((item) => byId.has(item.trackId));
  const popular = [...recent]
    .filter((item) => item.plays > 1)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5)
    .map((item) => byId.get(item.trackId));
  const additions = [...localTracks]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6);
  if (!recent.length && !additions.length) return null;
  const cards = (songs, prefix) => (
    <div className="personal-track-grid">
      {songs.map((track) => (
        <button
          key={track.id}
          className="personal-track"
          onClick={() => onPlay(track, songs)}
          aria-label={`${prefix} ${track.title}`}
        >
          <img src={img(track.cover)} alt="" />
          <span>
            <strong>{track.title}</strong>
            <small>{track.artist}</small>
          </span>
          <Play size={16} fill="currentColor" />
        </button>
      ))}
    </div>
  );
  return (
    <div className="personal-home">
      {recent.length > 0 && (
        <section className="continue-section">
          <div className="personal-heading">
            <div>
              <span className="eyebrow">TU MÚSICA SIGUE AQUÍ</span>
              <h2>Continúa donde lo dejaste</h2>
            </div>
            <Clock3 size={19} />
          </div>
          <button className="resume-card" onClick={onResume}>
            <img src={img(current.cover)} alt="" />
            <span>
              <small>{playing ? "SONANDO AHORA" : `RETOMAR DESDE ${formatTime(progress)}`}</small>
              <strong>{current.title}</strong>
              <span>{current.artist}</span>
            </span>
            <span className="round-play">
              <Play size={21} fill="currentColor" />
            </span>
          </button>
          <h3 className="personal-subheading">Escuchadas recientemente</h3>
          {cards(
            recent.slice(0, 6).map((item) => byId.get(item.trackId)),
            "Volver a escuchar",
          )}
        </section>
      )}
      {additions.length > 0 && (
        <section>
          <div className="personal-heading">
            <div>
              <span className="eyebrow">DE TU DISPOSITIVO</span>
              <h2>Recién añadidas</h2>
            </div>
            <button className="text-action" onClick={onLibrary}>
              Mi música <ArrowUpRight size={15} />
            </button>
          </div>
          {cards(additions, "Escuchar archivo")}
        </section>
      )}
      {popular.length > 0 && (
        <section>
          <div className="personal-heading">
            <div>
              <span className="eyebrow">LAS QUE SIEMPRE VUELVEN</span>
              <h2>Tus más escuchadas</h2>
            </div>
          </div>
          {renderTracks(popular)}
          <p className="personal-footnote">Según tus reproducciones en este navegador y perfil.</p>
        </section>
      )}
    </div>
  );
}
