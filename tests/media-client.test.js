import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaClient,
  normalizeMediaServer,
  readMediaConnection,
  saveMediaConnection,
  mediaClientToken,
} from "../src/media-client.js";
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
test("server configuration keeps access keys out of URLs and only persists them with explicit opt-in", () => {
  const local = memory(),
    session = memory(),
    key = "private-access-key-".repeat(3);
  const value = saveMediaConnection(
    "alice",
    { url: "https://onda.onrender.com/v1/media", key, remember: false },
    { local, session },
  );
  assert.equal(value.url, "https://onda.onrender.com");
  assert.equal(local.getItem("onda-media-server:alice").includes(key), false);
  assert.equal(readMediaConnection("alice", { local, session }).key, key);
  assert.equal(readMediaConnection("bob", { local, session }).key, "");
  session.removeItem("onda-media-key:alice");
  assert.equal(readMediaConnection("alice", { local, session }).key, "");
  saveMediaConnection("alice", { url: value.url, key, remember: true }, { local, session });
  session.removeItem("onda-media-key:alice");
  assert.equal(readMediaConnection("alice", { local, session }).key, key);
  for (const url of [
    "http://service.example",
    "https://user:secret@service.example",
    "https://service.example?key=secret",
    "https://service.example/#private",
    "https://service.example/proxy",
  ])
    assert.throws(() => normalizeMediaServer(url));
  assert.throws(
    () => saveMediaConnection("alice", { url: value.url, key: "short" }, { local, session }),
    /32/,
  );
  const first = mediaClientToken("alice", local);
  assert.equal(first.length, 64);
  assert.equal(mediaClientToken("alice", local), first);
  assert.notEqual(mediaClientToken("bob", local), first);
});
test("remote requests carry private headers, omit ambient credentials and never forward access keys in artifact links", async () => {
  const calls = [],
    key = "private-key-".repeat(4),
    clientToken = "c".repeat(64);
  const client = createMediaClient({
    url: "https://onda.onrender.com",
    key,
    clientToken,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ ok: true });
    },
  });
  await client.json("/status");
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer " + key);
  assert.equal(calls[0].options.headers.get("X-Onda-Client"), clientToken);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.credentials, "omit");
  await client.health();
  assert.equal(calls[1].url, "https://onda.onrender.com/healthz");
  assert.equal(calls[1].options.headers.has("Authorization"), false);
  const link = new URL(client.downloadUrl({ id: "job", downloadToken: "artifact-only" }));
  assert.equal(link.searchParams.get("download_token"), "artifact-only");
  assert.equal(link.href.includes(key), false);
  assert.equal(link.href.includes(clientToken), false);
  const local = createMediaClient({
    localBase: "/apps/__onda-media",
    fetcher: async (url, options) => {
      assert.equal(url, "/apps/__onda-media/status");
      assert.equal(options.headers.has("Authorization"), false);
      return Response.json({ ok: true });
    },
  });
  await local.json("/status");
});
