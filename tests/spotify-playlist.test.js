import test from "node:test";
import assert from "node:assert/strict";
import { importSpotifyCsv } from "../src/spotify-playlist.js";

const local = (id, title, artist, extra = {}) => ({ id, title, artist, source: "local", ...extra });

test("Exportify CSV handles a BOM, escaped quotes, commas and quoted line breaks without consulting Spotify URLs", () => {
  const tracks = [
    local("one", 'Una "canción", del mar', "Banda"),
    local("two", "Entre dos líneas", "Otra banda"),
  ];
  const text =
    '\uFEFF"Track URI","Track Name","Artist Name(s)","Album Name"\r\n"spotify:track:1","Una ""canción"", del mar","Banda","Disco"\r\n"https://open.spotify.com/track/2","Entre dos\nlíneas","Otra banda","Disco, dos"\r\n';
  const result = importSpotifyCsv(text, "Mi selección.CSV", tracks);
  assert.deepEqual(result.tracks, ["one", "two"]);
  assert.equal(result.title, "Mi selección");
  assert.equal(result.source, "spotify-csv");
  assert.equal(result.cover, "night");
  assert.equal(result.remote, 0);
  assert.deepEqual(result.unmatched, []);
});

test("Spanish semicolon and tab exports match accents and case while preserving version suffixes", () => {
  const tracks = [
    local("studio", "Canción del Mar", "ÁGATA"),
    local("live", "Canción del Mar - Live", "Ágata"),
  ];
  const semicolon = importSpotifyCsv(
    'sep=;\r\nTítulo;Artista;Álbum\r\n"cancion DEL mar";"agata";"Uno"\r\n"Canción del Mar - Live";"Ágata";"Dos"',
    "es.csv",
    tracks,
  );
  assert.deepEqual(semicolon.tracks, ["studio", "live"]);
  const tab = importSpotifyCsv(
    "Nombre de la canción\tIntérprete\nCanción del Mar (Remastered)\tÁgata\nCanción del Mar - Live\tÁgata",
    "tab.csv",
    tracks,
  );
  assert.deepEqual(tab.tracks, ["live"]);
  assert.equal(tab.missing, 1);
  assert.deepEqual(tab.unmatched, [
    { title: "Canción del Mar (Remastered)", artist: "Ágata", reason: "not-found" },
  ]);
});

test("artist names containing commas or slashes stay intact; multiple credits need explicit artist tags", () => {
  const tracks = [
    local("acdc", "Thunder", "AC/DC"),
    local("earth", "September", "Earth, Wind & Fire"),
    local("duet", "Juntos", "Ágata & Invitada", { artists: ["Ágata", "Invitada"] }),
    local("unlabelled", "Sin etiquetas", "Ágata & Invitada"),
    local("band-literal", "Un nombre", "Banda; Nombre"),
  ];
  const text =
    'Track Name,Artist Name(s)\nThunder,AC/DC\nSeptember,"Earth, Wind & Fire"\nJuntos,"Invitada;Agata"\nSin etiquetas,"Ágata;Invitada"\nUn nombre,"Banda; Nombre"\n';
  const result = importSpotifyCsv(text, "Artistas.csv", tracks);
  assert.deepEqual(result.tracks, ["acdc", "earth", "duet", "band-literal"]);
  assert.equal(result.missing, 1);
  const wrongBand = importSpotifyCsv(
    'Title,Artist\nSeptember,"Earth;Wind & Fire"\nThunder,AC\n',
    "wrong.csv",
    tracks,
  );
  assert.equal(wrongBand.tracks.length, 0);
  assert.equal(wrongBand.missing, 2);
});

test("matches only local files, retains input order, deduplicates IDs and reports absent, incomplete and ambiguous rows", () => {
  const tracks = [
    local("b", "Beta", "Banda"),
    local("a", "Alpha", "Banda"),
    local("a", "Alpha", "Banda"),
    local("x1", "Igual", "Banda"),
    local("x2", "Igual", "Banda"),
    { id: "demo", title: "Demo", artist: "Banda" },
  ];
  const result = importSpotifyCsv(
    "Song Title,Artist\nAlpha,Banda\nBeta,Banda\nALPHA,BANDA\nIgual,Banda\nPerdida,Banda\nDemo,Banda\nSin artista,\n",
    "Lista.csv",
    tracks,
  );
  assert.deepEqual(result.tracks, ["a", "b"]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.missing, 3);
  assert.deepEqual(
    result.unmatched.map((item) => item.reason),
    ["ambiguous", "not-found", "not-found", "missing-metadata"],
  );
});

test("CSV values remain literal metadata; URLs and formulas cannot invoke a network request", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    throw new Error("Network access is forbidden for CSV import");
  };
  try {
    const result = importSpotifyCsv(
      'Track Name,Artist Name(s),Track URI\nReal,Banda,"=HYPERLINK(""https://example.test/private"")"\n"=HYPERLINK(""https://example.test/audio"")",Banda,https://open.spotify.com/track/1\n',
      "Literal.csv",
      [local("local-real", "Real", "Banda")],
    );
    assert.deepEqual(result.tracks, ["local-real"]);
    assert.equal(result.missing, 1);
    assert.match(result.unmatched[0].title, /^=HYPERLINK/);
    assert.equal(result.remote, 0);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing or duplicate headers, empty files and malformed quoting fail with actionable errors", () => {
  for (const text of ["", "Track URI,Album Name\nspotify:track:one,Album", "Title\nSong"])
    assert.throws(() => importSpotifyCsv(text, "bad.csv", []), /título y artista/);
  assert.throws(() => importSpotifyCsv("Title,Artist\n", "empty.csv", []), /no contiene canciones/);
  assert.throws(
    () => importSpotifyCsv("Title,Track Name,Artist\nOne,One,Band", "duplicate.csv", []),
    /varias columnas/,
  );
  assert.throws(
    () => importSpotifyCsv('Title,Artist\n"Song,Band', "quotes.csv", []),
    /comillas sin cerrar/,
  );
  assert.throws(
    () => importSpotifyCsv('Title,Artist\n"Song"broken,Band', "quotes.csv", []),
    /comillas mal cerradas/,
  );
  assert.throws(
    () => importSpotifyCsv('Title,Artist\nSo"ng,Band', "quotes.csv", []),
    /comillas sin escapar/,
  );
  assert.throws(
    () => importSpotifyCsv("Title,Artist\nSong,Band,extra", "row.csv", []),
    /más columnas/,
  );
  assert.throws(() => importSpotifyCsv("Title,Artist\nSong,\0Band", "binary.csv", []), /UTF-8/);
});

test("CSV byte, row and column budgets reject excessive input without truncating a playlist", () => {
  assert.throws(() => importSpotifyCsv("x".repeat(5 * 1024 * 1024 + 1), "big.csv", []), /5 MB/);
  assert.throws(() => importSpotifyCsv("é".repeat(3 * 1024 * 1024), "utf8.csv", []), /5 MB/);
  assert.throws(
    () => importSpotifyCsv("Title,Artist\n" + "Song,Band\n".repeat(10001), "rows.csv", []),
    /10 000 canciones/,
  );
  const valid = importSpotifyCsv("Title,Artist\n" + "Song,Band\n".repeat(10000), "full.csv", [
    local("song", "Song", "Band"),
  ]);
  assert.deepEqual(valid.tracks, ["song"]);
  assert.equal(valid.duplicates, 9999);
  assert.throws(
    () =>
      importSpotifyCsv(
        ["Title", "Artist", ...Array(127).fill("Extra")].join(",") + "\nSong,Band",
        "wide.csv",
        [],
      ),
    /128 columnas/,
  );
});
