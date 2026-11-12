import test from "node:test";
import assert from "node:assert/strict";
import {
  playbackSnapshot,
  readPlayback,
  restorePlayback,
  recordListen,
} from "../src/playback-state.js";

const tracks = [
  { id: "a", title: "Alpha", source: "local" },
  { id: "b", title: "Beta" },
];
test("playback snapshots retain duplicate queue positions and preferences without serializing audio", () => {
  const queue = [
    { ...tracks[0], queueId: "first", audioUrl: "blob:expired", file: new Blob(["audio"]) },
    { ...tracks[1], queueId: "second" },
    { ...tracks[0], queueId: "third" },
  ];
  const snapshot = playbackSnapshot({
    queue,
    current: queue[2],
    position: 18.5,
    volume: 0,
    shuffle: true,
    repeat: true,
  });
  assert.equal(JSON.stringify(snapshot).includes("blob:"), false);
  assert.equal(JSON.stringify(snapshot).includes("audio"), false);
  const restored = restorePlayback(snapshot, tracks);
  assert.deepEqual(
    restored.queue.map((item) => item.id),
    ["a", "b", "a"],
  );
  assert.equal(restored.current.queueId, "third");
  assert.equal(restored.position, 18.5);
  assert.equal(restored.volume, 0);
  assert.equal(restored.shuffle, true);
  assert.equal(restored.repeat, true);
  assert.equal("playing" in restored, false);
});
test("restoration removes unavailable files, resets a missing current position and repairs repeated queue IDs", () => {
  const snapshot = {
    current: { trackId: "gone", queueId: "gone" },
    queue: [
      { trackId: "gone", queueId: "gone" },
      { trackId: "b", queueId: "same" },
      { trackId: "b", queueId: "same" },
    ],
    position: 90,
    volume: 2,
  };
  const restored = restorePlayback(snapshot, tracks);
  assert.equal(restored.missingCurrent, true);
  assert.equal(restored.current.id, "b");
  assert.equal(restored.position, 0);
  assert.equal(restored.volume, 1);
  assert.equal(new Set(restored.queue.map((item) => item.queueId)).size, 2);
  assert.equal(readPlayback({ getItem: () => "{invalid" }, "key"), null);
  assert.equal(
    readPlayback({ getItem: () => JSON.stringify({ version: 2, queue: [] }) }, "key"),
    null,
  );
});
test("listening history records actual entries in recency order and bounds storage", () => {
  let history = recordListen([], "a", 1);
  history = recordListen(history, "b", 2);
  history = recordListen(history, "a", 3);
  assert.deepEqual(history, [
    { trackId: "a", playedAt: 3, plays: 2 },
    { trackId: "b", playedAt: 2, plays: 1 },
  ]);
  assert.equal(
    recordListen(
      Array.from({ length: 500 }, (_, i) => ({ trackId: String(i), plays: 1 })),
      "new",
    ).length,
    500,
  );
});
