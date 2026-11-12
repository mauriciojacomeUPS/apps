const label = (value) => (typeof value === "string" ? value.trim().slice(0, 200) : "");
export const tagNumber = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export const releaseYear = (value) => {
  const year = tagNumber(value);
  return year && year <= 9999 ? year : null;
};
export const genresFrom = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
        .map(label)
        .filter(Boolean),
    ),
  ].slice(0, 32);
export function catalogMetadata(common) {
  const artist = label(common.artist) || "Artista desconocido";
  const artists = [
    ...new Set((Array.isArray(common.artists) ? common.artists : []).map(label).filter(Boolean)),
  ];
  return {
    artists: artists.length ? artists : [artist],
    albumArtist: label(common.albumartist) || artist,
    year: releaseYear(common.year),
    genres: genresFrom(common.genre),
    trackNumber: tagNumber(common.track?.no),
    discNumber: tagNumber(common.disk?.no),
  };
}
