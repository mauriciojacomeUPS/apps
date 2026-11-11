import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  Search,
  Library,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  ListMusic,
  MonitorSpeaker,
  Heart,
  Check,
  X,
  MoreHorizontal,
  Clock3,
  Music2,
  Headphones,
  Disc3,
  CheckCircle2,
  CircleHelp,
  Maximize2,
  HardDrive,
  LogOut,
  ListPlus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { tracks as demoTracks, playlists, img, formatTime } from "./data";
import AccountGate, { useAuth } from "./AccountGate";
import MyMusic from "./MyMusic";
import { deviceLibrary } from "./device-library";
import QueuePanel from "./QueuePanel";
import {
  makeQueue,
  activeQueueIndex,
  moveUpcoming,
  clearUpcoming,
  shuffleUpcoming,
} from "./player-queue";
import "./styles.css";

const readSaved = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const Wave = ({ small = false }) => (
  <svg className={small ? "wave small" : "wave"} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path
      d="M5 22C8 8 12 8 15 22s7 14 10-2S30 7 31 14"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
  </svg>
);
function IconButton({ title, children, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`} aria-label={title} title={title} {...props}>
      {children}
    </button>
  );
}
function Cover({ playlist, className = "", onClick }) {
  return (
    <div className={`cover-art ${playlist.id} ${className}`} onClick={onClick}>
      <img src={img(playlist.cover)} alt="" />
      <div className="art-shade" />
      <span className="art-brand">
        <Wave small /> ONDA
      </span>
      <span className="art-title">{playlist.art || playlist.title}</span>
      <span className="art-footer">
        {playlist.tag || "TU SELECCIÓN"}
        <span>↗</span>
      </span>
    </div>
  );
}

function TrackRows({
  list,
  compact = false,
  current,
  playing,
  duration,
  liked,
  playTrack,
  toggleLike,
  setModal,
  playlistId,
  onReorder,
}) {
  return (
    <div
      className={`track-table ${compact ? "compact" : ""} ${onReorder ? "editable-playlist" : ""}`}
    >
      <div className="track-heading">
        <span>#</span>
        <span>TÍTULO</span>
        <span className="album-col">ÁLBUM</span>
        {onReorder && <span aria-label="Orden de canciones" />}
        <span />
        <Clock3 size={15} />
      </div>
      {list.map((track, i) => (
        <div
          className={`track-row ${current.id === track.id && playing ? "track-active" : ""}`}
          key={track.id}
          onDoubleClick={() => playTrack(track, list)}
        >
          <button
            className="track-number"
            aria-label={`Reproducir ${track.title}`}
            onClick={() => playTrack(track, list)}
          >
            {current.id === track.id && playing ? (
              <span className="equalizer">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <Play size={14} fill="currentColor" />
              </>
            )}
          </button>
          <button className="track-info" onClick={() => playTrack(track, list)}>
            <img src={img(track.cover)} alt="" />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </button>
          <span className="album-col">{track.album}</span>
          {onReorder && (
            <div className="track-order-controls">
              <IconButton
                title={`Subir ${track.title} en la playlist`}
                disabled={i === 0}
                onClick={() => onReorder(track.id, -1)}
              >
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                title={`Bajar ${track.title} en la playlist`}
                disabled={i === list.length - 1}
                onClick={() => onReorder(track.id, 1)}
              >
                <ArrowDown size={15} />
              </IconButton>
            </div>
          )}
          <IconButton
            title={
              liked.includes(track.id)
                ? `Quitar ${track.title} de me gusta`
                : `Me gusta ${track.title}`
            }
            className={liked.includes(track.id) ? "is-liked" : ""}
            onClick={() => toggleLike(track.id)}
          >
            <Heart size={16} fill={liked.includes(track.id) ? "currentColor" : "none"} />
          </IconButton>
          <span className="track-time">
            {formatTime(track.duration)}
            <IconButton
              title={`Opciones de ${track.title}`}
              onClick={() => setModal({ type: "add", track, playlistId })}
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </span>
        </div>
      ))}
    </div>
  );
}
function PlaylistCard({ p, openPlaylist, playPlaylist }) {
  return (
    <article className="playlist-card">
      <button className="card-link" aria-label={`Abrir ${p.title}`} onClick={() => openPlaylist(p)}>
        <Cover playlist={p} />
        <strong>{p.title}</strong>
        <p>{p.subtitle}</p>
      </button>
      <button
        className="card-play round-play"
        aria-label={`Reproducir ${p.title}`}
        onClick={() => playPlaylist(p)}
      >
        <Play size={19} fill="currentColor" />
      </button>
    </article>
  );
}
function SectionHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-action" onClick={onAction}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}

function App() {
  const { user, signIn, logout } = useAuth();
  const device = useMemo(() => deviceLibrary(user?.id || "guest"), [user?.id]);
  const [localTracks, setLocalTracks] = useState([]);
  const tracks = useMemo(() => [...demoTracks, ...localTracks], [localTracks]);
  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const libraryKey = (key) => key + ":" + (user?.id || "guest");
  const readMySaved = (key, fallback) =>
    readSaved(libraryKey(key), user ? fallback : readSaved(key, fallback));
  const playRequest = useRef(0);
  const initialQueue = useMemo(() => makeQueue(demoTracks), []);

  const [view, setView] = useState("home");
  const [selectedRecord, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todo");
  const [current, setCurrent] = useState(initialQueue[0]);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState(initialQueue);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(45.740408);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [liked, setLiked] = useState(() => readMySaved("onda-liked", []));
  const [saved, setSaved] = useState(() => readMySaved("onda-saved", ["summer", "focus", "night"]));
  const [custom, setCustom] = useState(() => readMySaved("onda-playlists", []));
  const [modal, setModal] = useState(null);
  const [playlistName, setPlaylistName] = useState("");
  const [toast, setToast] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const [menu, setMenu] = useState(null);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [librarySearch, setLibrarySearch] = useState(false);
  const [activeMood, setActiveMood] = useState("");
  const audio = useRef(null);
  const searchInput = useRef(null);
  const toastTimer = useRef(null);
  const historyIndex = useRef(0);
  const historyTotal = useRef(0);
  const [, setHistoryVersion] = useState(0);
  const allPlaylists = [...playlists, ...custom];
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };
  const refreshDevice = useCallback(async () => {
    try {
      const list = await device.list();
      setLocalTracks(list);
      setCurrent((previous) => {
        const updated = list.find((t) => t.id === previous.id);
        return updated ? { ...previous, ...updated } : previous;
      });
      setQueue((previous) =>
        previous.map((track) => {
          const updated = list.find((t) => t.id === track.id);
          return updated ? { ...track, ...updated } : track;
        }),
      );
    } catch (error) {
      notify(error.message);
    }
  }, [device]);
  useEffect(() => {
    let active = true;
    const player = audio.current;
    device
      .list()
      .then((list) => {
        if (active) setLocalTracks(list);
      })
      .catch((error) => {
        if (active) notify(error.message);
      });
    return () => {
      active = false;
      ++playRequest.current;
      player.pause();
      player.removeAttribute("src");
      player.load();
      device.dispose();
    };
  }, [device]);
  useEffect(() => {
    localStorage.setItem(libraryKey("onda-liked"), JSON.stringify(liked));
  }, [liked]);
  useEffect(() => {
    localStorage.setItem(libraryKey("onda-saved"), JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    localStorage.setItem(libraryKey("onda-playlists"), JSON.stringify(custom));
  }, [custom]);
  useEffect(() => {
    audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (playing)
      audio.current.play().catch((error) => {
        if (error.name === "AbortError") return;
        setPlaying(false);
        if (error.name === "NotAllowedError") notify("Pulsa reproducir para comenzar a escuchar.");
      });
    else audio.current.pause();
  }, [playing, current.id, current.queueId, current.audioUrl]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setModal(null);
        setMenu(null);
        setMobileLibrary(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const navigate = (next, playlistId) => {
    const hash = next === "playlist" ? `#playlist/${playlistId}` : `#${next}`;
    if (window.location.hash !== hash) {
      historyIndex.current += 1;
      historyTotal.current = historyIndex.current;
      window.history.pushState({ ondaIndex: historyIndex.current }, "", hash);
      setHistoryVersion((v) => v + 1);
    }
    setView(next);
    setQuery("");
    setMenu(null);
    setActiveMood("");
    setMobileLibrary(false);
    document.querySelector(".main-scroll")?.scrollTo(0, 0);
  };
  const openPlaylist = (p) => {
    setSelected(p);
    navigate("playlist", p.id);
  };
  const toggleLike = (id) => {
    setLiked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const playTrack = async (track, list = tracks) => {
    const request = ++playRequest.current;
    try {
      const audioUrl = track.source === "local" ? await device.audioUrl(track) : undefined;
      if (request !== playRequest.current) return;
      const existing = track.queueId && list.some((entry) => entry.queueId === track.queueId);
      let nextQueue = existing ? list : makeQueue(list);
      let entry = existing ? track : nextQueue.find((item) => item.id === track.id);
      if (!entry) {
        entry = makeQueue([track])[0];
        nextQueue = [entry, ...nextQueue];
      }
      if (shuffle && !existing) nextQueue = shuffleUpcoming(nextQueue, entry);
      if (entry.queueId !== current.queueId) {
        audio.current.pause();
        audio.current.currentTime = 0;
        setProgress(0);
        setDuration(track.duration);
      }
      setQueue(nextQueue);
      setCurrent({ ...entry, audioUrl });
      setPlaying(true);
    } catch (error) {
      setPlaying(false);
      notify(error.message);
    }
  };
  const togglePlayback = () => {
    if (playing) setPlaying(false);
    else playTrack(current, queue);
  };
  const queueTrack = (track) => {
    const [entry] = makeQueue([track]);
    setQueue((previous) => [...previous, entry]);
    setModal(null);
    notify("Canción añadida a la cola.");
  };
  const removeLocalTrack = (track) => {
    if (current.id === track.id) {
      ++playRequest.current;
      audio.current.pause();
      setPlaying(false);
      setCurrent(initialQueue[0]);
      setProgress(0);
    }
    setQueue((previous) => previous.filter((item) => item.id !== track.id));
    setLiked((previous) => previous.filter((id) => id !== track.id));
    setCustom((previous) =>
      previous.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks.filter((id) => id !== track.id),
      })),
    );
  };
  const getTracks = (p) => (p?.tracks || []).map((id) => tracksById.get(id)).filter(Boolean);
  const playPlaylist = (p) => {
    const list = getTracks(p);
    if (list.length) playTrack(list[0], list);
    else notify("Añade canciones desde el menú de una canción.");
  };
  const step = (direction) => {
    const next = activeQueueIndex(queue, current) + direction;
    if (next < 0) {
      audio.current.currentTime = 0;
      setProgress(0);
      return;
    }
    if (next >= queue.length) {
      setPlaying(false);
      return;
    }
    playTrack(queue[next], queue);
  };
  const toggleShuffle = () => {
    setShuffle(!shuffle);
    if (!shuffle) setQueue((previous) => shuffleUpcoming(previous, current));
  };
  const savePlaylist = (p) => {
    setSaved((s) => (s.includes(p.id) ? s.filter((id) => id !== p.id) : [...s, p.id]));
  };
  const createPlaylist = (e) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    const p = {
      id: `custom-${crypto.randomUUID()}`,
      title: playlistName.trim(),
      subtitle: "Tu selección. Tu propio ritmo.",
      cover: "night",
      color: "#6c678c",
      art: playlistName.trim(),
      tracks: [],
    };
    setCustom([...custom, p]);
    setSaved([...saved, p.id]);
    setPlaylistName("");
    setModal(null);
    openPlaylist(p);
    notify("Playlist creada. Hazla tuya.");
  };
  const addToPlaylist = (playlist, track) => {
    if (playlist.tracks.includes(track.id)) return notify("Esta canción ya está en la playlist.");
    const next = { ...playlist, tracks: [...playlist.tracks, track.id] };
    setCustom(custom.map((p) => (p.id === playlist.id ? next : p)));
    setModal(null);
    notify(`Añadida a ${playlist.title}`);
  };
  const likedPlaylist = {
    id: "liked",
    title: "Tus me gusta",
    subtitle: "Todas las canciones que te hacen sentir algo.",
    cover: "flowers",
    art: "tus me gusta",
    color: "#7564a8",
    tracks: liked,
    tag: "HECHO POR TI",
  };
  const selected =
    selectedRecord?.id === "liked"
      ? likedPlaylist
      : selectedRecord?.id.startsWith("custom-")
        ? custom.find((p) => p.id === selectedRecord.id) || null
        : selectedRecord;
  const selectedTracks = getTracks(selected);
  const editablePlaylist = selected?.id.startsWith("custom-");
  const renamePlaylist = (event) => {
    event.preventDefault();
    const name = modal.name.trim();
    if (!name) return;
    setCustom((previous) =>
      previous.map((p) => (p.id === modal.playlistId ? { ...p, title: name, art: name } : p)),
    );
    setModal(null);
    notify("Nombre de playlist actualizado.");
  };
  const duplicatePlaylist = () => {
    const name = `${selected.title} (copia)`.slice(0, 60);
    const copy = {
      ...selected,
      id: `custom-${crypto.randomUUID()}`,
      title: name,
      art: name,
      tracks: [...selected.tracks],
    };
    setCustom((previous) => [...previous, copy]);
    setSaved((previous) => [...previous, copy.id]);
    openPlaylist(copy);
    notify("Copia guardada en tu biblioteca.");
  };
  const deletePlaylist = () => {
    const id = modal.playlistId;
    setCustom((previous) => previous.filter((p) => p.id !== id));
    setSaved((previous) => previous.filter((item) => item !== id));
    setSelected(null);
    setModal(null);
    navigate("library");
    notify("Playlist eliminada. Tus archivos siguen en el dispositivo.");
  };
  const removePlaylistTrack = () => {
    const { playlistId, track } = modal;
    setCustom((previous) =>
      previous.map((p) =>
        p.id === playlistId ? { ...p, tracks: p.tracks.filter((id) => id !== track.id) } : p,
      ),
    );
    setModal(null);
    notify("Canción quitada de la playlist.");
  };
  const reorderPlaylist = (trackId, direction) => {
    setCustom((previous) =>
      previous.map((p) => {
        if (p.id !== selected.id) return p;
        const index = p.tracks.indexOf(trackId),
          target = index + direction;
        if (index < 0 || target < 0 || target >= p.tracks.length) return p;
        const ids = [...p.tracks];
        [ids[index], ids[target]] = [ids[target], ids[index]];
        return { ...p, tracks: ids };
      }),
    );
  };
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, ondaIndex: 0 }, "");
    const restoreRoute = () => {
      historyIndex.current = window.history.state?.ondaIndex || 0;
      setHistoryVersion((v) => v + 1);
      const route = window.location.hash.slice(1);
      if (route.startsWith("playlist/")) {
        const id = decodeURIComponent(route.slice(9));
        const p =
          id === "liked"
            ? { ...likedPlaylist, tracks: readMySaved("onda-liked", []) }
            : [...playlists, ...readMySaved("onda-playlists", [])].find((p) => p.id === id);
        if (p) {
          setSelected(p);
          setView("playlist");
        } else {
          setView("library");
        }
      } else if (["home", "search", "library", "device"].includes(route)) setView(route);
      else setView("home");
    };
    restoreRoute();
    window.addEventListener("hashchange", restoreRoute);
    return () => window.removeEventListener("hashchange", restoreRoute);
  }, []);
  useEffect(() => {
    const onShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("search");
        requestAnimationFrame(() => searchInput.current?.focus());
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const oldFocus = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const elements = () =>
      [...dialog.querySelectorAll("button, input")].filter((el) => !el.disabled);
    (dialog.querySelector("input") || elements()[0])?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = elements();
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      dialog.removeEventListener("keydown", trap);
      if (oldFocus?.isConnected) oldFocus.focus();
    };
  }, [modal]);
  const searchMatches = tracks.filter((t) =>
    `${t.title} ${t.artist} ${t.album} ${t.mood || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const playlistMatches = allPlaylists.filter((p) =>
    `${p.title} ${p.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );
  const visiblePlaylists =
    filter === "Para ti"
      ? [playlists[2], playlists[0], playlists[3], playlists[5], playlists[4]]
      : [playlists[1], playlists[2], playlists[3], playlists[4], playlists[5]];

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <button className="logo-icon" aria-label="Onda — Inicio" onClick={() => navigate("home")}>
          <Wave />
        </button>
        <nav>
          <IconButton
            title="Inicio"
            className={view === "home" ? "rail-active" : ""}
            onClick={() => navigate("home")}
          >
            <Home size={23} />
          </IconButton>
          <IconButton
            title="Buscar"
            className={view === "search" ? "rail-active" : ""}
            onClick={() => {
              navigate("search");
              searchInput.current?.focus();
            }}
          >
            <Search size={23} />
          </IconButton>
          <IconButton
            title="Tu biblioteca"
            className={view === "library" ? "rail-active" : ""}
            onClick={() => navigate("library")}
          >
            <Library size={23} />
          </IconButton>
          <IconButton
            title="Archivos de este dispositivo"
            className={view === "device" ? "rail-active" : ""}
            onClick={() => navigate("device")}
          >
            <HardDrive size={23} />
          </IconButton>
        </nav>
        <div className="rail-bottom">
          <span className="rail-line" />
          <IconButton title="Acerca de Onda" onClick={() => setModal({ type: "about" })}>
            <Headphones size={22} />
          </IconButton>
          <button
            className="avatar small-avatar"
            aria-label="Mi perfil"
            onClick={() => setMenu(menu === "profile" ? null : "profile")}
          >
            M
          </button>
        </div>
      </aside>

      <aside className={`library-sidebar ${mobileLibrary ? "mobile-open" : ""}`}>
        <button className="wordmark" aria-label="Onda — Inicio" onClick={() => navigate("home")}>
          onda<span>®</span>
        </button>
        <div className="library-title">
          <h2>Tu biblioteca</h2>
          <IconButton title="Crear playlist" onClick={() => setModal({ type: "create" })}>
            <Plus size={19} />
          </IconButton>
          <IconButton
            title="Cerrar biblioteca"
            className="mobile-close"
            onClick={() => setMobileLibrary(false)}
          >
            <X size={20} />
          </IconButton>
        </div>
        <div className="library-chips">
          <button className="chip selected" onClick={() => navigate("library")}>
            Playlists
          </button>
          <button
            className="chip"
            onClick={() => {
              navigate("search");
              setQuery("Onda Studio");
            }}
          >
            Artistas
          </button>
        </div>
        <div className="library-sort">
          <IconButton
            title="Buscar en tu biblioteca"
            onClick={() => setLibrarySearch(!librarySearch)}
          >
            <Search size={16} />
          </IconButton>
          <span>
            Recientes <ListMusic size={14} />
          </span>
        </div>
        {librarySearch && (
          <input
            className="library-search"
            placeholder="Buscar en tu biblioteca"
            aria-label="Buscar en tu biblioteca"
            value={libraryFilter}
            onChange={(e) => setLibraryFilter(e.target.value)}
            autoFocus
          />
        )}
        <div className="library-items">
          <button
            className={`library-item ${selected?.id === "liked" && view === "playlist" ? "selected-library" : ""}`}
            onClick={() => openPlaylist(likedPlaylist)}
          >
            <div className="liked-cover">
              <Heart size={23} fill="white" />
            </div>
            <span>
              <strong>Tus me gusta</strong>
              <small>
                <span className="pin">◆</span> Playlist · {liked.length} canciones
              </small>
            </span>
          </button>
          {allPlaylists
            .filter(
              (p) =>
                saved.includes(p.id) && p.title.toLowerCase().includes(libraryFilter.toLowerCase()),
            )
            .map((p) => (
              <button
                className={`library-item ${selected?.id === p.id && view === "playlist" ? "selected-library" : ""}`}
                key={p.id}
                onClick={() => openPlaylist(p)}
              >
                <img src={img(p.cover)} alt="" />
                <span>
                  <strong>{p.title}</strong>
                  <small>Playlist · {p.id.startsWith("custom") ? "Tú" : "Onda"}</small>
                </span>
                {current.id === p.tracks[0] && playing && (
                  <span className="library-playing">
                    <Volume2 size={15} />
                  </span>
                )}
              </button>
            ))}
        </div>
        <button className="local-sidebar-button" onClick={() => navigate("device")}>
          <HardDrive size={18} />
          <span>En este dispositivo</span>
          <small>{localTracks.length}</small>
        </button>
        {!user && (
          <p className="local-guest-note">
            Escuchando sin cuenta. <button onClick={signIn}>Iniciar sesión</button>
          </p>
        )}
        <div className="library-invite">
          <div className="invite-symbol">
            <Disc3 size={22} />
            <span>+</span>
          </div>
          <h3>Una playlist muy tú.</h3>
          <p>
            Reúne esas canciones que
            <br />
            siempre quieres volver a escuchar.
          </p>
          <button onClick={() => setModal({ type: "create" })}>
            Crear playlist <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="online-dot" /> Todo listo para escuchar
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="history-controls">
            <IconButton
              title="Volver"
              disabled={historyIndex.current <= 0}
              onClick={() => window.history.back()}
            >
              <ArrowLeft size={19} />
            </IconButton>
            <IconButton
              title="Avanzar"
              disabled={historyIndex.current >= historyTotal.current}
              onClick={() => window.history.forward()}
            >
              <ArrowRight size={19} />
            </IconButton>
          </div>
          <div className="mobile-brand">
            <Wave />
            onda
          </div>
          <div className={`global-search ${view === "search" ? "search-focused" : ""}`}>
            <Search size={19} />
            <input
              ref={searchInput}
              placeholder="¿Qué quieres escuchar?"
              aria-label="Buscar canciones, artistas o playlists"
              value={query}
              onFocus={() => {
                if (view !== "search") navigate("search");
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveMood("");
              }}
            />
            {query ? (
              <IconButton
                title="Limpiar búsqueda"
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <X size={16} />
              </IconButton>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </div>
          <div className="topbar-right">
            <span className="little-note">La vida suena mejor.</span>
            <div className="menu-anchor">
              <IconButton
                title="Novedades"
                className={menu === "notifications" ? "is-highlighted" : ""}
                onClick={() => setMenu(menu === "notifications" ? null : "notifications")}
              >
                <Bell size={19} />
                <span className="notification-dot" />
              </IconButton>
              {menu === "notifications" && (
                <div className="dropdown notifications">
                  <h3>Algo nuevo para tus oídos</h3>
                  <p>
                    <span className="online-dot" /> Late Summer ya está aquí
                  </p>
                  <small>Tu próximo atardecer tiene banda sonora.</small>
                  <button
                    onClick={() => {
                      setMenu(null);
                      openPlaylist(playlists[0]);
                    }}
                  >
                    Descubrir playlist <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="menu-anchor">
              <button
                className="profile-button"
                onClick={() => setMenu(menu === "profile" ? null : "profile")}
                aria-label="Abrir perfil"
              >
                <span className="avatar">M</span>
                <ChevronDown size={14} />
              </button>
              {menu === "profile" && (
                <div className="dropdown profile-menu">
                  <strong className="profile-email">{user?.email || "Tu espacio local"}</strong>
                  <span>{user ? "Tu cuenta de Onda" : "Escuchando sin cuenta"}</span>
                  {user ? (
                    <button
                      onClick={() => {
                        setMenu(null);
                        logout();
                      }}
                    >
                      <LogOut size={16} />
                      Cerrar sesión
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setMenu(null);
                        signIn();
                      }}
                    >
                      <Headphones size={16} />
                      Iniciar sesión o registrarte
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenu(null);
                      navigate("library");
                    }}
                  >
                    <Library size={16} /> Mi biblioteca
                  </button>
                  <button
                    onClick={() => {
                      setMenu(null);
                      setModal({ type: "about" });
                    }}
                  >
                    <CircleHelp size={16} /> Acerca de Onda
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="main-scroll"
          id="main-content"
          onClick={() => {
            if (menu) setMenu(null);
          }}
        >
          {view === "home" && (
            <div className="home-page page-content">
              <div className="page-topline">
                <div className="filter-chips">
                  {["Todo", "Música", "Para ti"].map((f) => (
                    <button
                      className={`chip ${filter === f ? "selected" : ""}`}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className="date-note">
                  TU DOSIS DIARIA DE BUENA MÚSICA <span>✳</span>
                </span>
              </div>
              <div className="welcome-line">
                <div>
                  <span className="eyebrow">QUÉ BUENO TENERTE AQUÍ</span>
                  <h1>
                    Encuentra tu onda<span>.</span>
                  </h1>
                </div>
                <p>Un sonido para cada versión de ti.</p>
              </div>
              <section className="hero">
                <img
                  className="hero-photo"
                  src={img("coast")}
                  alt="Atardecer dorado junto al mar"
                />
                <div className="hero-overlay" />
                <div className="hero-content">
                  <span className="hero-kicker">
                    <span className="hero-dot" /> LA SELECCIÓN DE HOY
                  </span>
                  <h2>
                    El mundo puede
                    <br />
                    esperar un rato.
                  </h2>
                  <p>
                    Deja que el día baje el ritmo.
                    <br />
                    Nosotros ponemos la música.
                  </p>
                  <div className="hero-actions">
                    <button className="primary-button" onClick={() => playPlaylist(playlists[0])}>
                      <Play size={17} fill="currentColor" /> Dale play a tu tarde
                    </button>
                    <button className="hero-discover" onClick={() => openPlaylist(playlists[0])}>
                      Explorar playlist <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="hero-credit">
                    <span className="tiny-logo">
                      <Wave small />
                    </span>{" "}
                    Curada por Onda <span>·</span> 4 canciones para desconectar
                  </div>
                </div>
                <button
                  className="hero-album"
                  onClick={() => openPlaylist(playlists[0])}
                  aria-label="Abrir Late Summer"
                >
                  <Cover playlist={playlists[0]} />
                  <span className="hero-album-caption">
                    <span>LA BANDA SONORA DE TU TARDE</span>
                    <ArrowUpRight size={15} />
                  </span>
                </button>
                <span className="hero-edition">VOL. 001 — GOOD DAYS AHEAD</span>
              </section>
              <section className="recent-section">
                <div className="small-section-title">
                  <h2>Vuelve a tu lugar feliz</h2>
                  <span>
                    EN ROTACIÓN <span className="online-dot" />
                  </span>
                </div>
                <div className="quick-grid">
                  {[playlists[0], playlists[4], likedPlaylist, playlists[2]].map((p) => (
                    <div className="quick-item" key={p.id}>
                      <button onClick={() => openPlaylist(p)}>
                        {p.id === "liked" ? (
                          <div className="liked-cover">
                            <Heart size={22} fill="white" />
                          </div>
                        ) : (
                          <img src={img(p.cover)} alt="" />
                        )}
                        <span>{p.title}</span>
                      </button>
                      <IconButton title={`Reproducir ${p.title}`} onClick={() => playPlaylist(p)}>
                        <Play size={16} fill="currentColor" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </section>
              <section className="discovery-section">
                <SectionHeading
                  eyebrow={
                    filter === "Para ti" ? "SE SIENTE COMO TÚ" : "ENCUENTRA TU PRÓXIMO FAVORITO"
                  }
                  title={filter === "Para ti" ? "En tu misma frecuencia" : "Hecho para tu momento"}
                  action="Explorar todo"
                  onAction={() => navigate("search")}
                />
                <div className="playlist-grid">
                  {visiblePlaylists.map((p) => (
                    <PlaylistCard
                      openPlaylist={openPlaylist}
                      playPlaylist={playPlaylist}
                      key={p.id}
                      p={p}
                    />
                  ))}
                </div>
              </section>
              <section className="trending-section">
                <SectionHeading
                  eyebrow="DALE UNA OPORTUNIDAD"
                  title="En nuestra frecuencia"
                  action="Ver canciones"
                  onAction={() => {
                    navigate("search");
                    setQuery("Onda Studio");
                  }}
                />
                <TrackRows
                  current={current}
                  playing={playing}
                  duration={duration}
                  liked={liked}
                  playTrack={playTrack}
                  toggleLike={toggleLike}
                  setModal={setModal}
                  list={tracks.slice(0, 4)}
                  compact
                />
              </section>
              <footer className="main-footer">
                <span>
                  <Wave small /> Hecho para sentir.
                </span>
                <p>Sin prisa. Sin ruido. Solo buena música.</p>
                <small>© 2026 Onda</small>
              </footer>
            </div>
          )}

          {view === "device" && (
            <MyMusic
              tracks={localTracks}
              library={device}
              onRefresh={refreshDevice}
              onPlay={(track, list) => {
                if (current.id === track.id && playing) setPlaying(false);
                else playTrack(track, list);
              }}
              onLike={toggleLike}
              liked={liked}
              current={current}
              playing={playing}
              notify={notify}
              onRemove={removeLocalTrack}
              onOptions={(track) => setModal({ type: "add", track })}
            />
          )}
          {view === "search" && (
            <div className="page-content search-page">
              <span className="eyebrow">DEJA QUE LA CURIOSIDAD SUENE</span>
              <h1>
                {query
                  ? `Resultados para “${query}”`
                  : activeMood || "Tu próxima obsesión está aquí."}
              </h1>
              {query ? (
                <>
                  {searchMatches.length > 0 && (
                    <section>
                      <SectionHeading title="Canciones" />
                      <TrackRows
                        current={current}
                        playing={playing}
                        duration={duration}
                        liked={liked}
                        playTrack={playTrack}
                        toggleLike={toggleLike}
                        setModal={setModal}
                        list={searchMatches}
                      />
                    </section>
                  )}
                  {playlistMatches.length > 0 && (
                    <section>
                      <SectionHeading title="Playlists" />
                      <div className="playlist-grid">
                        {playlistMatches.map((p) => (
                          <PlaylistCard
                            openPlaylist={openPlaylist}
                            playPlaylist={playPlaylist}
                            key={p.id}
                            p={p}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {!searchMatches.length && !playlistMatches.length && (
                    <div className="empty-state">
                      <Search size={40} />
                      <h2>No encontramos esa onda</h2>
                      <p>Prueba con otro título, Onda Studio o un estado de ánimo.</p>
                      <button className="secondary-button" onClick={() => setQuery("")}>
                        Explorar música
                      </button>
                    </div>
                  )}
                </>
              ) : activeMood ? (
                <>
                  <p className="page-description">Encuentra el sonido de este momento.</p>
                  <TrackRows
                    current={current}
                    playing={playing}
                    duration={duration}
                    liked={liked}
                    playTrack={playTrack}
                    toggleLike={toggleLike}
                    setModal={setModal}
                    list={tracks.filter((t) => t.mood === activeMood)}
                  />
                  <button
                    className="secondary-button back-categories"
                    onClick={() => setActiveMood("")}
                  >
                    Volver a explorar
                  </button>
                </>
              ) : (
                <>
                  <p className="page-description">
                    Sigue tu estado de ánimo. Nosotros seguimos el ritmo.
                  </p>
                  <div className="mood-grid">
                    {[
                      {
                        title: "Chill",
                        sub: "Un respiro, por favor.",
                        cover: "desert",
                        color: "#a66f4f",
                      },
                      {
                        title: "Focus",
                        sub: "Entra en tu zona.",
                        cover: "forest",
                        color: "#426452",
                      },
                      {
                        title: "Indie",
                        sub: "Fuera de lo de siempre.",
                        cover: "flowers",
                        color: "#916681",
                      },
                    ].map((m) => (
                      <button
                        className="mood-card"
                        style={{ background: m.color }}
                        key={m.title}
                        onClick={() => setActiveMood(m.title)}
                      >
                        <span>{m.title}</span>
                        <small>{m.sub}</small>
                        <img src={img(m.cover)} alt="" />
                        <ArrowUpRight size={24} />
                      </button>
                    ))}
                  </div>
                  <SectionHeading eyebrow="UN BUEN LUGAR PARA EMPEZAR" title="Abre los oídos" />
                  <div className="playlist-grid">
                    {playlists.map((p) => (
                      <PlaylistCard
                        openPlaylist={openPlaylist}
                        playPlaylist={playPlaylist}
                        key={p.id}
                        p={p}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {view === "library" && (
            <div className="page-content library-page">
              <span className="eyebrow">LO QUE TE HACE VOLVER</span>
              <div className="library-page-heading">
                <h1>
                  Tu biblioteca<span>.</span>
                </h1>
                <button className="primary-button" onClick={() => setModal({ type: "create" })}>
                  <Plus size={18} /> Crear playlist
                </button>
              </div>
              <p className="page-description">
                Tus canciones, tus descubrimientos, tu pequeño universo.
              </p>
              <div className="playlist-grid library-grid">
                <PlaylistCard
                  openPlaylist={openPlaylist}
                  playPlaylist={playPlaylist}
                  p={likedPlaylist}
                />
                {allPlaylists
                  .filter((p) => saved.includes(p.id))
                  .map((p) => (
                    <PlaylistCard
                      openPlaylist={openPlaylist}
                      playPlaylist={playPlaylist}
                      key={p.id}
                      p={p}
                    />
                  ))}
              </div>
            </div>
          )}

          {view === "playlist" && selected && (
            <div className="playlist-page">
              <section className="playlist-hero" style={{ "--playlist-color": selected.color }}>
                <Cover playlist={selected} />
                <div>
                  <span className="eyebrow">
                    {selected.id === "liked" ? "TU COLECCIÓN" : "PLAYLIST"}
                  </span>
                  <h1>{selected.title}</h1>
                  <p>{selected.subtitle}</p>
                  <div className="playlist-meta">
                    <Wave small />
                    <strong>
                      {selected.id.startsWith("custom") || selected.id === "liked" ? "Tú" : "Onda"}
                    </strong>
                    <span>·</span>
                    <span>{selectedTracks.length} canciones</span>
                    <span>·</span>
                    <span className="playlist-summary-time">
                      {formatTime(selectedTracks.reduce((sum, track) => sum + track.duration, 0))}{" "}
                      de música
                    </span>
                  </div>
                </div>
              </section>
              <div className="playlist-content">
                <div className="playlist-toolbar">
                  <button
                    className="round-play large"
                    aria-label={`Reproducir ${selected.title}`}
                    onClick={() => playPlaylist(selected.id === "liked" ? likedPlaylist : selected)}
                  >
                    <Play size={25} fill="currentColor" />
                  </button>
                  {selected.id !== "liked" && (
                    <IconButton
                      title={
                        saved.includes(selected.id)
                          ? "Quitar de la biblioteca"
                          : "Guardar en tu biblioteca"
                      }
                      className={saved.includes(selected.id) ? "is-liked" : ""}
                      onClick={() => savePlaylist(selected)}
                    >
                      {saved.includes(selected.id) ? (
                        <CheckCircle2 size={28} />
                      ) : (
                        <Plus size={28} />
                      )}
                    </IconButton>
                  )}
                  <IconButton
                    title="Compartir playlist"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(
                          new URL(
                            `${import.meta.env.BASE_URL}#playlist/${selected.id}`,
                            window.location.origin,
                          ).href,
                        )
                        .then(() => notify("Enlace de playlist copiado."))
                        .catch(() => notify("No se pudo copiar el enlace en este navegador."));
                    }}
                  >
                    <ArrowUpRight size={24} />
                  </IconButton>
                  <div className="playlist-actions" onClick={(event) => event.stopPropagation()}>
                    <IconButton
                      title="Opciones de playlist"
                      onClick={() => setMenu(menu === "playlist" ? null : "playlist")}
                    >
                      <MoreHorizontal size={25} />
                    </IconButton>
                    {menu === "playlist" && (
                      <div className="dropdown playlist-menu">
                        {editablePlaylist && (
                          <button
                            onClick={() => {
                              setMenu(null);
                              setModal({
                                type: "rename-playlist",
                                playlistId: selected.id,
                                name: selected.title,
                              });
                            }}
                          >
                            <Pencil size={15} />
                            Renombrar playlist
                          </button>
                        )}
                        <button onClick={duplicatePlaylist}>
                          <Copy size={15} />
                          Crear una copia
                        </button>
                        {editablePlaylist && (
                          <button
                            className="danger-action"
                            onClick={() => {
                              setMenu(null);
                              setModal({
                                type: "delete-playlist",
                                playlistId: selected.id,
                                name: selected.title,
                              });
                            }}
                          >
                            <Trash2 size={15} />
                            Eliminar playlist
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="playlist-list-label">
                    Lista <ListMusic size={17} />
                  </span>
                </div>
                {selectedTracks.length ? (
                  <TrackRows
                    current={current}
                    playing={playing}
                    duration={duration}
                    liked={liked}
                    playTrack={playTrack}
                    toggleLike={toggleLike}
                    setModal={setModal}
                    list={selectedTracks}
                    playlistId={selected.id}
                    onReorder={editablePlaylist ? reorderPlaylist : undefined}
                  />
                ) : (
                  <div className="empty-state">
                    <Music2 size={42} />
                    <h2>
                      {selected.id === "liked"
                        ? "Aquí empieza tu colección"
                        : "Un lienzo en blanco. Dale ritmo."}
                    </h2>
                    <p>
                      {selected.id === "liked"
                        ? "Pulsa el corazón de una canción para encontrarla aquí."
                        : "Añade canciones con el botón de opciones de cada canción."}
                    </p>
                    <button className="primary-button" onClick={() => navigate("search")}>
                      Descubrir canciones <ArrowUpRight size={17} />
                    </button>
                  </div>
                )}
                {selected.id.startsWith("custom") && (
                  <section className="recommendations">
                    <SectionHeading title="Encuentra tu primera canción" />
                    <TrackRows
                      current={current}
                      playing={playing}
                      duration={duration}
                      liked={liked}
                      playTrack={playTrack}
                      toggleLike={toggleLike}
                      setModal={setModal}
                      list={tracks.filter((t) => !selected.tracks.includes(t.id))}
                    />
                  </section>
                )}
                <div className="playlist-note">
                  <Disc3 size={17} /> Una selección para escuchar a tu manera.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showQueue && (
        <QueuePanel
          queue={queue}
          current={current}
          playing={playing}
          onClose={() => setShowQueue(false)}
          onPlay={playTrack}
          onMove={(id, direction) =>
            setQueue((previous) => moveUpcoming(previous, current, id, direction))
          }
          onRemove={(id) =>
            setQueue((previous) => previous.filter((entry) => entry.queueId !== id))
          }
          onClear={() => setModal({ type: "clear-queue" })}
        />
      )}

      <footer className="player">
        <div className="now-playing">
          <button
            className="now-cover"
            aria-label="Ver canción actual"
            onClick={() => setShowQueue(!showQueue)}
          >
            <img src={img(current.cover)} alt={`Portada de ${current.album}`} />
            <Maximize2 size={18} />
          </button>
          <div>
            <strong>{current.title}</strong>
            <span>{current.artist}</span>
          </div>
          <IconButton
            title={liked.includes(current.id) ? "Quitar de me gusta" : "Guardar en me gusta"}
            className={liked.includes(current.id) ? "is-liked" : ""}
            onClick={() => toggleLike(current.id)}
          >
            <Heart size={18} fill={liked.includes(current.id) ? "currentColor" : "none"} />
          </IconButton>
        </div>
        <div className="playback">
          <div className="playback-controls">
            <IconButton
              title="Aleatorio"
              className={shuffle ? "control-active" : ""}
              aria-pressed={shuffle}
              onClick={toggleShuffle}
            >
              <Shuffle size={17} />
            </IconButton>
            <IconButton
              title="Canción anterior"
              onClick={() => {
                if (progress > 3) {
                  audio.current.currentTime = 0;
                  setProgress(0);
                } else step(-1);
              }}
            >
              <SkipBack size={18} fill="currentColor" />
            </IconButton>
            <button
              className="main-play"
              aria-label={playing ? "Pausar" : "Reproducir"}
              onClick={togglePlayback}
            >
              {playing ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <IconButton
              title="Siguiente canción"
              disabled={activeQueueIndex(queue, current) + 1 >= queue.length}
              onClick={() => step(1)}
            >
              <SkipForward size={18} fill="currentColor" />
            </IconButton>
            <IconButton
              title="Repetir canción"
              className={repeat ? "control-active" : ""}
              aria-pressed={repeat}
              onClick={() => setRepeat(!repeat)}
            >
              <Repeat size={17} />
            </IconButton>
          </div>
          <div className="timeline">
            <span>{formatTime(progress)}</span>
            <input
              type="range"
              min="0"
              max={duration || 44}
              step="0.1"
              value={progress}
              aria-label="Posición de reproducción"
              style={{ "--range-progress": `${(progress / (duration || 44)) * 100}%` }}
              onChange={(e) => {
                audio.current.currentTime = Number(e.target.value);
                setProgress(Number(e.target.value));
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <div className="player-tools">
          <IconButton
            title="Cola de reproducción"
            className={showQueue ? "control-active" : ""}
            onClick={() => setShowQueue(!showQueue)}
          >
            <ListMusic size={19} />
          </IconButton>
          <IconButton
            title="Dispositivos disponibles"
            onClick={() => setModal({ type: "devices" })}
          >
            <MonitorSpeaker size={18} />
          </IconButton>
          <IconButton
            title={volume ? "Silenciar" : "Activar sonido"}
            onClick={() => setVolume(volume ? 0 : 0.7)}
          >
            {volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </IconButton>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            aria-label="Volumen"
            style={{ "--range-progress": `${volume * 100}%` }}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <IconButton
            title="Ampliar reproductor"
            className="expand-player"
            onClick={() => setShowQueue(!showQueue)}
          >
            <Maximize2 size={16} />
          </IconButton>
        </div>
      </footer>
      <nav className="mobile-nav">
        <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}>
          <Home size={21} />
          Inicio
        </button>
        <button
          className={view === "search" ? "active" : ""}
          onClick={() => {
            navigate("search");
            searchInput.current?.focus();
          }}
        >
          <Search size={21} />
          Buscar
        </button>
        <button className={view === "library" ? "active" : ""} onClick={() => navigate("library")}>
          <Library size={21} />
          Biblioteca
        </button>
        <button className={view === "device" ? "active" : ""} onClick={() => navigate("device")}>
          <HardDrive size={21} />
          Mi música
        </button>
      </nav>
      <audio
        ref={audio}
        src={current.audioUrl || `${import.meta.env.BASE_URL}audio/${current.audio}.mp3`}
        preload="metadata"
        onTimeUpdate={() => setProgress(audio.current.currentTime)}
        onLoadedMetadata={() => {
          setDuration(audio.current.duration);
          setProgress(0);
        }}
        onEnded={() => {
          if (repeat) {
            audio.current.currentTime = 0;
            audio.current.play().catch(() => setPlaying(false));
          } else step(1);
        }}
        onError={(event) => {
          setPlaying(false);
          const error = event.currentTarget.error;
          notify(
            current.source === "local" && error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
              ? "Tu navegador no puede reproducir el formato o códec de este archivo."
              : "No se pudo cargar el audio. Inténtalo de nuevo.",
          );
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <IconButton title="Cerrar" className="modal-close" onClick={() => setModal(null)}>
              <X size={21} />
            </IconButton>
            {modal.type === "create" && (
              <>
                <div className="modal-art">
                  <Disc3 size={42} />
                  <span>MAKE IT YOURS.</span>
                </div>
                <span className="eyebrow">TU MÚSICA, TUS REGLAS</span>
                <h2 id="modal-title">Cada playlist tiene una historia.</h2>
                <p>La tuya empieza con un nombre.</p>
                <form onSubmit={createPlaylist}>
                  <label htmlFor="playlist-name">Nombre de tu playlist</label>
                  <input
                    id="playlist-name"
                    value={playlistName}
                    maxLength={60}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="Mis pequeños grandes momentos"
                    autoFocus
                    required
                  />
                  <button className="primary-button" type="submit">
                    Crear playlist <Plus size={18} />
                  </button>
                </form>
              </>
            )}
            {modal.type === "add" && (
              <>
                <span className="eyebrow">HAZLE UN LUGAR</span>
                <h2 id="modal-title">Opciones de canción</h2>
                <p>
                  {modal.track.title} · {modal.track.artist}
                </p>
                <div className="track-extra-actions">
                  <button className="secondary-button" onClick={() => queueTrack(modal.track)}>
                    <ListPlus size={17} />
                    Añadir a la cola
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      toggleLike(modal.track.id);
                      setModal(null);
                    }}
                  >
                    {liked.includes(modal.track.id) ? "Quitar de me gusta" : "Guardar en me gusta"}
                  </button>
                  {modal.playlistId?.startsWith("custom-") && (
                    <button
                      className="secondary-button danger-action"
                      onClick={removePlaylistTrack}
                    >
                      <X size={17} />
                      Quitar de esta playlist
                    </button>
                  )}
                </div>
                {custom.length ? (
                  custom.map((p) => (
                    <button
                      className="add-playlist-option"
                      key={p.id}
                      onClick={() => addToPlaylist(p, modal.track)}
                    >
                      <ListMusic size={21} />
                      <span>{p.title}</span>
                      {p.tracks.includes(modal.track.id) ? <Check size={18} /> : <Plus size={18} />}
                    </button>
                  ))
                ) : (
                  <p className="empty-hint">Crea tu primera playlist para guardar esta canción.</p>
                )}
                <button className="secondary-button" onClick={() => setModal({ type: "create" })}>
                  <Plus size={17} /> Nueva playlist
                </button>
              </>
            )}
            {modal.type === "rename-playlist" && (
              <>
                <span className="eyebrow">DALE TU PROPIO NOMBRE</span>
                <h2 id="modal-title">Renombrar playlist</h2>
                <form onSubmit={renamePlaylist}>
                  <label htmlFor="rename-playlist">Nombre de la playlist</label>
                  <input
                    id="rename-playlist"
                    value={modal.name}
                    maxLength={60}
                    required
                    onChange={(event) => setModal({ ...modal, name: event.target.value })}
                  />
                  <button className="primary-button" type="submit">
                    Guardar nombre
                  </button>
                </form>
              </>
            )}
            {modal.type === "delete-playlist" && (
              <>
                <span className="eyebrow">TU BIBLIOTECA</span>
                <h2 id="modal-title">¿Eliminar esta playlist?</h2>
                <p className="modal-playlist-copy">
                  «{modal.name}» desaparecerá de tu biblioteca. Tus canciones y archivos locales se
                  conservan.
                </p>
                <div className="playlist-confirm-actions">
                  <button className="secondary-button" onClick={() => setModal(null)}>
                    Conservar playlist
                  </button>
                  <button className="primary-button" onClick={deletePlaylist}>
                    Eliminar playlist
                  </button>
                </div>
              </>
            )}
            {modal.type === "clear-queue" && (
              <>
                <span className="eyebrow">UN NUEVO ORDEN</span>
                <h2 id="modal-title">¿Vaciar la cola?</h2>
                <p className="modal-playlist-copy">
                  Se quitarán las canciones pendientes. La canción actual seguirá sonando.
                </p>
                <div className="playlist-confirm-actions">
                  <button className="secondary-button" onClick={() => setModal(null)}>
                    Conservar cola
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setQueue((previous) => clearUpcoming(previous, current));
                      setModal(null);
                      notify("Cola vaciada. La canción actual se conserva.");
                    }}
                  >
                    Vaciar cola
                  </button>
                </div>
              </>
            )}
            {modal.type === "devices" && (
              <>
                <div className="device-illustration">
                  <MonitorSpeaker size={63} />
                </div>
                <h2 id="modal-title">La música está contigo.</h2>
                <p>Estás escuchando desde este navegador.</p>
                <div className="device-option">
                  <MonitorSpeaker size={24} />
                  <span>
                    <strong>Este dispositivo</strong>
                    <small>
                      <span className="online-dot" /> Conectado a Onda
                    </small>
                  </span>
                  <CheckCircle2 size={21} />
                </div>
                <p className="modal-footnote">
                  El audio se reproduce localmente. No se necesita conectar una cuenta.
                </p>
              </>
            )}
            {modal.type === "about" && (
              <>
                <div className="about-logo">
                  <Wave />
                  onda
                </div>
                <h2 id="modal-title">Tu música, tu momento.</h2>
                <p>Un pequeño espacio para descubrir, guardar y escuchar a tu ritmo.</p>
                <div className="about-detail">
                  <span>EDICIÓN</span>
                  <strong>Onda · Volumen 001</strong>
                </div>
                <div className="about-detail">
                  <span>LA MÚSICA</span>
                  <strong>Instrumentales originales de muestra</strong>
                </div>
                <p className="modal-footnote">
                  Demo independiente inspirada en las experiencias de streaming. No afiliada a
                  Spotify. Las playlists y los me gusta se guardan en este navegador.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <AccountGate>
    <App />
  </AccountGate>,
);
