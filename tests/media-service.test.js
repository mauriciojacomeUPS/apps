import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { startCloudServer } from "../server/cloud-server.js";

const origin = "https://mauriciojacomeups.github.io";
const apiKey = randomBytes(32).toString("hex");
const alice = randomBytes(32).toString("hex"),
  bob = randomBytes(32).toString("hex");
const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const requiresTools =
  !ffmpeg || process.platform === "win32" ? "Requires FFmpeg and executable Unix fixtures" : false;
const quiet = { error() {}, warn() {} };
const options = (client) => ({
  headers: { Origin: origin, Authorization: "Bearer " + apiKey, "X-Onda-Client": client },
});

async function ready(base, id, client) {
  let job;
  for (let index = 0; index < 120; index++) {
    job = await (await fetch(base + "/jobs/" + id, options(client))).json();
    if (job.state !== "working") return job;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error("Timed out waiting for job: " + JSON.stringify(job));
}
async function start(base, client, url = "https://youtu.be/aaaaaaaaaaa") {
  return fetch(base + "/jobs", {
    method: "POST",
    headers: { ...options(client).headers, "Content-Type": "application/json" },
    body: JSON.stringify({ url, format: "m4a" }),
  });
}
async function fixtureServer({ limits = {}, failure = "", archiveSingle = false, ...extra } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "onda-cloud-fixture-"));
  const executable = join(dir, "yt-dlp");
  const audio = resolve("public/audio/sunset.mp3");
  const calls = join(dir, "calls.log");
  await writeFile(
    executable,
    "#!/usr/bin/env node\n" +
      [
        'const fs=require("node:fs");const args=process.argv.slice(2);',
        `if(${JSON.stringify(archiveSingle)}){if(args.includes("--dump-single-json")){console.log(JSON.stringify({_type:"video",formats:[{format_id:"mp3"}]}));process.exit(0);}if(args[args.indexOf("--use-extractors")+1]!==${JSON.stringify("archive\\.org")}||args[args.indexOf("--compat-options")+1]!=="no-certifi"){console.error("wrong extractor or trust store");process.exit(1);}}`,
        'if(args.includes("--dump-single-json")){console.log(JSON.stringify({title:"Test list",entries:[{id:"aaaaaaaaaaa",title:"One"},{id:"bbbbbbbbbbb",title:"Two"}]}));process.exit(0);}',
        'const id=new URL(args.at(-1)).searchParams.get("v");',
        "fs.appendFileSync(" + JSON.stringify(calls) + ', args.at(-1)+"\\n");',
        "if(" +
          JSON.stringify(failure) +
          "){console.error(" +
          JSON.stringify(failure) +
          ");process.exit(1);}",
        'const write=()=>{const file=args[args.indexOf("-o")+1].replace("%(ext)s","mp3");fs.copyFileSync(' +
          JSON.stringify(audio) +
          ',file);console.log(JSON.stringify({filepath:file,title:"Sunset",artist:"Onda Studio"}));};',
        'if(id==="zzzzzzzzzzz")setTimeout(write,2000);else write();',
      ].join("\n"),
    { mode: 0o700 },
  );
  const instance = await startCloudServer(
    {
      PORT: "0",
      HOST: "127.0.0.1",
      ONDA_API_KEY: apiKey,
      ONDA_ALLOWED_ORIGINS: origin,
      ONDA_YTDLP_PATH: executable,
      ...extra.env,
    },
    { logger: quiet, limits, ...extra.options },
  );
  const host = "http://127.0.0.1:" + instance.server.address().port;
  return {
    instance,
    host,
    base: host + "/v1/media",
    downloadCalls: async () => (await readFile(calls, "utf8")).trim().split("\n"),
    close: async () => {
      await instance.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("cloud startup requires a private key and exact trusted origins", async () => {
  await assert.rejects(
    () => startCloudServer({ ONDA_API_KEY: "short", PORT: "0" }),
    /ONDA_API_KEY/,
  );
  await assert.rejects(
    () => startCloudServer({ ONDA_API_KEY: apiKey, PORT: "0", ONDA_ALLOWED_ORIGINS: "*" }),
    /exact HTTPS origins/,
  );
  await assert.rejects(
    () =>
      startCloudServer({ ONDA_API_KEY: apiKey, PORT: "0", ONDA_ALLOWED_ORIGINS: origin + "/apps" }),
    /exact HTTPS origins/,
  );
});

test(
  "Internet Archive single audio metadata produces a real M4A through the authenticated API",
  { skip: requiresTools },
  async () => {
    const fixture = await fixtureServer({ archiveSingle: true });
    try {
      const response = await start(
        fixture.base,
        alice,
        "https://archive.org/details/testmp3testfile",
      );
      assert.equal(response.status, 202);
      const job = await ready(fixture.base, (await response.json()).id, alice);
      assert.equal(job.state, "ready", JSON.stringify(job));
      assert.equal(job.provider, "archive");
      assert.equal(job.result.type, "audio/mp4");
      const result = await fetch(
        fixture.base + "/jobs/" + job.id + "/result?download_token=" + job.downloadToken,
      );
      assert.equal(result.status, 200);
      assert.ok(
        Buffer.from(await result.arrayBuffer())
          .subarray(0, 40)
          .includes(Buffer.from("ftyp")),
      );
    } finally {
      await fixture.close();
    }
  },
);

test("health reports bounded download tests while jobs wait, without a public test trigger", async () => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const instance = await startCloudServer(
    {
      ONDA_API_KEY: apiKey,
      PORT: "0",
      HOST: "127.0.0.1",
      ONDA_RUN_SOURCE_CHECK: "true",
      ONDA_RUN_DOWNLOAD_TESTS: "true",
    },
    {
      logger: quiet,
      downloadRunner: async () => {
        await gate;
        return { bytes: 1234, type: "audio/mp4", sha256: "b".repeat(64), verifiedAudio: true };
      },
    },
  );
  const host = "http://127.0.0.1:" + instance.server.address().port;
  try {
    const initial = await (await fetch(host + "/healthz")).json();
    assert.equal(initial.downloadChecks.status, "running");
    assert.equal((await start(host + "/v1/media", alice)).status, 409);
    finish();
    let result;
    for (let i = 0; i < 30; i++) {
      result = await (await fetch(host + "/healthz")).json();
      if (result.downloadChecks.status === "complete") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(result.downloadChecks.status, "complete");
    assert.equal(result.downloadChecks.passed, 6);
    assert.equal(result.sourceCheck.status, "passed");
    assert.equal(JSON.stringify(result).includes(apiKey), false);
    assert.equal(
      (await fetch(host + "/healthz", { method: "POST", headers: options(alice).headers })).status,
      404,
    );
  } finally {
    finish();
    await instance.close();
  }
});

test(
  "cloud stops videos and playlists after a source restriction without changing format or requesting the next track",
  {
    skip: requiresTools,
    timeout: 30000,
  },
  async () => {
    for (const [failure, code] of [
      ["ERROR: [youtube] Sign in to confirm you’re not a bot (HTTP Error 403)", "source-challenge"],
      ["ERROR: HTTP Error 429: Too Many Requests", "rate-limit"],
    ]) {
      const fixture = await fixtureServer({ failure, limits: { parallel: 1 } });
      try {
        let response = await start(
          fixture.base,
          alice,
          "https://www.youtube.com/watch?v=aaaaaaaaaaa&list=RDaaaaaaaaaaa&start_radio=1",
        );
        assert.equal(response.status, 202);
        const video = await ready(fixture.base, (await response.json()).id, alice);
        assert.equal(video.state, "error");
        assert.equal(video.code, code);
        assert.deepEqual(await fixture.downloadCalls(), [
          "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        ]);
        response = await start(
          fixture.base,
          alice,
          "https://www.youtube.com/playlist?list=PL0123456789",
        );
        assert.equal(response.status, 202);
        const list = await ready(fixture.base, (await response.json()).id, alice);
        assert.equal(list.state, "error");
        assert.equal(list.code, code);
        assert.deepEqual(await fixture.downloadCalls(), [
          "https://www.youtube.com/watch?v=aaaaaaaaaaa",
          "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        ]);
      } finally {
        await fixture.close();
      }
    }
  },
);

test("health stays available while one startup probe runs and exposes only sanitized results", async () => {
  let resolveProbe,
    probeCalls = 0,
    probeSignal;
  const gate = new Promise((resolve) => {
    resolveProbe = resolve;
  });
  const instance = await startCloudServer(
    { ONDA_API_KEY: apiKey, PORT: "0", HOST: "127.0.0.1", ONDA_RUN_SOURCE_CHECK: "true" },
    {
      logger: quiet,
      probe: async (_env, { signal }) => {
        probeCalls++;
        probeSignal = signal;
        return gate;
      },
    },
  );
  try {
    const host = "http://127.0.0.1:" + instance.server.address().port;
    let response = await fetch(host + "/healthz", { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal((await response.json()).sourceCheck.status, "checking");
    const pending = await start(host + "/v1/media", alice);
    assert.equal(pending.status, 409);
    assert.equal((await pending.json()).code, "source-check");
    resolveProbe({
      status: "blocked",
      provider: "unexpected",
      message: apiKey + " /private/path",
      code: "rate-limit",
      elapsedMs: 125,
      checkedAt: "2026-11-13T00:00:00.000Z",
      bytes: 64,
      path: "/secret",
    });
    for (let index = 0; index < 30; index++) {
      const health = await (await fetch(host + "/healthz")).json();
      if (health.sourceCheck.status !== "checking") {
        assert.equal(health.sourceCheck.status, "blocked");
        assert.equal(health.sourceCheck.provider, "youtube");
        assert.equal(health.sourceCheck.bytes, 64);
        assert.equal(health.sourceCheck.code, "rate-limit");
        assert.equal(health.sourceCheck.elapsedMs, 125);
        assert.match(health.sourceCheck.message, /limitó las solicitudes/);
        assert.equal(JSON.stringify(health).includes(apiKey), false);
        assert.equal(JSON.stringify(health).includes("/secret"), false);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(instance.sourceCheck.status, "blocked");
    await fetch(host + "/healthz");
    assert.equal(probeCalls, 1);
  } finally {
    resolveProbe({ status: "failed" });
    await instance.close();
  }
  assert.equal(probeSignal.aborted, true);
});

test("public source diagnostics discard unrecognized error codes and invalid durations", async () => {
  const instance = await startCloudServer(
    { ONDA_API_KEY: apiKey, PORT: "0", HOST: "127.0.0.1", ONDA_RUN_SOURCE_CHECK: "true" },
    {
      logger: quiet,
      probe: async () => ({
        status: "failed",
        code: apiKey,
        elapsedMs: -1,
        message: "private error " + apiKey,
      }),
    },
  );
  try {
    const response = await fetch("http://127.0.0.1:" + instance.server.address().port + "/healthz");
    const { sourceCheck } = await response.json();
    assert.equal(sourceCheck.status, "failed");
    assert.equal(sourceCheck.code, undefined);
    assert.equal(sourceCheck.elapsedMs, undefined);
    assert.equal(JSON.stringify(sourceCheck).includes(apiKey), false);
  } finally {
    await instance.close();
  }
});

test(
  "cloud CORS and authentication isolate devices; artifact capabilities cannot read status or another job",
  {
    skip: requiresTools,
    timeout: 30000,
  },
  async () => {
    const fixture = await fixtureServer();
    const { base } = fixture;
    try {
      let response = await fetch(base + "/status", { headers: { Origin: origin } });
      assert.equal(response.status, 401);
      response = await fetch(base + "/status", {
        headers: { ...options(alice).headers, Origin: "https://evil.example" },
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      response = await fetch(base + "/status", options(alice));
      const initial = await response.json();
      assert.equal(initial.job, null);
      assert.equal(initial.uploads, false);
      assert.equal(initial.convert, false);
      assert.equal(response.headers.get("access-control-allow-credentials"), null);
      response = await fetch(base + "/jobs", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,x-onda-client,content-type",
        },
      });
      assert.equal(response.status, 204);
      assert.match(response.headers.get("access-control-allow-headers"), /X-Onda-Client/);
      response = await fetch(base + "/jobs", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "PATCH" },
      });
      assert.equal(response.status, 405);
      response = await fetch(base + "/jobs", {
        method: "POST",
        headers: {
          ...options(alice).headers,
          "Content-Type": "application/octet-stream",
          "X-Onda-Format": "m4a",
          "X-Onda-Filename": "private.mp3",
        },
        body: Buffer.from("private file"),
      });
      assert.equal(response.status, 415, "cloud never accepts a device's audio upload");

      response = await start(base, alice);
      assert.equal(response.status, 202);
      const first = await ready(base, (await response.json()).id, alice);
      assert.equal(first.state, "ready", JSON.stringify(first));
      assert.match(first.downloadToken, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(JSON.stringify(first).includes(tmpdir()), false);
      assert.equal((await (await fetch(base + "/status", options(bob))).json()).job, null);
      assert.equal((await fetch(base + "/jobs/" + first.id, options(bob))).status, 404);
      assert.equal(
        (await fetch(base + "/jobs/" + first.id, { headers: { Origin: origin } })).status,
        401,
      );
      const token = "?download_token=" + first.downloadToken;
      const audio = await fetch(base + "/jobs/" + first.id + "/result" + token);
      assert.equal(audio.status, 200);
      assert.equal(audio.headers.get("content-type"), "audio/mp4");
      assert.equal(audio.headers.get("cache-control"), "no-store");
      assert.equal(audio.headers.get("referrer-policy"), "no-referrer");
      assert.equal((await audio.arrayBuffer()).byteLength, first.result.size);
      assert.equal(
        (await fetch(base + "/jobs/" + first.id + token, { headers: { Origin: origin } })).status,
        401,
      );
      assert.equal(
        (
          await fetch(base + "/jobs/" + first.id + "/result" + token, {
            headers: { Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + "/jobs/" + first.id + token, {
            method: "DELETE",
            headers: { Origin: origin },
          })
        ).status,
        401,
      );
      response = await start(base, bob);
      assert.equal(response.status, 202);
      const second = await ready(base, (await response.json()).id, bob);
      assert.equal(second.state, "ready", JSON.stringify(second));
      assert.equal(
        (await fetch(base + "/jobs/" + second.id + "/result?download_token=" + first.downloadToken))
          .status,
        401,
      );
      assert.equal((await (await fetch(base + "/status", options(alice))).json()).job.id, first.id);
    } finally {
      await fixture.close();
    }
  },
);

test(
  "cloud enforces global concurrency, per-device starts and absolute capability expiry",
  {
    skip: requiresTools,
    timeout: 30000,
  },
  async () => {
    const fixture = await fixtureServer({
      limits: { perOwnerStarts: 1, rateWindowMs: 5000, resultLifetimeMs: 800 },
    });
    const { base } = fixture;
    try {
      let response = await start(base, alice, "https://youtu.be/zzzzzzzzzzz");
      assert.equal(response.status, 202);
      const jobId = (await response.json()).id;
      response = await start(base, bob);
      assert.equal(response.status, 409);
      assert.equal((await fetch(base + "/jobs/" + jobId, options(bob))).status, 404);
      response = await fetch(base + "/jobs/" + jobId, { method: "DELETE", ...options(alice) });
      assert.equal(response.status, 202);
      assert.equal((await ready(base, jobId, alice)).state, "cancelled");
      response = await start(base, alice);
      assert.equal(response.status, 429);
      assert.equal((await response.json()).code, "rate-limit");
      response = await start(base, bob);
      assert.equal(response.status, 202);
      const job = await ready(base, (await response.json()).id, bob);
      assert.equal(job.state, "ready", JSON.stringify(job));
      const href = base + "/jobs/" + job.id + "/result?download_token=" + job.downloadToken;
      const audio = await fetch(href);
      assert.equal(audio.status, 200);
      await audio.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 850));
      assert.equal((await fetch(href)).status, 401);
      assert.equal(
        (await (await fetch(base + "/status", options(bob))).json()).job,
        null,
        "reading an artifact does not extend a cloud token's expiry",
      );
    } finally {
      await fixture.close();
    }
  },
);

test(
  "cloud bounds input bytes, processing deadlines and output audio size",
  {
    skip: requiresTools,
    timeout: 30000,
  },
  async () => {
    const fixture = await fixtureServer({ limits: { maxAudioBytes: 1024, maxDurationMs: 300 } });
    const { base } = fixture;
    try {
      let response = await fetch(base + "/jobs", {
        method: "POST",
        headers: { ...options(alice).headers, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "x".repeat(5000), format: "m4a" }),
      });
      assert.equal(response.status, 413);
      response = await start(base, alice, "https://youtu.be/zzzzzzzzzzz");
      assert.equal(response.status, 202);
      const timed = await ready(base, (await response.json()).id, alice);
      assert.equal(timed.state, "error");
      assert.equal(timed.code, "timeout");
      assert.equal(timed.result, undefined);
    } finally {
      await fixture.close();
    }
    const size = await fixtureServer({ limits: { maxAudioBytes: 1024 } });
    try {
      const response = await start(size.base, alice);
      assert.equal(response.status, 202);
      const job = await ready(size.base, (await response.json()).id, alice);
      assert.equal(job.state, "error");
      assert.match(job.message, /límite/);
      assert.equal(job.result, undefined);
    } finally {
      await size.close();
    }
  },
);
