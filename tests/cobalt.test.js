import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  cobaltOrigin,
  youtubeEngine,
  downloadCobalt,
  cobaltError,
} from "../server/cobalt-client.js";
import { startCloudServer } from "../server/cloud-server.js";
import { startMediaRuntime, cobaltEnvironment } from "../server/start-media.js";

const audio = await readFile("public/audio/sunset.mp3");
const origin = "https://mauriciojacomeups.github.io";
const key = randomBytes(32).toString("hex"),
  client = randomBytes(32).toString("hex");
const headers = { Origin: origin, Authorization: "Bearer " + key, "X-Onda-Client": client };
const quiet = { info() {}, error() {}, warn() {} };
const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

async function fakeCobalt(mode = "audio") {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    calls.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      client: req.headers["x-onda-client"],
    });
    if (req.url === "/tunnel?test=1") {
      res.setHeader("Content-Type", "audio/mpeg");
      if (mode !== "chunked") res.setHeader("Content-Length", audio.length);
      if (mode === "slow") {
        res.write(audio.subarray(0, 20));
        return;
      }
      if (mode === "chunked") {
        res.write(audio.subarray(0, 20));
        res.end(audio.subarray(20));
      } else res.end(audio);
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET")
      return res.end(JSON.stringify({ cobalt: { version: "11.7.1", services: ["youtube"] } }));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks));
    assert.equal(payload.downloadMode, "audio");
    assert.equal(payload.alwaysProxy, true);
    calls.at(-1).body = payload;
    if (mode === "challenge")
      return res.end(
        JSON.stringify({
          status: "error",
          error: { code: "error.api.youtube.login", context: { private: key } },
        }),
      );
    const url =
      mode === "foreign"
        ? "https://example.com/private"
        : `http://127.0.0.1:${server.address().port}/tunnel?test=1`;
    res.end(JSON.stringify({ status: "tunnel", url, filename: "Sunset.m4a" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("Cobalt configuration admits only a private loopback instance and never forwards the Onda key", () => {
  assert.equal(youtubeEngine({}), "yt-dlp");
  assert.equal(youtubeEngine({ ONDA_YOUTUBE_ENGINE: "cobalt" }), "cobalt");
  assert.throws(() => youtubeEngine({ ONDA_YOUTUBE_ENGINE: "unknown" }));
  for (const url of [
    "https://api.cobalt.tools/",
    "http://192.168.1.1/",
    "http://user:pass@127.0.0.1:9000/",
    "http://127.0.0.1:9000/path",
  ])
    assert.throws(() => cobaltOrigin({ ONDA_COBALT_URL: url }));
  const env = cobaltEnvironment({
    ...process.env,
    ONDA_API_KEY: key,
    ONDA_COBALT_URL: "http://127.0.0.1:9123",
  });
  assert.equal(env.ONDA_API_KEY, undefined);
  assert.equal(env.API_LISTEN_ADDRESS, "127.0.0.1");
  assert.equal(env.API_PORT, "9123");
  assert.equal(env.API_URL, "http://127.0.0.1:9123/");
  assert.equal(env.HTTPS_PROXY, process.env.HTTPS_PROXY);
});

test("Cobalt restrictions use fixed errors and do not expose returned context", () => {
  for (const [upstream, code] of [
    ["error.api.youtube.login", "source-challenge"],
    ["error.api.fetch.rate", "rate-limit"],
    ["error.api.youtube.drm", "protected-content"],
    ["error.api.auth.key.missing", "cobalt-auth"],
    ["error.api.fetch.fail", "source-unavailable"],
  ]) {
    const error = cobaltError({ error: { code: upstream, context: { token: key } } }, 400);
    assert.equal(error.code, code);
    assert.equal(error.message.includes(key), false);
  }
});

test(
  "Cobalt audio crosses the authenticated Onda API, becomes a real M4A and retains private download capabilities",
  { skip: !ffmpeg },
  async () => {
    const upstream = await fakeCobalt();
    const cloud = await startCloudServer(
      {
        PORT: "0",
        HOST: "127.0.0.1",
        ONDA_API_KEY: key,
        ONDA_YOUTUBE_ENGINE: "cobalt",
        ONDA_COBALT_URL: upstream.url,
        ONDA_YTDLP_PATH: "/missing-ytdlp",
      },
      { logger: quiet },
    );
    const base = `http://127.0.0.1:${cloud.server.address().port}/v1/media`;
    try {
      const status = await (await fetch(base + "/status", { headers })).json();
      assert.equal(status.youtube, true);
      assert.equal(status.youtubeEngine, "cobalt");
      assert.equal(status.youtubePlaylists, false);
      const response = await fetch(base + "/jobs", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=aaaaaaaaaaa&list=RDaaaaaaaaaaa&start_radio=1",
          format: "m4a",
          playlist: false,
        }),
      });
      assert.equal(response.status, 202);
      let job = await response.json();
      for (let i = 0; i < 100 && job.state === "working"; i++) {
        await new Promise((r) => setTimeout(r, 40));
        job = await (await fetch(base + "/jobs/" + job.id, { headers })).json();
      }
      assert.equal(job.state, "ready", JSON.stringify(job));
      assert.equal(job.result.type, "audio/mp4");
      assert.match(job.result.name, /\.m4a$/);
      const result = await fetch(
        base + "/jobs/" + job.id + "/result?download_token=" + job.downloadToken,
      );
      assert.equal(result.status, 200);
      const bytes = Buffer.from(await result.arrayBuffer());
      assert.ok(bytes.subarray(0, 40).includes(Buffer.from("ftyp")));
      assert.ok(upstream.calls.every((call) => !call.authorization && !call.client));
      assert.equal(
        upstream.calls.find((call) => call.method === "POST").body.url,
        "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      );
      assert.equal((await fetch(base + "/jobs/" + job.id + "/result")).status, 403);
    } finally {
      await cloud.close();
      await upstream.close();
    }
  },
);

test("Cobalt rejects arbitrary output URLs, oversized streams, playlist requests and source challenges without retaining partial files", async () => {
  for (const [mode, code] of [
    ["foreign", "cobalt-response"],
    ["audio", "audio-too-large"],
    ["chunked", "audio-too-large"],
    ["challenge", "source-challenge"],
  ]) {
    const upstream = await fakeCobalt(mode),
      dir = await mkdtemp(join(tmpdir(), "onda-cobalt-test-"));
    try {
      await assert.rejects(
        () =>
          downloadCobalt(
            { ONDA_COBALT_URL: upstream.url },
            { dir, controller: new AbortController(), limits: { maxAudioBytes: 1024 } },
            { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", playlist: false },
          ),
        (error) => error.code === code,
      );
      assert.deepEqual(await readdir(dir), []);
      assert.equal(upstream.calls.filter((c) => c.method === "POST").length, 1);
      if (mode === "foreign") assert.equal(upstream.calls.length, 1);
      await assert.rejects(
        () =>
          downloadCobalt(
            { ONDA_COBALT_URL: upstream.url },
            { dir, controller: new AbortController() },
            { playlist: true },
          ),
        (error) => error.code === "cobalt-playlist",
      );
      assert.equal(upstream.calls.filter((c) => c.method === "POST").length, 1);
    } finally {
      await upstream.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("cancelling a Cobalt transfer closes the stream and removes its partial audio", async () => {
  const upstream = await fakeCobalt("slow"),
    dir = await mkdtemp(join(tmpdir(), "onda-cobalt-cancel-"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120);
  try {
    await assert.rejects(() =>
      downloadCobalt(
        { ONDA_COBALT_URL: upstream.url },
        { dir, controller },
        { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", playlist: false },
      ),
    );
    assert.equal(controller.signal.aborted, true);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    clearTimeout(timer);
    await upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function runtimeFixture(delay = 0) {
  const dir = await mkdtemp(join(tmpdir(), "onda-cobalt-runtime-"));
  await mkdir(join(dir, "src"));
  const entry = join(dir, "src", "cobalt.cjs");
  await writeFile(
    entry,
    `const http=require('node:http'),fs=require('node:fs');fs.writeFileSync('child.json',JSON.stringify({hasKey:process.env.ONDA_API_KEY!==undefined}));const server=http.createServer((req,res)=>{if(req.url==='/quit'){res.end();server.close(()=>process.exit(9));return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cobalt:{version:'11.7.1',services:['youtube']}}));});setTimeout(()=>server.listen(process.env.API_PORT,process.env.API_LISTEN_ADDRESS),${delay});process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`,
  );
  const reserve = http.createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  return {
    dir,
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      ONDA_API_KEY: key,
      ONDA_YOUTUBE_ENGINE: "cobalt",
      ONDA_COBALT_URL: `http://127.0.0.1:${port}`,
      ONDA_COBALT_ENTRY: entry,
      ONDA_RUN_SOURCE_CHECK: "false",
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("the runtime owns its private Cobalt process and closes both services idempotently", async () => {
  const fixture = await runtimeFixture();
  let runtime;
  try {
    runtime = await startMediaRuntime(fixture.env, { logger: quiet });
    const proof = JSON.parse(await readFile(join(fixture.dir, "child.json"), "utf8"));
    assert.equal(proof.hasKey, false);
    const url = `http://127.0.0.1:${runtime.cloud.server.address().port}/healthz`;
    assert.equal((await (await fetch(url)).json()).youtubeEngine, "cobalt");
    await runtime.close();
    await runtime.close();
    assert.equal(await runtime.done, 0);
    await assert.rejects(() => fetch(url));
    await assert.rejects(() => fetch(fixture.env.ONDA_COBALT_URL));
  } finally {
    await runtime?.close();
    await fixture.cleanup();
  }
});

test("an unexpected Cobalt exit closes Onda instead of leaving a misleading healthy API", async () => {
  const fixture = await runtimeFixture();
  let runtime;
  try {
    runtime = await startMediaRuntime(fixture.env, { logger: quiet });
    const url = `http://127.0.0.1:${runtime.cloud.server.address().port}/healthz`;
    await fetch(fixture.env.ONDA_COBALT_URL + "/quit");
    assert.equal(await runtime.done, 1);
    await assert.rejects(() => fetch(url));
  } finally {
    await runtime?.close();
    await fixture.cleanup();
  }
});

test("cancelling runtime startup releases the private child before exposing Onda", async () => {
  const fixture = await runtimeFixture(1000);
  const controller = new AbortController();
  const starting = startMediaRuntime(fixture.env, { signal: controller.signal, logger: quiet });
  try {
    for (let i = 0; i < 100; i++) {
      try {
        await readFile(join(fixture.dir, "child.json"));
        break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();
    await assert.rejects(starting);
    await assert.rejects(() => fetch(fixture.env.ONDA_COBALT_URL));
  } finally {
    controller.abort();
    await starting.catch(() => {});
    await fixture.cleanup();
  }
});
