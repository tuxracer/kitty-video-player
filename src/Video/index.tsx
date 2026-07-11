import { ProgressBar } from '@inkjs/ui';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { ReactElement } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { formatTime } from '../formatTime/index.ts';
import { computePanelRegion } from '../playerLayout/index.ts';
import {
  HELP_TEXT,
  MS_PER_SECOND,
  PAUSE_GLYPH,
  PERCENT_MAX,
  PLAY_GLYPH,
  PLAYER_TITLE,
  PROGRESS_BAR_WIDTH,
  RESIZE_DEBOUNCE_MS,
  SEEK_STEP_MS,
} from './consts.ts';
import type { PlayerProps, VideoRef } from './types.ts';
import { usePlaybackClock } from './usePlaybackClock.ts';

export * from './consts.ts';
export * from './types.ts';
export { usePlaybackClock } from './usePlaybackClock.ts';

/**
 * Ink video component. kitty-motion owns the video pixels (pushed into
 * placeholder cells that Ink lays out as ordinary text). React state only
 * mirrors what the chrome displays, so Ink redraws about once per second
 * while frames update at the source frame rate.
 */
export const Video = forwardRef<VideoRef, PlayerProps>(
  (
    {
      screen,
      source,
      info,
      autoPlay = false,
      loop = false,
      controls = false,
      keyboard = false,
      title = false,
      help = false,
      onTimeUpdate,
      onLoadedMetadata,
      onPlay,
      onPause,
      onEnded,
      onError,
    },
    ref,
  ): ReactElement => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [placeholderRows, setPlaceholderRows] = useState<string[]>(() =>
    screen.getPlaceholderRows(),
  );

  const clock = usePlaybackClock({
    screen,
    source,
    info,
    autoPlay,
    loop,
    stderrNote: true,
    onTimeUpdate,
    onPlay,
    onPause,
    onEnded,
    onError,
  });
  const { getElapsedMs, noteSourceError, repaint, seekToMs, togglePlay } = clock;

  useImperativeHandle(
    ref,
    () => ({
      play: (): Promise<void> => {
        clock.play();
        return Promise.resolve();
      },
      pause: (): void => {
        clock.pause();
      },
      get currentTime(): number {
        return clock.getElapsedMs() / MS_PER_SECOND;
      },
      set currentTime(seconds: number) {
        clock.seekToMs(seconds * MS_PER_SECOND);
      },
      get paused(): boolean {
        return !clock.playing;
      },
      get ended(): boolean {
        return clock.ended;
      },
      get duration(): number {
        return info.durationMs / MS_PER_SECOND;
      },
      get videoWidth(): number {
        return info.width;
      },
      get videoHeight(): number {
        return info.height;
      },
    }),
    [clock, info],
  );

  // HTML5 fires loadedmetadata once dimensions and duration are known. In
  // external mode they are known at mount.
  const onLoadedMetadataRef = useRef(onLoadedMetadata);
  onLoadedMetadataRef.current = onLoadedMetadata;
  useEffect(() => {
    onLoadedMetadataRef.current?.({
      videoWidth: info.width,
      videoHeight: info.height,
      duration: info.durationMs / MS_PER_SECOND,
    });
  }, [info]);

  useInput(
    (input, key) => {
      if (input === 'q' || (key.ctrl && input === 'c')) {
        screen.dispose();
        void source.close().catch(noteSourceError);
        exit();
        return;
      }
      if (input === ' ') {
        togglePlay();
        return;
      }
      if (key.leftArrow) {
        seekToMs(getElapsedMs() - SEEK_STEP_MS);
        return;
      }
      if (key.rightArrow) {
        seekToMs(getElapsedMs() + SEEK_STEP_MS);
      }
    },
    { isActive: keyboard },
  );

  // Terminal resizes relayout the panel, debounced so a drag-resize settles
  // before the region changes. Placeholder rows must be re-read after
  // setRegion because the grid size can change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const region = computePanelRegion({
          termCols: stdout.columns,
          termRows: stdout.rows,
          sourceWidth: info.width,
          sourceHeight: info.height,
        });
        screen.setRegion(region);
        setPlaceholderRows(screen.getPlaceholderRows());
        repaint();
      }, RESIZE_DEBOUNCE_MS);
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [info.height, info.width, repaint, screen, stdout]);

  const progressPercent =
    info.durationMs > 0
      ? Math.min(
          Math.max(Math.round((clock.elapsedMs / info.durationMs) * PERCENT_MAX), 0),
          PERCENT_MAX,
        )
      : 0;

  return (
    <Box flexDirection="column">
      {title ? (
        <Text bold color="cyan">
          {PLAYER_TITLE}
        </Text>
      ) : null}
      <Box flexDirection="column" marginTop={title ? 1 : 0}>
        {placeholderRows.map((row, i) => (
          <Text key={i}>{row}</Text>
        ))}
      </Box>
      {controls ? (
        <Box marginTop={1}>
          <Text>{clock.playing ? PLAY_GLYPH : PAUSE_GLYPH} </Text>
          <Box width={PROGRESS_BAR_WIDTH}>
            <ProgressBar value={progressPercent} />
          </Box>
          <Text>
            {' '}
            {formatTime(clock.elapsedMs)} / {formatTime(info.durationMs)}
          </Text>
        </Box>
      ) : null}
      {help ? <Text dimColor>{HELP_TEXT}</Text> : null}
    </Box>
  );
  },
);

Video.displayName = 'Video';

/** Backwards-compatible alias, the component was originally exported as Player */
export const Player = Video;
