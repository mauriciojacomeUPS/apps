import test from "node:test";
import assert from "node:assert/strict";
import { importPlaylist, exportPlaylist } from "../src/playlist-transfer.js";

const tracks = [
  {
    id: "local-hash-a",
    title: "Mi canción",
    artist: "Artista",
    album: "Álbum",
    duration: 35,
    relativePath: "Disco/Canción.mp3",
    fileName: "Canción.mp3",
  },
  { id: "demo", title: "Demo", artist: "Onda", audio: "sunset", duration: 45 },
];
test("JSON playlists round trip identity, order, description and artwork without audio or account data", () => {
  const playlist = {
    title: "Favoritas",
    subtitle: "Para el viaje",
    cover: "data:image/png;base64,YQ==",
    tracks: ["demo", "local-hash-a"],
    owner: "private",
  };
  const text = exportPlaylist(playlist, tracks);
  assert.equal(text.includes("private"), false);
  const imported = importPlaylist(text, "Favoritas.json", [...tracks].reverse());
  assert.deepEqual(imported.tracks, playlist.tracks);
  assert.equal(imported.subtitle, playlist.subtitle);
  assert.equal(imported.cover, playlist.cover);
  assert.equal(imported.missing, 0);
  const differentFile = [{ ...tracks[0], id: "local-hash-different" }];
  assert.equal(
    importPlaylist(text, "Fav.json", differentFile).tracks.length,
    0,
    "a file with different bytes must not silently replace a known content ID",
  );
});
test("M3U matches local paths, detects ambiguous basenames and never treats remote URLs as downloads", () => {
  const catalog = [
    ...tracks,
    { ...tracks[0], id: "local-other", relativePath: "Otro/Canción.mp3" },
  ];
  const result = importPlaylist(
    "#EXTM3U\n#PLAYLIST:Mi lista\nDisco/Canción.mp3\nCanción.mp3\nmissing.mp3\nhttps://music.example/audio.mp3\nDisco/Canción.mp3\n",
    "list.m3u8",
    catalog,
  );
  assert.deepEqual(result.tracks, ["local-hash-a"]);
  assert.equal(result.title, "Mi lista");
  assert.equal(result.ambiguous, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.remote, 1);
  assert.equal(result.duplicates, 1);
  assert.match(
    exportPlaylist({ title: "Mi\nlista", tracks: ["local-hash-a"] }, catalog, "m3u"),
    /#PLAYLIST:Mi lista\n#EXTINF:35,Artista - Mi canción\nDisco\/Canción.mp3/,
  );
});
test("invalid, excessive and foreign playlist formats fail with actionable messages", () => {
  assert.throws(() => importPlaylist("{", "list.json", tracks), /JSON/);
  assert.throws(() => importPlaylist('{"tracks":[]}', "list.json", tracks), /exportado por Onda/);
  assert.throws(() => importPlaylist("x".repeat(5 * 1024 * 1024 + 1), "list.m3u", tracks), /5 MB/);
  const foreign = importPlaylist(
    JSON.stringify({
      format: "onda-playlist",
      version: 1,
      tracks: [],
      cover: "https://example.com/track-user.png",
    }),
    "list.json",
    tracks,
  );
  assert.equal(foreign.cover, "night");
});
