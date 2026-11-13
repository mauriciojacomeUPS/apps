import test from "node:test";
import assert from "node:assert/strict";
import { MediaError, youtubeSource, youtubeError } from "../server/media-processing.js";

test("canonicalizes video and playlist links before handing them to the downloader", () => {
  const video = { url: "https://www.youtube.com/watch?v=2eZVbrO6Z1M", playlist: false };
  assert.deepEqual(youtubeSource("https://youtu.be/2eZVbrO6Z1M?si=test"), video);
  assert.deepEqual(youtubeSource("https://www.youtube.com/shorts/2eZVbrO6Z1M"), video);
  assert.deepEqual(
    youtubeSource("https://music.youtube.com/watch?v=2eZVbrO6Z1M&list=PLexample"),
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
});
