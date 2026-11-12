import { useEffect, useRef } from "react";
import { img } from "./data";
export default function useMediaControls({
  current,
  playing,
  progress,
  duration,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeek,
}) {
  const actions = useRef({});
  actions.current = { onPlay, onPause, onPrevious, onNext, onSeek };
  useEffect(() => {
    if (!navigator.mediaSession) return;
    const handlers = {
      play: () => actions.current.onPlay(),
      pause: () => actions.current.onPause(),
      previoustrack: () => actions.current.onPrevious(),
      nexttrack: () => actions.current.onNext(),
      seekto: (event) => actions.current.onSeek(event.seekTime),
      seekbackward: (event) =>
        actions.current.onSeek(Math.max(0, actions.current.position - (event.seekOffset || 10))),
      seekforward: (event) =>
        actions.current.onSeek(actions.current.position + (event.seekOffset || 10)),
    };
    for (const [name, handler] of Object.entries(handlers))
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {}
    return () => {
      for (const name of Object.keys(handlers))
        try {
          navigator.mediaSession.setActionHandler(name, null);
        } catch {}
    };
  }, []);
  actions.current.position = progress;
  useEffect(() => {
    if (!navigator.mediaSession || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: [{ src: new URL(img(current.cover), window.location.href).href }],
    });
  }, [current.id, current.title, current.artist, current.album, current.cover]);
  useEffect(() => {
    if (navigator.mediaSession)
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);
  useEffect(() => {
    if (!navigator.mediaSession?.setPositionState || !Number.isFinite(duration) || duration <= 0)
      return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(duration, Math.max(0, progress)),
        playbackRate: 1,
      });
    } catch {}
  }, [duration, progress]);
}
