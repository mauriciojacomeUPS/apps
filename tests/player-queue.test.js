import test from "node:test";
import assert from "node:assert/strict";
import {
  makeQueue,
  activeQueueIndex,
  upcomingEntries,
  moveUpcoming,
  clearUpcoming,
  shuffleUpcoming,
} from "../src/player-queue.js";
const songs = [
  { id: "one", title: "One" },
  { id: "two", title: "Two" },
  { id: "three", title: "Three" },
];
test("repeated songs retain independent queue identity and upcoming positions", () => {
  const queue = makeQueue([songs[0], songs[1], songs[0]]);
  assert.equal(new Set(queue.map((t) => t.queueId)).size, 3);
  assert.equal(activeQueueIndex(queue, queue[2]), 2);
  assert.equal(upcomingEntries(queue, queue[2]).length, 0);
  assert.equal(upcomingEntries(queue, queue[0])[1].id, "one");
  assert.equal("queueId" in songs[0], false);
});
test("moving and clearing upcoming songs preserve playback and history", () => {
  const queue = makeQueue([songs[0], songs[1], songs[2], songs[0]]),
    current = queue[1];
  const moved = moveUpcoming(queue, current, queue[3].queueId, -1);
  assert.deepEqual(moved.slice(0, 2), queue.slice(0, 2));
  assert.equal(moved[2].queueId, queue[3].queueId);
  assert.equal(moveUpcoming(queue, current, queue[2].queueId, -1), queue);
  assert.deepEqual(clearUpcoming(moved, current), queue.slice(0, 2));
  assert.equal(queue[2].id, "three");
});
test("shuffle retains the current entry and every pending occurrence", () => {
  const queue = makeQueue([...songs, ...songs]),
    current = queue[1];
  const shuffled = shuffleUpcoming(queue, current);
  assert.deepEqual(shuffled.slice(0, 2), queue.slice(0, 2));
  assert.deepEqual(
    shuffled
      .slice(2)
      .map((t) => t.queueId)
      .sort(),
    queue
      .slice(2)
      .map((t) => t.queueId)
      .sort(),
  );
});
