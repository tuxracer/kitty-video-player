import { useCallback, useEffect, useRef, useState } from 'react';

import { AUDIO_TICK_MS, DRIFT_RESYNC_THRESHOLD_MS, MS_PER_SECOND } from './consts.ts';
import type { AudioPlaybackClock, AudioPlaybackClockOptions } from './types.ts';

export const useAudioPlaybackClock = ({
  audio,
  durationMs,
  autoPlay,
  loop,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onError,
}: AudioPlaybackClockOptions): AudioPlaybackClock => {
  const [playing, setPlaying] = useState(autoPlay);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const playingRef = useRef(autoPlay);
  const elapsedRef = useRef(0);
  const endedRef = useRef(false);
  const waitingRef = useRef(false);
  const anchorRef = useRef({ wallMs: 0, elapsedMs: 0 });

  const callbacksRef = useRef({ onTimeUpdate, onPlay, onPause, onEnded, onError });
  callbacksRef.current = { onTimeUpdate, onPlay, onPause, onEnded, onError };

  const audioRef = useRef(audio);
  audioRef.current = audio;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const readPlaying = useCallback((): boolean => playingRef.current, []);

  const reportTimeUpdate = useCallback((nextMs: number, previousMs: number): void => {
    const currentDurationMs = durationRef.current;
    if (
      currentDurationMs === null ||
      Math.floor(nextMs / MS_PER_SECOND) === Math.floor(previousMs / MS_PER_SECOND)
    ) {
      return;
    }
    callbacksRef.current.onTimeUpdate?.({
      currentTime: nextMs / MS_PER_SECOND,
      duration: currentDurationMs / MS_PER_SECOND,
    });
  }, []);

  const setPlayhead = useCallback(
    (nextMs: number, mirrorState: boolean): void => {
      const previousMs = elapsedRef.current;
      elapsedRef.current = nextMs;
      if (mirrorState) {
        setElapsedMs(nextMs);
      }
      reportTimeUpdate(nextMs, previousMs);
    },
    [reportTimeUpdate],
  );

  const startAt = useCallback((targetMs: number): void => {
    waitingRef.current = true;
    setBuffering(true);
    audioRef.current?.playFrom(targetMs);
  }, []);

  const pause = useCallback((): void => {
    if (!playingRef.current) {
      return;
    }
    playingRef.current = false;
    waitingRef.current = false;
    setPlaying(false);
    setBuffering(false);
    callbacksRef.current.onPause?.();
    if (!readPlaying()) {
      audioRef.current?.pause();
    }
  }, [readPlaying]);

  const play = useCallback((): void => {
    if (endedRef.current) {
      endedRef.current = false;
      setEnded(false);
      setPlayhead(0, true);
    }
    if (playingRef.current) {
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    callbacksRef.current.onPlay?.();
    if (readPlaying() && audioRef.current !== null && durationRef.current !== null) {
      startAt(elapsedRef.current);
    }
  }, [readPlaying, setPlayhead, startAt]);

  const togglePlay = useCallback((): void => {
    if (playingRef.current) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  const seekToMs = useCallback(
    (targetMs: number): void => {
      const currentDurationMs = durationRef.current;
      if (currentDurationMs === null) {
        return;
      }
      const clampedMs = Math.min(Math.max(targetMs, 0), currentDurationMs);
      endedRef.current = false;
      setEnded(false);
      setPlayhead(clampedMs, true);
      if (playingRef.current) {
        startAt(clampedMs);
      } else {
        waitingRef.current = false;
        setBuffering(false);
        audioRef.current?.pause();
      }
    },
    [setPlayhead, startAt],
  );

  useEffect(() => {
    elapsedRef.current = 0;
    setElapsedMs(0);
    endedRef.current = false;
    setEnded(false);
    waitingRef.current = false;
    setBuffering(false);

    if (audio === null || durationMs === null) {
      return () => {
        audio?.pause();
      };
    }

    if (playingRef.current) {
      startAt(0);
    }

    const interval = setInterval(() => {
      if (!playingRef.current || audioRef.current === null || durationRef.current === null) {
        return;
      }
      if (waitingRef.current) {
        if (audioRef.current.isStarting()) {
          return;
        }
        waitingRef.current = false;
        setBuffering(false);
        anchorRef.current = { wallMs: Date.now(), elapsedMs: elapsedRef.current };
        return;
      }

      const nextMs = anchorRef.current.elapsedMs + (Date.now() - anchorRef.current.wallMs);
      const currentDurationMs = durationRef.current;
      if (nextMs < currentDurationMs) {
        const previousSecond = Math.floor(elapsedRef.current / MS_PER_SECOND);
        const nextSecond = Math.floor(nextMs / MS_PER_SECOND);
        setPlayhead(nextMs, nextSecond !== previousSecond);
        if (!readPlaying()) {
          return;
        }
        if (nextSecond !== previousSecond) {
          const audioPositionMs = audioRef.current.getPositionMs();
          if (
            audioPositionMs !== null &&
            Math.abs(audioPositionMs - nextMs) > DRIFT_RESYNC_THRESHOLD_MS
          ) {
            startAt(nextMs);
          }
        }
        return;
      }

      if (loopRef.current && currentDurationMs > 0) {
        const wrappedMs = nextMs % currentDurationMs;
        setPlayhead(wrappedMs, true);
        if (!readPlaying()) {
          return;
        }
        startAt(wrappedMs);
        return;
      }

      setPlayhead(currentDurationMs, true);
      playingRef.current = false;
      waitingRef.current = false;
      endedRef.current = true;
      setPlaying(false);
      setBuffering(false);
      setEnded(true);
      callbacksRef.current.onPause?.();
      callbacksRef.current.onEnded?.();
      if (!readPlaying()) {
        audioRef.current.pause();
      }
    }, AUDIO_TICK_MS);

    return () => {
      clearInterval(interval);
      audio.pause();
    };
  }, [audio, durationMs, readPlaying, setPlayhead, startAt]);

  const getElapsedMs = useCallback((): number => elapsedRef.current, []);

  return {
    playing,
    elapsedMs,
    ended,
    buffering,
    play,
    pause,
    togglePlay,
    seekToMs,
    getElapsedMs,
  };
};
