import { ProgressBar, Spinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import type { ReactElement } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { formatTime } from '../formatTime/index.ts';
import {
  BUFFERING_TEXT,
  CONTROLS_ROWS,
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
import type { AudioPlayerViewProps, AudioRef } from './types.ts';
import { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';
import { useAudioVisualRenderer } from './useAudioVisualRenderer.ts';

export const AudioPlayerView = forwardRef<AudioRef, AudioPlayerViewProps>(
  (props, ref): ReactElement | null => {
    const {
      audio,
      durationMs,
      resourceStatus,
      autoPlay,
      loop,
      muted: initialMuted,
      controls,
      keyboard,
      width,
      height,
      visualStatus,
      visualSource,
      visualInfo,
      visualScreen,
      visualRows,
      visualLabel,
      onVisualError,
      onLoadedMetadata,
      onQuit,
      children,
      onTimeUpdate,
      onPlay,
      onPause,
      onEnded,
      onError,
    } = props;
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
    const hasLoadedMetadataRef = useRef(false);
    const clock = useAudioPlaybackClock({
      audio,
      durationMs,
      autoPlay: false,
      loop,
      startBlocked: true,
      onTimeUpdate,
      onPlay,
      onPause,
      onEnded,
      onError,
    });
    durationRef.current = durationMs;
    const {
      play: playClock,
      pause: pauseClock,
      seekToMs: seekClockToMs,
      releaseStart,
      getElapsedMs,
    } = clock;

    const { ready: visualReady, repaint: repaintVisual } = useAudioVisualRenderer({
      source: visualSource,
      info: visualInfo,
      screen: visualScreen,
      playing: clock.playing,
      getElapsedMs,
      onReady: () => {
        if (hasLoadedMetadataRef.current) {
          releaseStart();
        }
      },
      onVisualError,
    });
    const visualResolved =
      visualStatus === 'none' ||
      visualStatus === 'placeholder' ||
      (visualStatus === 'ready' && visualReady);
    const visualResolvedRef = useRef(visualResolved);
    visualResolvedRef.current = visualResolved;

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

    useEffect(() => audio?.setMuted(muted), [audio, muted]);
    useEffect(() => updateMuted(initialMuted), [initialMuted, updateMuted]);
    useEffect(() => {
      if (resourceStatus !== 'ready' || durationMs === null) {
        return;
      }
      const initialLoad = !hasLoadedMetadataRef.current;
      const transportRevision = metadataTransportRevisionRef.current;
      dispatchingMetadataRef.current = true;
      try {
        metadataCallbackRef.current?.({ duration: durationMs / MS_PER_SECOND });
      } finally {
        dispatchingMetadataRef.current = false;
      }
      hasLoadedMetadataRef.current = true;
      if (
        initialLoad &&
        autoPlayRef.current &&
        metadataAutoplaySupersededRevisionRef.current <= transportRevision
      ) {
        playClock();
      }
      if (visualResolvedRef.current) {
        releaseStart();
      }
    }, [audio, durationMs, playClock, releaseStart, resourceStatus]);

    useEffect(() => {
      if (hasLoadedMetadataRef.current && visualResolved) {
        releaseStart();
      }
    }, [releaseStart, visualResolved]);

    useEffect(() => {
      repaintVisual();
    }, [clock.elapsedMs, repaintVisual]);
    useEffect(() => {
      repaintVisual();
    }, [height, repaintVisual, width]);

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
          onQuit?.();
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
      { isActive: keyboard && resourceStatus === 'ready' },
    );

    const [showLoading, setShowLoading] = useState(false);
    useEffect(() => {
      if (!controls || resourceStatus !== 'loading') {
        setShowLoading(false);
        return;
      }
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }, [controls, resourceStatus]);

    const [showBuffering, setShowBuffering] = useState(false);
    useEffect(() => {
      if (!controls || !clock.buffering) {
        setShowBuffering(false);
        return;
      }
      const timer = setTimeout(() => setShowBuffering(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }, [clock.buffering, controls]);

    if (resourceStatus === 'error') {
      return <>{children}</>;
    }
    const visualHeight =
      visualStatus === 'none' ? 0 : Math.max(0, height - (controls ? CONTROLS_ROWS : 0));
    if (!controls && visualHeight === 0) {
      return null;
    }

    const currentDurationMs = durationMs ?? 0;
    const progressPercent =
      currentDurationMs > 0
        ? Math.min(
            Math.max(Math.round((clock.elapsedMs / currentDurationMs) * PERCENT_MAX), 0),
            PERCENT_MAX,
          )
        : 0;
    const timeText = `${formatTime(clock.elapsedMs)} / ${formatTime(currentDurationMs)}`;
    const fixedWidth = PLAY_GLYPH.length + 1 + 1 + timeText.length;
    const progressWidth =
      width === undefined ? PROGRESS_BAR_WIDTH : Math.max(width - fixedWidth, MIN_PROGRESS_BAR_WIDTH);
    const effectiveWidth = width === undefined ? undefined : fixedWidth + progressWidth;

    const visualContent =
      visualStatus === 'ready' ? (
        <Box flexDirection="column">
          {visualRows.map((row, index) => (
            <Text key={index}>{row}</Text>
          ))}
        </Box>
      ) : visualStatus === 'placeholder' && visualLabel !== null ? (
        <Text>{visualLabel}</Text>
      ) : null;
    const controlsRow = controls ? (
      <Box height={CONTROLS_ROWS}>
        {resourceStatus === 'loading' ? (
          showLoading ? <Spinner label={LOADING_TEXT} /> : null
        ) : (
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
        )}
      </Box>
    ) : null;

    if (visualStatus === 'none') {
      return (
        <Box height={height} flexDirection="column" justifyContent="center">
          {controlsRow}
        </Box>
      );
    }

    return (
      <Box width={width} height={height} flexDirection="column">
        {visualHeight > 0 ? (
          <Box
            width={width}
            height={visualHeight}
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
          >
            {visualContent}
          </Box>
        ) : null}
        {controlsRow}
      </Box>
    );
  },
);

AudioPlayerView.displayName = 'AudioPlayerView';
