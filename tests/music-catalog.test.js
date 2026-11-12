import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, catalogArtistId } from "../src/music-catalog.js";

test("album-artist metadata unites a compilation without mixing each artist's songs", () => {
  const tracks = [
    {
      id: "b",
      title: "Segundo",
      artist: "Luna",
      albumArtist: "Varios artistas",
      album: "Encuentros",
      trackNumber: 2,
      year: 2024,
      cover: "night",
      duration: 12,
    },
    {
      id: "a",
      title: "Primero",
      artist: "Sol",
      albumArtist: "VARIOS ARTISTAS",
      album: "encuentros",
      trackNumber: 1,
      year: 2024,
      cover: "data:image/jpeg;base64,AA==",
      duration: 15,
    },
  ];
  const before = structuredClone(tracks);
  const catalog = buildCatalog(tracks);
  assert.equal(catalog.albums.length, 1);
  assert.deepEqual(
    catalog.albums[0].tracks.map((track) => track.id),
    ["a", "b"],
  );
  assert.deepEqual(catalog.albums[0].artists, ["Luna", "Sol"]);
  assert.equal(catalog.albums[0].year, 2024);
  assert.equal(catalog.albums[0].cover, "data:image/jpeg;base64,AA==");
  const sol = catalog.artists.find((artist) => artist.name === "Sol");
  assert.deepEqual(
    sol.tracks.map((track) => track.id),
    ["a"],
  );
  assert.equal(sol.albums[0], catalog.albums[0]);
  assert.deepEqual(tracks, before);
});

test("homonymous albums by distinct artists stay separate while NFC and case variants agree", () => {
  const catalog = buildCatalog([
    { id: "one", title: "One", artist: "José", album: "Café", year: 2020 },
    { id: "two", title: "Two", artist: "JOSÉ", album: "Cafe\u0301", year: 2021 },
    { id: "three", title: "Three", artist: "Jose", album: "Café", year: 2020 },
    { id: "four", title: "Four", artist: "Otra banda", album: "Café", year: 2020 },
  ]);
  assert.equal(catalog.albums.length, 3);
  assert.equal(new Set(catalog.albums.map((album) => album.id)).size, 3);
  const accented = catalog.albums.find((album) => album.tracks.length === 2);
  assert.equal(accented.year, null);
  assert.deepEqual(JSON.parse(accented.id), ["album", "josé", "café"]);
});

test("explicit artist arrays preserve band names and deduplicate case variants", () => {
  const catalog = buildCatalog([
    {
      id: "collaboration",
      title: "Colaboración",
      artist: "AC/DC & Luz",
      artists: ["AC/DC", "Luz", "ac/dc"],
      albumArtist: "AC/DC",
      album: "Conexiones",
    },
    { id: "band", title: "Banda", artist: "Dúo / Uno", album: "Primer disco" },
    {
      id: "fallback",
      title: "Sin array",
      artist: "Luz",
      artists: [null, " "],
      album: "Otro disco",
    },
  ]);
  assert.deepEqual(
    catalog.artists.map((artist) => artist.name),
    ["AC/DC", "Dúo / Uno", "Luz"],
  );
  assert.equal(catalog.artists.find((artist) => artist.name === "AC/DC").tracks.length, 1);
  assert.equal(catalog.artists.find((artist) => artist.name === "Luz").tracks.length, 2);
  assert.equal(
    catalog.artists.find((artist) => artist.name === "AC/DC").id,
    catalogArtistId(" AC/DC "),
  );
});

test("albums sort by disc, track and then title without modifying the source array", () => {
  const tracks = [
    { id: "second-disc", title: "A", discNumber: 2, trackNumber: 1 },
    { id: "track-two", title: "Z", discNumber: 1, trackNumber: 2 },
    { id: "no-number-z", title: "Zulu" },
    { id: "track-one", title: "Y", trackNumber: 1 },
    { id: "no-number-a", title: "Alpha" },
  ].map((track) => ({ artist: "Banda", album: "Disco", ...track }));
  const originalIds = tracks.map((track) => track.id);
  const { albums } = buildCatalog(tracks);
  assert.deepEqual(
    albums[0].tracks.map((track) => track.id),
    ["track-one", "track-two", "no-number-a", "no-number-z", "second-disc"],
  );
  assert.deepEqual(
    tracks.map((track) => track.id),
    originalIds,
  );
  assert.equal(albums[0].tracks[0], tracks[3]);
});

test("legacy tracks and absent labels retain explicit fallbacks without a migration", () => {
  const catalog = buildCatalog([
    { id: "legacy", title: "Canción", artist: "La Banda", album: "Original" },
    { id: "untagged", title: "Sin etiquetas" },
  ]);
  const original = catalog.albums.find((album) => album.title === "Original");
  assert.equal(original.artist, "La Banda");
  assert.equal(original.cover, "night");
  assert.equal(original.year, null);
  const unknown = catalog.albums.find((album) => album.title === "Archivos locales");
  assert.equal(unknown.artist, "Artista desconocido");
  assert.deepEqual(buildCatalog([]), { albums: [], artists: [] });
});
