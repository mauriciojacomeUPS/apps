import { useEffect, useRef } from "react";
import { playbackSnapshot } from "./playback-state.js";

export default function usePlaybackPersistence({
  state,
  ready,
  storageKey,
  audio,
  pendingSeek,
  onError,
}) {
  const latest = useRef(state),
    warned = useRef(false),
    writer = useRef(() => {});
  latest.current = state;
  writer.current = () => {
    if (!ready) return;
    const value = latest.current,
      player = audio.current;
    let position =
      pendingSeek.current?.queueId === value.current.queueId
        ? pendingSeek.current.position
        : player?.isConnected && Number.isFinite(player.currentTime)
          ? player.currentTime
          : value.progress;
    if (player?.ended) position = 0;
    try {
      localStorage.setItem(storageKey, JSON.stringify(playbackSnapshot({ ...value, position })));
    } catch {
      if (!warned.current) {
        warned.current = true;
        onError("No se pudo guardar el punto de reproducción en este navegador.");
      }
    }
  };
  useEffect(() => {
    if (!ready) return;
    const save = () => writer.current();
    const hidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    const timer = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      save();
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [ready, storageKey]);
  useEffect(() => {
    writer.current();
  }, [
    ready,
    state.queue,
    state.current.queueId,
    state.volume,
    state.shuffle,
    state.repeat,
    state.playing,
  ]);
}
