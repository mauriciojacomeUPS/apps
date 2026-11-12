import { makeQueue } from "./player-queue.js";
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
export function playbackSnapshot({
  queue,
  current,
  position = 0,
  volume = 0.7,
  shuffle = false,
  repeat = false,
}) {
  return {
    version: 1,
    current: { trackId: current.id, queueId: current.queueId },
    queue: queue.map((entry) => ({ trackId: entry.id, queueId: entry.queueId })),
    position: Math.max(0, finite(position)),
    volume: Math.max(0, Math.min(1, finite(volume, 0.7))),
    shuffle: !!shuffle,
    repeat: !!repeat,
    savedAt: Date.now(),
  };
}
export function readPlayback(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (
      value?.version !== 1 ||
      !Array.isArray(value.queue) ||
      typeof value.current?.trackId !== "string"
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function restorePlayback(snapshot, tracks) {
  if (!snapshot) return null;
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const ids = new Set();
  let queue = snapshot.queue.flatMap((saved) => {
    const track = byId.get(saved?.trackId);
    if (!track) return [];
    let queueId = typeof saved.queueId === "string" ? saved.queueId : crypto.randomUUID();
    if (ids.has(queueId)) queueId = crypto.randomUUID();
    ids.add(queueId);
    return [{ ...track, queueId }];
  });
  let current = queue.find(
    (entry) => entry.queueId === snapshot.current.queueId && entry.id === snapshot.current.trackId,
  );
  const missingCurrent = !byId.has(snapshot.current.trackId);
  if (!current && !missingCurrent) {
    current = makeQueue([byId.get(snapshot.current.trackId)])[0];
    queue = [current, ...queue];
  }
  if (!current) current = queue[0];
  if (!current && tracks.length) {
    queue = makeQueue(tracks);
    current = queue[0];
  }
  if (!current) return null;
  return {
    queue,
    current,
    missingCurrent,
    position: missingCurrent ? 0 : Math.max(0, finite(snapshot.position)),
    volume: Math.max(0, Math.min(1, finite(snapshot.volume, 0.7))),
    shuffle: snapshot.shuffle === true,
    repeat: snapshot.repeat === true,
  };
}
export function recordListen(history, trackId, at = Date.now()) {
  const previous = history.find((item) => item.trackId === trackId);
  return [
    { trackId, playedAt: at, plays: (previous?.plays || 0) + 1 },
    ...history.filter((item) => item.trackId !== trackId),
  ].slice(0, 500);
}
