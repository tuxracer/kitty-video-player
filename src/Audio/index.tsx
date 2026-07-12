import { ProgressBar, Spinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import type { ReactElement } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { formatTime } from '../formatTime/index.ts';
import {
  BUFFERING_TEXT,
  LOADING_DELAY_MS,
  LOADING_TEXT,
  MIN_PROGRESS_BAR_WIDTH,
  MS_PER_SECOND,
  PAUSE_GLYPH,
  PERCENT_MAX,
  PLAY_GLYPH,
  PROGRESS_BAR_WIDTH,
  SEEK_STEP_MS,
} from './consts.ts';
import type { AudioProps, AudioRef } from './types.ts';
import { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';
import { useManagedResources } from './useManagedResources.ts';

export * from './consts.ts';
export * from './types.ts';
export { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';
export { useManagedResources } from './useManagedResources.ts';

export const Audio = forwardRef<AudioRef, AudioProps>((props, ref): ReactElement | null => {
  const {
    autoPlay = false,
    loop = false,
    muted: initialMuted = false,
    controls = true,
    keyboard = false,
    width,
    height = 1,
    children,
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onEnded,
    onError,
  } = props;
  const managed = useManagedResources({ src: props.src, onError });
  const [muted, setMuted] = useState(initialMuted);
  const mutedRef = useRef(initialMuted);
  const durationRef = useRef<number | null>(null);
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const metadataCallbackRef = useRef(onLoadedMetadata);
  metadataCallbackRef.current = onLoadedMetadata;
  const dispatchingMetadataRef = useRef(false);
  const metadataTransportRevisionRef = useRef(0);
  const metadataAutoplaySupersededRevisionRef = useRef(0);
  const clock = useAudioPlaybackClock({
    audio: managed.audio,
    durationMs: managed.durationMs,
    autoPlay: false,
    loop,
    onTimeUpdate,
    onPlay,
    onPause,
    onEnded,
    onError,
  });
  durationRef.current = managed.durationMs;
  const {
    play: playClock,
    pause: pauseClock,
    seekToMs: seekClockToMs,
    getElapsedMs,
  } = clock;

  const updateMuted = useCallback((value: boolean): void => {
    mutedRef.current = value;
    setMuted(value);
  }, []);
  const playAudio = useCallback((): void => {
    if (dispatchingMetadataRef.current) {
      metadataTransportRevisionRef.current += 1;
      metadataAutoplaySupersededRevisionRef.current = metadataTransportRevisionRef.current;
    }
    playClock();
  }, [playClock]);
  const pauseAudio = useCallback((): void => {
    if (dispatchingMetadataRef.current) {
      metadataTransportRevisionRef.current += 1;
      metadataAutoplaySupersededRevisionRef.current = metadataTransportRevisionRef.current;
    }
    pauseClock();
  }, [pauseClock]);
  const seekAudioToMs = useCallback(
    (targetMs: number): void => {
      if (dispatchingMetadataRef.current) {
        metadataTransportRevisionRef.current += 1;
      }
      seekClockToMs(targetMs);
    },
    [seekClockToMs],
  );

  useEffect(() => managed.audio?.setMuted(muted), [managed.audio, muted]);
  useEffect(() => updateMuted(initialMuted), [initialMuted, updateMuted]);
  useEffect(() => {
    if (managed.audio === null || managed.durationMs === null) {
      return;
    }
    const transportRevision = metadataTransportRevisionRef.current;
    dispatchingMetadataRef.current = true;
    try {
      metadataCallbackRef.current?.({ duration: managed.durationMs / MS_PER_SECOND });
    } finally {
      dispatchingMetadataRef.current = false;
    }
    if (
      autoPlayRef.current &&
      metadataAutoplaySupersededRevisionRef.current <= transportRevision
    ) {
      playClock();
    }
  }, [managed.audio, managed.durationMs, playClock]);

  useImperativeHandle(
    ref,
    () => ({
      play: (): Promise<void> => {
        playAudio();
        return Promise.resolve();
      },
      pause: pauseAudio,
      get currentTime(): number {
        return getElapsedMs() / MS_PER_SECOND;
      },
      set currentTime(seconds: number) {
        seekAudioToMs(seconds * MS_PER_SECOND);
      },
      get paused(): boolean {
        return !clock.playing;
      },
      get ended(): boolean {
        return clock.ended;
      },
      get muted(): boolean {
        return mutedRef.current;
      },
      set muted(value: boolean) {
        updateMuted(value);
      },
      get duration(): number {
        return durationRef.current === null ? Number.NaN : durationRef.current / MS_PER_SECOND;
      },
    }),
    [clock, getElapsedMs, pauseAudio, playAudio, seekAudioToMs, updateMuted],
  );

  const { exit } = useApp();
  useInput(
    (input, key) => {
      if (input === 'q' || (key.ctrl && input === 'c')) {
        void managed.audio?.close().catch(() => undefined);
        exit();
        return;
      }
      if (input === ' ') {
        clock.togglePlay();
        return;
      }
      if (input === 'm') {
        updateMuted(!mutedRef.current);
        return;
      }
      if (key.leftArrow) {
        clock.seekToMs(clock.getElapsedMs() - SEEK_STEP_MS);
        return;
      }
      if (key.rightArrow) {
        clock.seekToMs(clock.getElapsedMs() + SEEK_STEP_MS);
      }
    },
    { isActive: keyboard && managed.status === 'ready' },
  );

  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!controls || managed.status !== 'loading') {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [controls, managed.status]);

  const [showBuffering, setShowBuffering] = useState(false);
  useEffect(() => {
    if (!controls || !clock.buffering) {
      setShowBuffering(false);
      return;
    }
    const timer = setTimeout(() => setShowBuffering(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [clock.buffering, controls]);

  if (managed.status === 'error') {
    return <>{children}</>;
  }
  if (!controls) {
    return null;
  }
  if (managed.status === 'loading') {
    return (
      <Box width={width} height={height} justifyContent="center" alignItems="center">
        {showLoading ? <Spinner label={LOADING_TEXT} /> : null}
      </Box>
    );
  }

  const durationMs = managed.durationMs ?? 0;
  const progressPercent =
    durationMs > 0
      ? Math.min(Math.max(Math.round((clock.elapsedMs / durationMs) * PERCENT_MAX), 0), PERCENT_MAX)
      : 0;
  const timeText = `${formatTime(clock.elapsedMs)} / ${formatTime(durationMs)}`;
  const fixedWidth = PLAY_GLYPH.length + 1 + 1 + timeText.length;
  const progressWidth =
    width === undefined ? PROGRESS_BAR_WIDTH : Math.max(width - fixedWidth, MIN_PROGRESS_BAR_WIDTH);
  const effectiveWidth = width === undefined ? undefined : fixedWidth + progressWidth;

  return (
    <Box height={height} flexDirection="column" justifyContent="center">
      <Box>
        <Box width={effectiveWidth}>
          <Text>{clock.playing ? PLAY_GLYPH : PAUSE_GLYPH} </Text>
          <Box width={progressWidth}>
            {showBuffering ? (
              <Spinner
                label={progressWidth >= BUFFERING_TEXT.length + 2 ? BUFFERING_TEXT : undefined}
              />
            ) : (
              <ProgressBar value={progressPercent} />
            )}
          </Box>
          <Text> {timeText}</Text>
        </Box>
      </Box>
    </Box>
  );
});

Audio.displayName = 'Audio';
