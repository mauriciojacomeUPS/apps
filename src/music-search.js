export const searchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
const matches = (value, query) => searchText(value).includes(searchText(query));
export function searchTracks(
  tracks,
  { query = "", artist = "", album = "", genre = "", year = "", sort = "title" } = {},
) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const result = tracks.filter((track) => {
    if (artist && track.artist !== artist) return false;
    if (album && track.album !== album) return false;
    if (genre && !(track.genres || []).includes(genre)) return false;
    if (year && String(track.year || "") !== year) return false;
    return terms.every((term) =>
      matches(
        [
          track.title,
          track.artist,
          track.album,
          track.mood,
          track.year,
          ...(track.genres || []),
        ].join(" "),
        term,
      ),
    );
  });
  const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  return result.sort((a, b) =>
    sort === "recent"
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : sort === "year"
        ? (b.year || 0) - (a.year || 0) || collator.compare(a.title, b.title)
        : collator.compare(a[sort] || "", b[sort] || "") || collator.compare(a.title, b.title),
  );
}
