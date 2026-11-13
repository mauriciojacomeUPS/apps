import test from "node:test";
import assert from "node:assert/strict";
import {
  MediaError,
  youtubeSource,
  youtubeError,
  runSourceProbe,
} from "../server/media-processing.js";

test("canonicalizes video and playlist links before handing them to the downloader", () => {
  const video = { url: "https://www.youtube.com/watch?v=2eZVbrO6Z1M", playlist: false };
  assert.deepEqual(youtubeSource("https://youtu.be/2eZVbrO6Z1M?si=test"), video);
  assert.deepEqual(youtubeSource("https://www.youtube.com/shorts/2eZVbrO6Z1M"), video);
  assert.deepEqual(
    youtubeSource("https://music.youtube.com/watch?v=2eZVbrO6Z1M&list=PLexample"),
    video,
  );
  assert.deepEqual(
    youtubeSource(
      "https://www.youtube.com/watch?v=2eZVbrO6Z1M&list=RD2eZVbrO6Z1M&start_radio=1&pp=ygUMI",
      { preferPlaylist: false },
    ),
    video,
  );
  assert.deepEqual(youtubeSource("https://www.youtube.com/playlist?list=PL0123456789&si=test"), {
    url: "https://www.youtube.com/playlist?list=PL0123456789",
    playlist: true,
  });
});

test("rejects other hosts, credentials, unsupported paths and invalid IDs", () => {
  for (const url of [
    "https://youtube.com.example.org/watch?v=2eZVbrO6Z1M",
    "https://local@www.youtube.com/watch?v=2eZVbrO6Z1M",
    "https://www.youtube.com:8080/watch?v=2eZVbrO6Z1M",
    "http://www.youtube.com/watch?v=2eZVbrO6Z1M",
    "https://www.youtube.com/redirect?q=http://127.0.0.1",
    "https://youtu.be/--output",
    "https://www.youtube.com/playlist?list=",
  ]) {
    assert.throws(() => youtubeSource(url), MediaError, url);
  }
});

test("video links containing a list process the whole playlist only when explicitly requested", () => {
  const url = "https://www.youtube.com/watch?v=2eZVbrO6Z1M&list=PL0123456789";
  assert.equal(youtubeSource(url).playlist, false);
  assert.deepEqual(youtubeSource(url, { preferPlaylist: true }), {
    url: "https://www.youtube.com/playlist?list=PL0123456789",
    playlist: true,
  });
  assert.throws(
    () =>
      youtubeSource("https://www.youtube.com/watch?v=2eZVbrO6Z1M&list=bad", {
        preferPlaylist: true,
      }),
    /playlist válida/,
  );
  assert.throws(() => youtubeSource("https://open.spotify.com/playlist/123"), /Spotify.*CSV/);
});

test("downloader distinguishes a blocked proxy from source rate limits and private access", () => {
  assert.equal(
    youtubeError({ stderr: "Tunnel connection failed: 403 Forbidden" }).code,
    "proxy-blocked",
  );
  assert.equal(youtubeError({ stderr: "HTTP Error 429: Too Many Requests" }).code, "rate-limit");
  assert.match(
    youtubeError({ stderr: "Sign in to access this private video" }).message,
    /requiere acceso/,
  );
  for (const [stderr, code] of [
    ["Sign in to confirm you’re not a bot", "source-challenge"],
    ["HTTP Error 403: complete a CAPTCHA", "source-challenge"],
    ["We detected unusual traffic", "source-challenge"],
    ["Sign in to access this private video", "access-required"],
    ["HTTP Error 403: Forbidden", "source-forbidden"],
    ["Requested format is not available", "formats-unavailable"],
    ["Unable to connect: connection reset", "source-network"],
    ["Video is unavailable", "source-unavailable"],
  ]) {
    const error = youtubeError({ stderr: stderr + " /private/path token=private-value" });
    assert.equal(error.code, code);
    assert.equal(error.message.includes("private-value"), false);
  }
});

test("startup probe reports missing executables separately from an unavailable source", async () => {
  const result = await runSourceProbe({
    ONDA_FFMPEG_PATH: "/missing-onda-tools/ffmpeg",
    ONDA_YTDLP_PATH: "/missing-onda-tools/yt-dlp",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "tools-unavailable");
  assert.ok(Number.isSafeInteger(result.elapsedMs) && result.elapsedMs >= 0);
  assert.equal(result.message.includes("missing-onda-tools"), false);
});

test("public source validation admits bounded provider URLs and rejects generic proxies, private or unsupported links", async () => {
  const { mediaSource } = await import("../server/media-processing.js");
  assert.deepEqual(mediaSource("https://soundcloud.com/banda/cancion?utm_source=x"), {
    provider: "soundcloud",
    url: "https://soundcloud.com/banda/cancion",
    playlist: false,
  });
  assert.equal(mediaSource("https://soundcloud.com/banda/sets/disco").playlist, true);
  assert.equal(mediaSource("https://banda.bandcamp.com/album/disco").playlist, true);
  assert.equal(mediaSource("https://banda.bandcamp.com/track/cancion").provider, "bandcamp");
  assert.deepEqual(mediaSource("https://player.vimeo.com/video/1234"), {
    provider: "vimeo",
    url: "https://vimeo.com/1234",
    playlist: false,
  });
  assert.equal(mediaSource("https://archive.org/details/public-audio").provider, "archive");
  for (const url of [
    "https://soundcloud.com.example.org/banda/cancion",
    "https://soundcloud.com/banda/cancion?secret_token=s-private",
    "https://soundcloud.com/redirect",
    "https://archive.org/download/item/list.m3u",
    "https://user:pass@vimeo.com/1234",
    "http://vimeo.com/1234",
    "https://vimeo.com:8443/1234",
    "https://127.0.0.1/private.mp3",
  ])
    assert.throws(() => mediaSource(url), undefined, url);
});
