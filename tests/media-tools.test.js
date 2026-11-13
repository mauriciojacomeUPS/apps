import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";
import { mediaTools } from "../server/media-tools.js";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
test(
  "playlist jobs retain individual converted files as well as the ZIP, expire old references and enforce same-origin access",
  {
    skip:
      !ffmpeg || process.platform === "win32"
        ? "Requires FFmpeg and executable Unix fixtures"
        : false,
    timeout: 30000,
  },
  async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "onda-downloader-fixture-"));
    const executable = join(fixtureDir, "yt-dlp");
    const fixtures = [resolve("public/audio/sunset.mp3"), resolve("public/audio/bloom.mp3")];
    await writeFile(
      executable,
      "#!/usr/bin/env node\n" +
        [
          'const fs=require("node:fs");',
          "const args=process.argv.slice(2);",
          'if(args.includes("--dump-single-json")){console.log(JSON.stringify({title:"Playlist de prueba",entries:[{id:"aaaaaaaaaaa",title:"Sunset"},{id:"bbbbbbbbbbb",title:"Bloom"},{id:"ccccccccccc",title:"No disponible"}]}));process.exit(0);}',
          'const id=new URL(args.at(-1)).searchParams.get("v");',
          'if(id==="ccccccccccc"){console.error("Video unavailable");process.exit(1);}',
          'const index=id==="aaaaaaaaaaa"?0:1;',
          'const file=args[args.indexOf("-o")+1].replace("%(ext)s","mp3");',
          "fs.copyFileSync(" + JSON.stringify(fixtures) + "[index],file);",
          'console.log(JSON.stringify({filepath:file,title:index===0?"Sunset":"Bloom",artist:"Onda Studio"}));',
        ].join("\n"),
      { mode: 0o700 },
    );
    const server = await createServer({
      configFile: false,
      root: fixtureDir,
      base: "/apps/",
      logLevel: "silent",
      plugins: [mediaTools({ ONDA_YTDLP_PATH: executable })],
      server: { host: "127.0.0.1", port: 0 },
    });
    try {
      await server.listen();
      const origin = "http://127.0.0.1:" + server.httpServer.address().port;
      const base = origin + "/apps/__onda-media";
      const status = await (await fetch(base + "/status")).json();
      assert.equal(status.convert, true);
      assert.equal(status.youtube, true);
      assert.equal(
        (await fetch(base + "/status", { headers: { Origin: "https://other.example" } })).status,
        403,
      );
      const response = await fetch(base + "/jobs", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.youtube.com/playlist?list=PL0123456789",
          format: "m4a",
        }),
      });
      assert.equal(response.status, 202);
      let job = await response.json();
      for (let index = 0; job.state === "working" && index < 100; index++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        job = await (await fetch(base + "/jobs/" + job.id)).json();
      }
      assert.equal(job.state, "ready", JSON.stringify(job));
      assert.equal(job.saved, 2);
      assert.equal(job.skipped, 1);
      assert.equal(job.items.length, 2);
      assert.equal(
        JSON.stringify(job).includes(tmpdir()),
        false,
        "filesystem paths never cross the API boundary",
      );
      const zip = await fetch(base + "/jobs/" + job.id + "/result");
      assert.equal(zip.status, 200);
      assert.equal(
        Buffer.from(await zip.arrayBuffer())
          .subarray(0, 2)
          .toString(),
        "PK",
      );
      for (const item of job.items) {
        const audio = await fetch(base + "/jobs/" + job.id + "/tracks/" + item.id);
        assert.equal(audio.status, 200, "individual files remain after ZIP creation");
        assert.equal(audio.headers.get("content-type"), "audio/mp4");
        assert.match(audio.headers.get("content-disposition"), /attachment; filename="/);
        assert.equal((await audio.arrayBuffer()).byteLength, item.size);
      }
      assert.equal((await fetch(base + "/jobs/" + job.id + "/tracks/999")).status, 404);
      const next = await fetch(base + "/jobs", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://youtu.be/aaaaaaaaaaa", format: "mp3" }),
      });
      assert.equal(next.status, 202);
      assert.equal(
        (await fetch(base + "/jobs/" + job.id + "/tracks/0")).status,
        404,
        "a new job invalidates prior references",
      );
    } finally {
      await server.close();
      await rm(fixtureDir, { recursive: true, force: true });
    }
  },
);
