import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { indexedDB } from "fake-indexeddb";
import { deviceLibrary } from "../src/device-library.js";

globalThis.indexedDB = indexedDB;
const fixture = new URL("../public/audio/sunset.mp3", import.meta.url);
const song = async (name = "Mi canción.mp3") =>
  new File([await readFile(fixture)], name, { type: "audio/mpeg" });
const owner = () => "test-" + randomUUID();

test("imports real audio, persists metadata and bytes, and detects content duplicates", async () => {
  const user = owner();
  const library = deviceLibrary(user);
  const file = await song();
  const result = await library.importFiles([file]);
  assert.equal(result.added.length, 1);
  const track = result.added[0];
  assert.ok(track.duration > 40);
  assert.equal(track.bytes, file.size);
  assert.equal(track.source, "local");
  assert.equal("file" in track, false);
  const afterReload = deviceLibrary(user);
  assert.equal((await afterReload.list())[0].id, track.id);
  const url = await afterReload.audioUrl(track);
  assert.deepEqual(
    Buffer.from(await (await fetch(url)).arrayBuffer()),
    Buffer.from(await file.arrayBuffer()),
  );
  const duplicate = await afterReload.importFiles([await song("Otro nombre.mp3")]);
  assert.equal(duplicate.duplicates, 1);
  assert.equal((await afterReload.list()).length, 1);
  afterReload.dispose();
});

test("two accounts have independent device libraries and cannot read another namespace", async () => {
  const first = deviceLibrary(owner()),
    second = deviceLibrary(owner());
  const result = await first.importFiles([await song()]);
  assert.equal((await second.list()).length, 0);
  await assert.rejects(() => second.audioUrl(result.added[0]), /no está en la biblioteca/);
  await assert.rejects(
    () => second.update(result.added[0].id, { title: "Cambio", artist: "", album: "" }),
    /No se encontró/,
  );
  await second.remove(result.added[0].id);
  assert.equal((await first.list()).length, 1);
});

test("edits and removal affect the local copy, leaving the selected original intact", async () => {
  const library = deviceLibrary(owner()),
    file = await song();
  const originalBytes = Buffer.from(await file.arrayBuffer());
  const {
    added: [track],
  } = await library.importFiles([file]);
  await library.update(track.id, {
    title: "Nueva canción",
    artist: "Mi artista",
    album: "Mi álbum",
  });
  assert.equal((await library.list())[0].title, "Nueva canción");
  await assert.rejects(
    () => library.update(track.id, { title: " ", artist: "", album: "" }),
    /Escribe un título/,
  );
  await library.remove(track.id);
  assert.equal((await library.list()).length, 0);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), originalBytes);
});

test("a folder containing other files and invalid audio reports them without hiding valid imports", async () => {
  const library = deviceLibrary(owner());
  const result = await library.importFiles([
    new File(["not an audio"], "fake.mp3"),
    new File(["notes"], "notes.txt"),
    await song(),
  ]);
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /fake.mp3/);
  assert.equal((await library.list()).length, 1);
});
