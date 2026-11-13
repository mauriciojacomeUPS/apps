const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TRACKS = 10000;
const MAX_COLUMNS = 128;

const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
const headerKey = (value) => normalized(value).replace(/[^a-z0-9]/g, "");
const display = (value) =>
  String(value || "")
    .replace(/[\r\n\0]/g, " ")
    .trim();
const titleHeaders = new Set([
  "trackname",
  "tracktitle",
  "songname",
  "songtitle",
  "title",
  "name",
  "nombre",
  "titulo",
  "cancion",
  "nombrecancion",
  "nombredelacancion",
  "nombredeltema",
  "titulodelacancion",
  "titulodeltema",
  "nombrepista",
  "nombredepista",
]);
const artistHeaders = new Set([
  "artistnames",
  "artistname",
  "artists",
  "artist",
  "artista",
  "artistas",
  "nombredeartista",
  "nombredelartista",
  "nombredelosartistas",
  "nombredeartistas",
  "artistadelacancion",
  "interprete",
  "interpretes",
]);

function delimiterOf(text) {
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (character === "\n" || character === "\r") break;
      if (counts.has(character)) counts.set(character, counts.get(character) + 1);
    }
  }
  return [...counts].sort((first, second) => second[1] - first[1])[0][0];
}

function csvRows(text, delimiter) {
  const rows = [];
  let row = [],
    cell = "",
    state = "plain";
  const finishCell = () => {
    row.push(cell);
    if (row.length > MAX_COLUMNS)
      throw new Error(
        "El CSV admite hasta 128 columnas. Conserva las columnas de título y artista.",
      );
    cell = "";
    state = "plain";
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) {
      rows.push(row);
      if (rows.length > MAX_TRACKS + 1) throw new Error("El límite es 10 000 canciones por CSV.");
    }
    row = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index++;
        } else state = "closed";
      } else cell += character;
    } else if (character === delimiter) finishCell();
    else if (character === "\n" || character === "\r") {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index++;
    } else if (state === "closed") {
      if (character !== " " && character !== "\t")
        throw new Error(
          "El CSV tiene comillas mal cerradas. Vuelve a exportarlo y conserva las comillas de los campos.",
        );
    } else if (character === '"') {
      if (cell.trim())
        throw new Error(
          "El CSV contiene comillas sin escapar. Las comillas dentro de un campo deben escribirse como dos comillas.",
        );
      cell = "";
      state = "quoted";
    } else cell += character;
  }
  if (state === "quoted") throw new Error("El CSV tiene un campo con comillas sin cerrar.");
  finishRow();
  return rows;
}

function columnFor(headers, aliases) {
  const positions = headers.flatMap((header, index) =>
    aliases.has(headerKey(header)) ? [index] : [],
  );
  if (positions.length > 1)
    throw new Error(
      "El CSV tiene varias columnas de título o artista. Conserva una columna de cada tipo.",
    );
  return positions[0];
}

function artistMatches(csvArtist, track) {
  const supplied = normalized(csvArtist);
  if (normalized(track.artist) === supplied) return true;
  const explicit = new Set(
    (Array.isArray(track.artists) ? track.artists : []).map(normalized).filter(Boolean),
  );
  // A comma or slash is part of the artist's name, never an inferred separator.
  // Multiple CSV credits can only be compared with explicit local artist tags.
  const names = new Set(csvArtist.split(";").map(normalized).filter(Boolean));
  if (names.size > 1)
    return names.size === explicit.size && [...names].every((name) => explicit.has(name));
  return explicit.has(supplied);
}

/** Read user-supplied Spotify CSV metadata. This never resolves URLs or downloads audio. */
export function importSpotifyCsv(text, fileName, tracks) {
  if (typeof text !== "string") throw new Error("No se pudo leer el CSV de la playlist.");
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error("El límite es 5 MB por CSV.");
  if (text.includes("\0"))
    throw new Error("El archivo no es un CSV de texto válido. Expórtalo como CSV UTF-8.");
  let clean = text.replace(/^\uFEFF/, "").replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/, "");
  const separator = /^sep=([,;\t])(?:\r\n|\r|\n)/i.exec(clean);
  if (separator) clean = clean.slice(separator[0].length);
  const rows = csvRows(clean, separator?.[1] || delimiterOf(clean));
  const headers = rows.shift() || [];
  const titleColumn = columnFor(headers, titleHeaders);
  const artistColumn = columnFor(headers, artistHeaders);
  if (titleColumn === undefined || artistColumn === undefined)
    throw new Error(
      "El CSV debe incluir columnas de título y artista, por ejemplo «Track Name» y «Artist Name(s)».",
    );
  if (!rows.length)
    throw new Error(
      "El CSV no contiene canciones. Incluye al menos una fila después de los encabezados.",
    );
  if (rows.some((row) => row.length > headers.length))
    throw new Error(
      "Una fila del CSV tiene más columnas que los encabezados. Revisa el separador y las comillas.",
    );

  const catalog = new Map();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (track?.source !== "local" || typeof track.id !== "string" || !track.id) continue;
    const key = normalized(track.title);
    if (!key) continue;
    if (!catalog.has(key)) catalog.set(key, new Map());
    if (!catalog.get(key).has(track.id)) catalog.get(key).set(track.id, track);
  }
  const ids = [],
    unmatched = [],
    seen = new Set();
  let missing = 0,
    ambiguous = 0,
    duplicates = 0;
  for (const row of rows) {
    const rawTitle = row[titleColumn] || "",
      rawArtist = row[artistColumn] || "";
    const title = display(rawTitle).slice(0, 200),
      artist = display(rawArtist).slice(0, 200);
    const candidates =
      normalized(rawTitle) && normalized(rawArtist)
        ? [...(catalog.get(normalized(rawTitle))?.values() || [])].filter((track) =>
            artistMatches(rawArtist, track),
          )
        : [];
    if (!candidates.length) {
      missing++;
      unmatched.push({
        title,
        artist,
        reason: normalized(rawTitle) && normalized(rawArtist) ? "not-found" : "missing-metadata",
      });
    } else if (candidates.length > 1) {
      ambiguous++;
      unmatched.push({ title, artist, reason: "ambiguous" });
    } else if (seen.has(candidates[0].id)) duplicates++;
    else {
      seen.add(candidates[0].id);
      ids.push(candidates[0].id);
    }
  }
  return {
    title:
      display(
        String(fileName || "")
          .split(/[\\/]/)
          .at(-1)
          .replace(/\.(csv|tsv)$/i, ""),
      ).slice(0, 60) || "Playlist de Spotify",
    subtitle: "Selección de Spotify enlazada con tu biblioteca local.",
    cover: "night",
    tracks: ids,
    missing,
    ambiguous,
    duplicates,
    remote: 0,
    unmatched,
    source: "spotify-csv",
  };
}
