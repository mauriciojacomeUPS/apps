// Queue entries have their own identity: the same song can be queued twice.
export const makeQueue = (tracks) =>
  tracks.map((track) => ({ ...track, queueId: crypto.randomUUID() }));

export const activeQueueIndex = (queue, current) =>
  current?.queueId ? queue.findIndex((entry) => entry.queueId === current.queueId) : -1;

export const upcomingEntries = (queue, current) =>
  queue.slice(activeQueueIndex(queue, current) + 1);

export function moveUpcoming(queue, current, entryId, direction) {
  const index = queue.findIndex((entry) => entry.queueId === entryId);
  const target = index + direction;
  const first = activeQueueIndex(queue, current) + 1;
  if (index < first || target < first || target >= queue.length) return queue;
  const result = [...queue];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export const clearUpcoming = (queue, current) =>
  queue.slice(0, activeQueueIndex(queue, current) + 1);

export function shuffleUpcoming(queue, current) {
  const first = activeQueueIndex(queue, current) + 1;
  const result = [...queue];
  for (let i = result.length - 1; i > first; i--) {
    const j = first + Math.floor(Math.random() * (i - first + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
