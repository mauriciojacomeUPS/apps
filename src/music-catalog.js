const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const label = (value, fallback) =>
  typeof value === "string" && value.trim() ? value.trim().normalize("NFC") : fallback;
const identity = (value) => value.normalize("NFC").trim().toLocaleLowerCase("es");
export const catalogArtistId = (name) =>
  JSON.stringify(["artist", identity(label(name, "Artista desconocido"))]);
const positiveNumber = (value, fallback) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

function trackArtists(track) {
  const supplied = Array.isArray(track.artists)
    ? track.artists.filter((name) => typeof name === "string" && name.trim())
    : [];
  const names = supplied.length ? supplied : [label(track.artist, "Artista desconocido")];
  const distinct = new Map();
  for (const value of names) {
    const name = label(value, "Artista desconocido");
    if (!distinct.has(identity(name))) distinct.set(identity(name), name);
  }
  return [...distinct.values()];
}

function albumFields(track) {
  return {
    title: label(track.album, "Archivos locales"),
    artist: label(track.albumArtist, label(track.artist, "Artista desconocido")),
  };
}

function albumId(track) {
  const album = albumFields(track);
  return JSON.stringify(["album", identity(album.artist), identity(album.title)]);
}

function compareAlbumTracks(first, second) {
  return (
    positiveNumber(first.discNumber, 1) - positiveNumber(second.discNumber, 1) ||
    positiveNumber(first.trackNumber, Number.MAX_SAFE_INTEGER) -
      positiveNumber(second.trackNumber, Number.MAX_SAFE_INTEGER) ||
    collator.compare(label(first.title, ""), label(second.title, "")) ||
    String(first.id).localeCompare(String(second.id))
  );
}

function coverOf(tracks) {
  return (
    tracks.find((track) => /^data:image\//.test(track.cover || ""))?.cover ||
    tracks.find((track) => typeof track.cover === "string" && track.cover)?.cover ||
    "night"
  );
}

function yearOf(tracks) {
  const years = new Set(
    tracks.map((track) => Number(track.year)).filter((year) => Number.isInteger(year) && year > 0),
  );
  // Conflicting years are left unknown rather than presented as a release date.
  return years.size === 1 ? [...years][0] : null;
}

/** Group only the supplied metadata; never infer artists by splitting display text. */
export function buildCatalog(tracks = []) {
  const albumsById = new Map();
  const artistsById = new Map();
  for (const track of tracks) {
    const id = albumId(track);
    const fields = albumFields(track);
    let album = albumsById.get(id);
    if (!album) {
      album = { id, ...fields, tracks: [], artists: [] };
      albumsById.set(id, album);
    }
    album.tracks.push(track);
    for (const name of trackArtists(track)) {
      const artistId = catalogArtistId(name);
      let artist = artistsById.get(artistId);
      if (!artist) {
        artist = { id: artistId, name, tracks: [], albumIds: new Set() };
        artistsById.set(artistId, artist);
      }
      artist.tracks.push(track);
      artist.albumIds.add(id);
      if (!album.artists.some((existing) => identity(existing) === identity(name)))
        album.artists.push(name);
    }
  }

  const albums = [...albumsById.values()].map((album) => ({
    ...album,
    tracks: [...album.tracks].sort(compareAlbumTracks),
    artists: [...album.artists].sort(collator.compare),
    cover: coverOf(album.tracks),
    year: yearOf(album.tracks),
  }));
  albums.sort(
    (first, second) =>
      collator.compare(first.title, second.title) ||
      collator.compare(first.artist, second.artist) ||
      first.id.localeCompare(second.id),
  );
  const artists = [...artistsById.values()].map(({ albumIds, ...artist }) => ({
    ...artist,
    tracks: [...artist.tracks].sort((first, second) => {
      const firstAlbum = albumFields(first),
        secondAlbum = albumFields(second);
      return (
        collator.compare(firstAlbum.title, secondAlbum.title) ||
        collator.compare(firstAlbum.artist, secondAlbum.artist) ||
        compareAlbumTracks(first, second)
      );
    }),
    albums: albums.filter((album) => albumIds.has(album.id)),
    cover: coverOf(artist.tracks),
  }));
  artists.sort(
    (first, second) =>
      collator.compare(first.name, second.name) || first.id.localeCompare(second.id),
  );
  return { albums, artists };
}
