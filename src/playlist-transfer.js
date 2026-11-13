import { importSpotifyCsv } from "./spotify-playlist.js";
const line = (value) =>
  String(value || "")
    .replace(/[\r\n\0]/g, " ")
    .trim();
const pathOf = (track) =>
  track.relativePath || track.fileName || (track.audio ? `audio/${track.audio}.mp3` : "");
const normalizedPath = (value) =>
  String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .normalize("NFC");
const baseName = (value) => normalizedPath(value).split("/").at(-1);
const safeCover = (value) =>
  typeof value === "string" &&
  value.length < 250000 &&
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : "night";

export function exportPlaylist(playlist, tracks, format = "json") {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const songs = playlist.tracks.map((id) => byId.get(id)).filter(Boolean);
  if (format === "m3u")
    return (
      "#EXTM3U\n#PLAYLIST:" +
      line(playlist.title) +
      "\n" +
      songs
        .map(
          (track) =>
            `#EXTINF:${Math.round(track.duration || 0)},${line(track.artist)} - ${line(track.title)}\n${line(pathOf(track))}`,
        )
        .join("\n") +
      "\n"
    );
  return JSON.stringify(
    {
      format: "onda-playlist",
      version: 1,
      title: playlist.title,
      description: playlist.subtitle || "",
      cover: safeCover(playlist.cover),
      tracks: songs.map((track) => ({
        id: track.id,
        path: pathOf(track),
        title: track.title,
        artist: track.artist,
        album: track.album,
      })),
    },
    null,
    2,
  );
}
export function importPlaylist(text, fileName, tracks) {
  if (text.length > 5 * 1024 * 1024) throw new Error("El límite es 5 MB por lista.");
  const clean = text.replace(/^\uFEFF/, "");
  if (/\.(csv|tsv)$/i.test(fileName)) return importSpotifyCsv(clean, fileName, tracks);
  let title = fileName.replace(/\.(json|m3u8?)$/i, ""),
    description = "",
    cover = "night",
    references;
  if (/\.json$/i.test(fileName) || clean.trimStart().startsWith("{")) {
    let value;
    try {
      value = JSON.parse(clean);
    } catch {
      throw new Error("No se pudo leer el JSON de la playlist.");
    }
    if (value?.format !== "onda-playlist" || value.version !== 1 || !Array.isArray(value.tracks))
      throw new Error("Usa un archivo JSON exportado por Onda o una lista M3U.");
    title = String(value.title || title);
    description = String(value.description || "").slice(0, 500);
    cover = safeCover(value.cover);
    references = value.tracks.map((item) => (typeof item === "string" ? { id: item } : item));
  } else if (/\.m3u8?$/i.test(fileName)) {
    const lines = clean
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const heading = lines.find((item) => item.startsWith("#PLAYLIST:"));
    if (heading) title = heading.slice(10);
    references = lines.filter((item) => !item.startsWith("#")).map((path) => ({ path }));
  } else throw new Error("Elige una lista JSON, M3U, M3U8 o un CSV de Spotify.");
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const ids = [],
    seen = new Set();
  let missing = 0,
    ambiguous = 0,
    duplicates = 0,
    remote = 0;
  for (const item of references) {
    if (!item || typeof item !== "object") {
      missing++;
      continue;
    }
    let match = byId.get(item.id);
    if (!match && typeof item.id === "string" && item.id.startsWith("local-")) {
      missing++;
      continue;
    }
    if (!match && typeof item.path === "string") {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(item.path) && !item.path.startsWith("file://")) {
        remote++;
        continue;
      }
      const name = normalizedPath(item.path);
      let candidates = tracks.filter((track) => normalizedPath(pathOf(track)) === name);
      if (!candidates.length)
        candidates = tracks.filter((track) => baseName(pathOf(track)) === baseName(name));
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1) {
        ambiguous++;
        continue;
      }
    }
    if (!match) {
      missing++;
      continue;
    }
    if (seen.has(match.id)) {
      duplicates++;
      continue;
    }
    seen.add(match.id);
    ids.push(match.id);
  }
  return {
    title: line(title).slice(0, 60) || "Playlist importada",
    subtitle: description,
    cover,
    tracks: ids,
    missing,
    ambiguous,
    duplicates,
    remote,
  };
}
export async function playlistArtwork(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error("Elige una imagen JPG, PNG o WebP de hasta 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.8);
    if (data.length >= 250000)
      throw new Error("Esta imagen ocupa demasiado. Prueba con una portada más sencilla.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function downloadPlaylist(playlist, tracks, format) {
  const blob = new Blob([exportPlaylist(playlist, tracks, format)], {
    type: format === "m3u" ? "audio/x-mpegurl;charset=utf-8" : "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    (line(playlist.title).replace(/[<>:"/\\|?*]/g, "-") || "Playlist") + "." + format;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
