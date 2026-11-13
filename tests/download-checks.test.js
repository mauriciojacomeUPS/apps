import test from "node:test";
import assert from "node:assert/strict";
import { runDownloadChecks } from "../server/download-checks.js";
import { networkObservation } from "../server/cobalt-network-observer.js";
import { MediaError, mediaSourceError } from "../server/media-processing.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const verified = { bytes: 4000, type: "audio/mp4", sha256: "a".repeat(64), verifiedAudio: true };

test("real checks require verified audio, redact unexpected failures and stop the provider after denial", async () => {
  const calls = [],
    updates = [];
  const result = await runDownloadChecks(
    {},
    {
      onUpdate: (value) => updates.push(value),
      runner: async (_env, row) => {
        calls.push(row.id);
        if (row.id === "youtube-cobalt")
          throw new MediaError("YouTube pide una verificación.", "source-challenge");
        if (row.id === "archive") return { ...verified, privateValue: "must-not-leak" };
        if (row.id === "soundcloud") return { bytes: 4000 };
        throw new Error("private-path access_token=must-not-leak");
      },
    },
  );
  assert.deepEqual(calls, ["youtube-cobalt", "archive", "soundcloud", "bandcamp", "vimeo"]);
  assert.equal(result.status, "complete");
  assert.deepEqual([result.passed, result.failed, result.skipped], [1, 4, 1]);
  assert.equal(result.results[3].code, "audio-unverified");
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.equal(updates[0].results[0].status, "pending");
  assert.equal(result.results[2].verifiedAudio, true);
});

for (const status of [403, 429])
  test(`a Cobalt player ${status} distinguishes one engine's rejection from a provider rate limit`, async () => {
    const network = [],
      calls = [];
    const result = await runDownloadChecks(
      { ONDA_COBALT_YOUTUBE_CLIENT: "ANDROID" },
      {
        cobaltNetwork: () => network,
        runner: async (_env, row) => {
          calls.push(row.id);
          if (row.id === "youtube-cobalt") {
            network.push({
              sequence: 1,
              origin: "https://www.youtube.com",
              path: "/youtubei/v1/player",
              status,
              error: null,
            });
            throw Object.assign(new MediaError("No audio.", "source-unavailable"), {
              upstreamCode: "error.api.fetch.fail",
            });
          }
          return verified;
        },
      },
    );
    assert.equal(calls.includes("youtube-ytdlp"), status === 403);
    assert.equal(result.results[0].code, status === 403 ? "source-forbidden" : "rate-limit");
    assert.equal(result.results[0].upstreamCode, "error.api.fetch.fail");
    assert.equal(result.results[0].client, "ANDROID");
    assert.equal(result.results[0].network[0].status, status);
    assert.equal(result.passed, status === 403 ? 5 : 4);
  });

test("download tests cancel on timeout and stop when the server shuts down", async () => {
  const wait = async (_env, _row, signal) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      const handle = setTimeout(resolve, 1000);
      signal.addEventListener("abort", () => clearTimeout(handle), { once: true });
    });
  const result = await runDownloadChecks(
    {},
    { runner: wait, caseTimeoutMs: 10, totalTimeoutMs: 25 },
  );
  assert.equal(result.passed, 0);
  assert.ok(result.failed > 0);
  assert.ok(result.skipped > 0);
  assert.ok(result.results.filter((r) => r.status === "failed").every((r) => r.code === "timeout"));
  const controller = new AbortController();
  const promise = runDownloadChecks({}, { signal: controller.signal, runner: wait });
  controller.abort();
  await assert.rejects(promise);
});

test("network diagnostics omit signed queries, headers, account data and unrelated hosts", () => {
  const observed = networkObservation(
    {
      origin: "https://rr1.googlevideo.com",
      path: "/videoplayback?sig=must-not-leak",
      headers: "Authorization: must-not-leak",
    },
    403,
  );
  assert.deepEqual(observed, {
    origin: "https://rr1.googlevideo.com",
    path: "/videoplayback",
    status: 403,
    error: null,
  });
  assert.equal(
    networkObservation({ origin: "https://other.example.com", path: "/private" }, 200),
    null,
  );
  assert.equal(networkObservation({ origin: "not a URL" }, 200), null);
  assert.equal(
    networkObservation({ origin: "https://www.youtube.com" }, null, { code: "private/value" })
      .error,
    "NETWORK_ERROR",
  );
});

test("the diagnostic child stops observing before ordinary downloads", async () => {
  const script = `
    const dc=require('node:diagnostics_channel');
    const channel=dc.channel('undici:request:headers');
    channel.publish({request:{origin:'https://www.youtube.com',path:'/youtubei/v1/player?key=private-value'},response:{statusCode:403}});
    process.on('disconnect',()=>{
      console.log(JSON.stringify({subscribed:channel.hasSubscribers}));
    });
  `;
  const child = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(new URL("../server/cobalt-network-observer.js", import.meta.url)),
      "-e",
      script,
    ],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const exited = once(child, "exit");
  try {
    const [message] = await once(child, "message");
    assert.equal(message.status, 403);
    assert.equal(message.path, "/youtubei/v1/player");
    assert.equal(JSON.stringify(message).includes("private-value"), false);
    child.send({ kind: "onda-stop-diagnostics" });
    const [code] = await exited;
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(output), { subscribed: false });
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

test("source errors refer to the actual provider and never expose extractor details", () => {
  for (const [stderr, code] of [
    ["CERTIFICATE_VERIFY_FAILED", "source-tls"],
    ["Tunnel connection failed: 403", "proxy-blocked"],
    ["Sign in to access", "access-required"],
    ["HTTP Error 429", "rate-limit"],
  ]) {
    const error = mediaSourceError(
      { stderr: stderr + " /private/file token=must-not-leak" },
      "archive",
    );
    assert.equal(error.code, code);
    assert.match(error.message, /Internet Archive/);
    assert.equal(/YouTube|must-not-leak/.test(error.message), false);
  }
});
