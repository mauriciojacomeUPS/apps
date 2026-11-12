import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Disc3, Search, SlidersHorizontal, Users } from "lucide-react";
import { img } from "./data";
import { buildCatalog } from "./music-catalog";
import { searchText, searchTracks } from "./music-search";
import "./discovery.css";

const emptyFilters = { artist: "", album: "", genre: "", year: "", sort: "title" };
export default function SearchPage({
  query,
  setQuery,
  tracks,
  localTracks,
  playlists,
  renderTracks,
  renderPlaylist,
  onOpen,
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [kind, setKind] = useState("Todo");
  const [showFilters, setShowFilters] = useState(false);
  const [mood, setMood] = useState("");
  useEffect(() => setMood(""), [query]);
  const found = useMemo(
    () => searchTracks(tracks, { ...filters, query: [query, mood].filter(Boolean).join(" ") }),
    [tracks, filters, query, mood],
  );
  const { albums, artists } = useMemo(() => buildCatalog(localTracks), [localTracks]);
  const foundIds = new Set(found.map((track) => track.id));
  const foundAlbums = albums.filter((item) => item.tracks.some((track) => foundIds.has(track.id)));
  const foundArtists = artists.filter((item) =>
    item.tracks.some((track) => foundIds.has(track.id)),
  );
  const hasFacets = ["artist", "album", "genre", "year"].some((key) => filters[key]);
  const foundPlaylists =
    hasFacets || mood
      ? []
      : playlists.filter((item) =>
          query
            .trim()
            .split(/\s+/)
            .every((term) =>
              searchText(item.title + " " + item.subtitle).includes(searchText(term)),
            ),
        );
  const hasSearch = Boolean(query.trim() || hasFacets || mood || kind !== "Todo");
  const options = (key) =>
    [
      ...new Set(
        tracks
          .flatMap((track) => (key === "genre" ? track.genres || [] : [track[key]]))
          .filter(Boolean),
      ),
    ].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
  const counts = {
    Todo: found.length + foundAlbums.length + foundArtists.length + foundPlaylists.length,
    Canciones: found.length,
    Álbumes: foundAlbums.length,
    Artistas: foundArtists.length,
    Playlists: foundPlaylists.length,
  };
  const visible = (name) => kind === "Todo" || kind === name;
  const reset = () => {
    setFilters(emptyFilters);
    setMood("");
    setQuery("");
    setKind("Todo");
  };
  return (
    <div className="page-content search-page">
      <span className="eyebrow">DEJA QUE LA CURIOSIDAD SUENE</span>
      <h1>{query ? `Resultados para “${query}”` : mood || "Tu próxima obsesión está aquí."}</h1>
      <p className="page-description">
        Busca entre tus archivos locales y las selecciones de Onda.
      </p>
      <div className="search-tools">
        <div className="search-kinds" role="group" aria-label="Tipo de resultado">
          {Object.keys(counts).map((name) => (
            <button
              key={name}
              className={`chip ${kind === name ? "selected" : ""}`}
              aria-pressed={kind === name}
              onClick={() => setKind(name)}
            >
              {name}
              {hasSearch && <small>{counts[name]}</small>}
            </button>
          ))}
        </div>
        <button
          className={`filter-toggle ${hasFacets ? "active" : ""}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={15} /> Filtros{hasFacets ? " activos" : ""}
        </button>
      </div>
      {showFilters && (
        <div className="search-filters">
          {Object.entries({ artist: "Artista", album: "Álbum", genre: "Género", year: "Año" }).map(
            ([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <select
                  aria-label={`Filtrar por ${label.toLowerCase()}`}
                  value={filters[key]}
                  onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                >
                  <option value="">Todos</option>
                  {options(key).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ),
          )}
          <button
            className="text-action"
            onClick={() => {
              setFilters(emptyFilters);
              setMood("");
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}
      {hasSearch ? (
        <>
          <div className="search-result-heading">
            <span>
              {counts[kind]} resultados{mood ? ` · ${mood}` : ""}
            </span>
            <label>
              Ordenar canciones{" "}
              <select
                aria-label="Ordenar resultados"
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
              >
                <option value="title">Título</option>
                <option value="artist">Artista</option>
                <option value="album">Álbum</option>
                <option value="year">Año: más recientes</option>
                <option value="recent">Recién añadidas</option>
              </select>
            </label>
          </div>
          {visible("Canciones") && found.length > 0 && (
            <section>
              <h2 className="search-section-title">Canciones</h2>
              {renderTracks(found)}
            </section>
          )}
          {visible("Álbumes") && foundAlbums.length > 0 && (
            <section>
              <h2 className="search-section-title">Álbumes de tu biblioteca</h2>
              <div className="search-collection-grid">
                {foundAlbums.map((item) => (
                  <button
                    key={item.id}
                    className="search-collection"
                    onClick={() => onOpen("album", item.id)}
                  >
                    <img src={img(item.cover)} alt="" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.artist}</small>
                    </span>
                    <Disc3 size={16} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {visible("Artistas") && foundArtists.length > 0 && (
            <section>
              <h2 className="search-section-title">Artistas de tu biblioteca</h2>
              <div className="search-collection-grid">
                {foundArtists.map((item) => (
                  <button
                    key={item.id}
                    className="search-collection artist-result"
                    onClick={() => onOpen("artist", item.id)}
                  >
                    <img src={img(item.cover)} alt="" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.tracks.length} canciones locales</small>
                    </span>
                    <Users size={16} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {visible("Playlists") && foundPlaylists.length > 0 && (
            <section>
              <h2 className="search-section-title">Playlists</h2>
              <div className="playlist-grid">{foundPlaylists.map(renderPlaylist)}</div>
            </section>
          )}
          {!counts[kind] && (
            <div className="empty-state">
              <Search size={40} />
              <h2>No encontramos esa onda</h2>
              <p>
                Prueba otro título o cambia los filtros. Las etiquetas se pueden editar en Mi
                música.
              </p>
              <button className="secondary-button" onClick={reset}>
                Explorar música
              </button>
            </div>
          )}
          {mood && (
            <button className="secondary-button back-categories" onClick={() => setMood("")}>
              Volver a explorar
            </button>
          )}
        </>
      ) : (
        <>
          <div className="mood-grid">
            {[
              { title: "Chill", sub: "Un respiro, por favor.", cover: "desert", color: "#a66f4f" },
              { title: "Focus", sub: "Entra en tu zona.", cover: "forest", color: "#426452" },
              {
                title: "Indie",
                sub: "Fuera de lo de siempre.",
                cover: "flowers",
                color: "#916681",
              },
            ].map((item) => (
              <button
                className="mood-card"
                style={{ background: item.color }}
                key={item.title}
                onClick={() => setMood(item.title)}
              >
                <span>{item.title}</span>
                <small>{item.sub}</small>
                <img src={img(item.cover)} alt="" />
                <ArrowUpRight size={24} />
              </button>
            ))}
          </div>
          <h2 className="search-section-title">Abre los oídos</h2>
          <div className="playlist-grid">{playlists.map(renderPlaylist)}</div>
        </>
      )}
    </div>
  );
}
