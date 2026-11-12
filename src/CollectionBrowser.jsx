import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Disc3,
  FolderOpen,
  Music2,
  Play,
  Search,
  Users,
} from "lucide-react";
import { img, formatTime } from "./data";
import { buildCatalog, catalogArtistId } from "./music-catalog";
import "./collections.css";

const searchable = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
const countLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
const durationOf = (tracks) =>
  formatTime(tracks.reduce((sum, track) => sum + Math.max(0, Number(track.duration) || 0), 0));
const newestTrackTime = (item) =>
  item.tracks.reduce((latest, track) => Math.max(latest, Number(track.createdAt) || 0), 0);
const artDescription = (item, artist) =>
  artist
    ? `Ilustración de la colección de ${item.name}`
    : `${item.cover?.startsWith("data:image/") ? "Portada" : "Ilustración del álbum"} ${item.title}`;

function CollectionCard({ item, artist = false, onOpen, onPlay }) {
  const title = artist ? item.name : item.title;
  const openLabel = artist ? `Abrir artista ${title}` : `Abrir álbum ${title} de ${item.artist}`;
  return (
    <article
      className={`catalog-card ${artist ? "catalog-artist-card" : ""}`}
      data-collection-id={item.id}
    >
      <button
        className="catalog-card-main"
        aria-label={openLabel}
        onClick={() => onOpen(artist ? "artist" : "album", item.id)}
      >
        <div className="catalog-art">
          <img src={img(item.cover)} alt={artDescription(item, artist)} loading="lazy" />
        </div>
        <h2>{title}</h2>
        <p>
          {artist
            ? `${countLabel(item.albums.length, "álbum", "álbumes")} · ${countLabel(item.tracks.length, "canción", "canciones")}`
            : item.artist}
        </p>
        {!artist && (
          <small>
            {[item.year, countLabel(item.tracks.length, "canción", "canciones")]
              .filter(Boolean)
              .join(" · ")}
          </small>
        )}
      </button>
      <button
        className="catalog-play round-play"
        aria-label={
          artist
            ? `Reproducir canciones de ${title}`
            : `Reproducir álbum ${title} de ${item.artist}`
        }
        disabled={!item.tracks.length}
        onClick={() => onPlay(item.tracks[0], item.tracks)}
      >
        <Play size={18} fill="currentColor" />
      </button>
    </article>
  );
}

function EmptyCollection({ artists, onImport }) {
  return (
    <div className="empty-state collection-empty">
      <Music2 size={43} />
      <h2>
        {artists ? "Tus artistas empiezan con tus canciones." : "Cada álbum tiene su momento."}
      </h2>
      <p>
        Selecciona la música de tu dispositivo. Onda la organiza con las etiquetas de tus archivos,
        sin subirlos a internet.
      </p>
      <button className="primary-button" onClick={onImport}>
        <FolderOpen size={17} /> Añadir música local
      </button>
    </div>
  );
}

export default function CollectionBrowser({
  view,
  collectionId,
  tracks = [],
  onOpen,
  onPlay,
  renderTracks,
  onImport,
}) {
  const { albums, artists } = useMemo(() => buildCatalog(tracks), [tracks]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  useEffect(() => {
    setQuery("");
  }, [view, collectionId]);
  const artistView = view === "artists" || view === "artist";
  const detail = view === "artist" || view === "album";
  const current = detail
    ? (artistView ? artists : albums).find((group) => group.id === collectionId)
    : null;
  const indexItems = (artistView ? artists : albums).filter((item) =>
    searchable(artistView ? item.name : `${item.title} ${item.artist}`).includes(searchable(query)),
  );
  if (sort === "recent")
    indexItems.sort((first, second) => newestTrackTime(second) - newestTrackTime(first));
  const visibleTracks =
    current?.tracks.filter((track) =>
      searchable(`${track.title} ${track.artist} ${track.album}`).includes(searchable(query)),
    ) || [];

  return (
    <div className="page-content collection-page">
      <div className="collection-tabs" role="group" aria-label="Explorar tu colección">
        <button aria-pressed={!artistView} onClick={() => onOpen("albums")}>
          <Disc3 size={16} /> Álbumes
        </button>
        <button aria-pressed={artistView} onClick={() => onOpen("artists")}>
          <Users size={16} /> Artistas
        </button>
      </div>
      {detail && !current ? (
        <div className="empty-state collection-empty">
          <Disc3 size={39} />
          <h1>Esta colección no está disponible.</h1>
          <p>
            Los archivos de este álbum o artista ya no están en la biblioteca de este navegador.
          </p>
          <button
            className="secondary-button"
            onClick={() => onOpen(artistView ? "artists" : "albums")}
          >
            <ArrowLeft size={16} /> Volver a mi colección
          </button>
        </div>
      ) : detail ? (
        <>
          <button
            className="collection-back"
            onClick={() => onOpen(artistView ? "artists" : "albums")}
          >
            <ArrowLeft size={15} /> {artistView ? "Tus artistas" : "Tus álbumes"}
          </button>
          <section
            className={`collection-detail-hero ${artistView ? "collection-artist-hero" : ""}`}
          >
            <img
              className="collection-detail-cover"
              src={img(current.cover)}
              alt={artDescription(current, artistView)}
            />
            <div>
              <span className="eyebrow">
                {artistView ? "ARTISTA DE TU BIBLIOTECA" : "ÁLBUM DE TU BIBLIOTECA"}
              </span>
              <h1>{artistView ? current.name : current.title}</h1>
              {!artistView && <p className="collection-credit">{current.artist}</p>}
              <p className="collection-facts">
                {!artistView && current.year ? (
                  <>
                    <span>{current.year}</span>
                    <span>·</span>
                  </>
                ) : null}
                <span>{countLabel(current.tracks.length, "canción", "canciones")}</span>
                {artistView && (
                  <>
                    <span>·</span>
                    <span>{countLabel(current.albums.length, "álbum", "álbumes")}</span>
                  </>
                )}
                <span>·</span>
                <span>{durationOf(current.tracks)} de música</span>
              </p>
              <button
                className="primary-button collection-play-all"
                onClick={() => onPlay(current.tracks[0], current.tracks)}
                disabled={!current.tracks.length}
              >
                <Play size={17} fill="currentColor" />{" "}
                {artistView ? "Escuchar artista" : "Reproducir álbum"}
              </button>
            </div>
          </section>
          {artistView && current.albums.length > 0 && (
            <section className="collection-discography">
              <div className="collection-section-heading">
                <div>
                  <span className="eyebrow">EN TU DISPOSITIVO</span>
                  <h2>Sus álbumes en tu biblioteca</h2>
                </div>
              </div>
              <div className="catalog-grid catalog-discography-grid">
                {current.albums.map((album) => (
                  <CollectionCard key={album.id} item={album} onOpen={onOpen} onPlay={onPlay} />
                ))}
              </div>
            </section>
          )}
          {!artistView && current.artists.length > 1 && (
            <div className="collection-contributors">
              <span>Con la música de</span>
              {current.artists.map((name) => {
                const artist = artists.find((item) => item.id === catalogArtistId(name));
                return artist ? (
                  <button key={artist.id} onClick={() => onOpen("artist", artist.id)}>
                    {name}
                    <ArrowUpRight size={12} />
                  </button>
                ) : (
                  <span key={name}>{name}</span>
                );
              })}
            </div>
          )}
          <section className="collection-track-section">
            <div className="collection-section-heading">
              <h2>{artistView ? "Sus canciones" : "Canciones del álbum"}</h2>
              <label className="collection-search">
                <Search size={16} />
                <input
                  aria-label={artistView ? "Buscar en este artista" : "Buscar en este álbum"}
                  placeholder="Buscar una canción"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {visibleTracks.length ? (
              renderTracks(visibleTracks)
            ) : (
              <div className="empty-state collection-no-results">
                <Search size={30} />
                <h2>No hay coincidencias</h2>
                <p>Prueba con otro título o artista.</p>
                <button className="secondary-button" onClick={() => setQuery("")}>
                  Ver todas las canciones
                </button>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="collection-index-heading">
            <div>
              <span className="eyebrow">LA MÚSICA QUE HICISTE TUYA</span>
              <h1>
                {artistView ? "Tus artistas" : "Tus álbumes"}
                <span>.</span>
              </h1>
              <p className="page-description">
                {artistView
                  ? "Todas esas voces y sonidos que siempre quieres volver a escuchar."
                  : "Historias que se escuchan de principio a fin. Tus archivos, bien acompañados."}
              </p>
            </div>
            {artistView ? <Users size={30} /> : <Disc3 size={30} />}
          </div>
          {(artistView ? artists : albums).length ? (
            <>
              <div className="collection-browse-tools">
                <label className="collection-search">
                  <Search size={17} />
                  <input
                    aria-label={
                      artistView
                        ? "Buscar artistas de tu biblioteca"
                        : "Buscar álbumes de tu biblioteca"
                    }
                    placeholder={artistView ? "Buscar un artista" : "Buscar un álbum o artista"}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="collection-sort">
                  <span>Ordenar</span>
                  <select
                    aria-label="Ordenar colección"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="name">{artistView ? "Nombre" : "Título"}</option>
                    <option value="recent">Recién añadidos</option>
                  </select>
                </label>
              </div>
              <p className="collection-count">
                {countLabel(
                  indexItems.length,
                  artistView ? "artista" : "álbum",
                  artistView ? "artistas" : "álbumes",
                )}{" "}
                de tu colección
              </p>
              {indexItems.length ? (
                <div className="catalog-grid">
                  {indexItems.map((item) => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                      artist={artistView}
                      onOpen={onOpen}
                      onPlay={onPlay}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state collection-no-results">
                  <Search size={33} />
                  <h2>No hay coincidencias</h2>
                  <p>Prueba con otro nombre o revisa las etiquetas de tus archivos.</p>
                  <button className="secondary-button" onClick={() => setQuery("")}>
                    Ver toda la colección
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyCollection artists={artistView} onImport={onImport} />
          )}
        </>
      )}
      <p className="collection-source-note">
        <FolderOpen size={14} /> Colección de este navegador. Las etiquetas y las portadas
        incrustadas se leen de tus archivos.
      </p>
    </div>
  );
}
