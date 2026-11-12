import test from "node:test";
import assert from "node:assert/strict";
import { searchTracks } from "../src/music-search.js";
import { catalogMetadata } from "../src/track-metadata.js";

const tracks = [
  {
    id: "a",
    title: "Canción del mar",
    artist: "Ágata",
    album: "Uno",
    genres: ["Indie"],
    year: 2024,
    createdAt: 30,
  },
  {
    id: "b",
    title: "Mar abierto",
    artist: "Ágata",
    album: "Dos",
    genres: ["Rock"],
    year: 2025,
    createdAt: 20,
  },
  {
    id: "c",
    title: "Otra canción",
    artist: "Banda",
    album: "Uno",
    genres: ["Indie"],
    year: 2024,
    createdAt: 40,
  },
];
test("accent-insensitive searches combine all terms with exact facets and stable ordering", () => {
  assert.deepEqual(
    searchTracks(tracks, { query: "agata MAR" }).map((t) => t.id),
    ["a", "b"],
  );
  assert.deepEqual(
    searchTracks(tracks, {
      query: "cancion",
      genre: "Indie",
      album: "Uno",
      year: "2024",
      artist: "Ágata",
    }).map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    searchTracks(tracks, { sort: "recent" }).map((t) => t.id),
    ["c", "a", "b"],
  );
  assert.equal(searchTracks(tracks, { year: "1999" }).length, 0);
  assert.equal(tracks[0].id, "a", "sorting must not mutate the library");
});
test("metadata uses explicit artist arrays, release/disc/track tags and bounded genre values", () => {
  assert.deepEqual(
    catalogMetadata({
      artist: "AC/DC",
      artists: ["AC/DC", "Invitada"],
      albumartist: "Varios",
      year: 2025,
      track: { no: 2 },
      disk: { no: 3 },
      genre: [" Rock ", "Rock", ""],
    }),
    {
      artists: ["AC/DC", "Invitada"],
      albumArtist: "Varios",
      year: 2025,
      genres: ["Rock"],
      trackNumber: 2,
      discNumber: 3,
    },
  );
  const legacy = catalogMetadata({ artist: "Banda", year: -4, track: { no: "?" } });
  assert.equal(legacy.year, null);
  assert.equal(legacy.trackNumber, null);
  assert.deepEqual(legacy.artists, ["Banda"]);
});
