import test from "node:test";
import assert from "node:assert/strict";
import { MediaError, youtubeSource } from "../server/media-processing.js";

test("canonicalizes video and playlist links before handing them to the downloader", () => {
  const video = { url: "https://www.youtube.com/watch?v=2eZVbrO6Z1M", playlist: false };
  assert.deepEqual(youtubeSource("https://youtu.be/2eZVbrO6Z1M?si=test"), video);
  assert.deepEqual(youtubeSource("https://www.youtube.com/shorts/2eZVbrO6Z1M"), video);
  assert.deepEqual(youtubeSource("https://music.youtube.com/watch?v=2eZVbrO6Z1M&list=PLexample"), video);
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
