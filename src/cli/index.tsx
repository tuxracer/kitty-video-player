#!/usr/bin/env node
/**
 * Executable CLI entry (built as dist/cli.js, the package bin). Parses argv,
 * guards on terminal capability, then hands either a procedural or an
 * ffmpeg-decoded FrameSource and a kitty-motion Screen to the Ink Video component.
 * In fallback mode the Screen goes to runFallbackPlayer instead and Ink
 * never renders. Importing this module runs the CLI, so tests import
 * parseCliArgs from ./parseCliArgs.ts directly.
 */
import { Box, render, Text } from 'ink';
import { createScreen, detectCellPixelSize } from 'kitty-motion';

import type { AudioPlayer } from '../audioPlayer/index.ts';
import {
  isAudioError,
  AudioPlayerView,
  CONTROLS_ROWS,
  DEFAULT_VISUAL_HEIGHT,
  DEFAULT_VISUAL_WIDTH,
} from '../Audio/index.tsx';
import { runFallbackAudioPlayer } from '../fallbackAudioPlayer/index.ts';
import { createFallbackScreen, resolveFallbackRenderMode, runFallbackPlayer } from '../fallbackPlayer/index.ts';
import { createFfmpegAudioPlayer } from '../ffmpegAudioPlayer/index.ts';
import { isFfmpegSourceError } from '../ffmpegSource/index.ts';
import { isMediaProbeError, probeMediaFile } from '../mediaProbe/index.ts';
import type { PlayerScreen } from '../Video/index.tsx';
import { HELP_TEXT as PLAYER_HELP_TEXT, PLAYER_TITLE, Video } from '../Video/index.tsx';
import { computePanelRegion } from '../playerLayout/index.ts';
import { confirmFallback } from './confirmFallback.ts';
import {
  EXIT_OK,
  EXIT_USAGE,
  FALLBACK_KITTY_NOTE,
  FALLBACK_PROMPT,
  FALLBACK_PROMPT_KITTY,
  FALLBACK_REASON_MESSAGES,
  FALLBACK_WARNING_HEADER,
  HELP_TEXT,
  UNSUPPORTED_TERMINAL_MESSAGE,
  VERSION,
} from './consts.ts';
import { detectFallbackReasons } from './detectFallbackReasons.ts';
import { startLoadingIndicator } from './loadingIndicator.ts';
import { parseCliArgs } from './parseCliArgs.ts';
import { resolveMediaPlayback } from './resolveMediaPlayback.ts';
import { runCliPlayback } from './runCliPlayback.ts';

export { parseCliArgs } from './parseCliArgs.ts';
export { detectFallbackReasons } from './detectFallbackReasons.ts';
export { confirmFallback } from './confirmFallback.ts';
export { startLoadingIndicator } from './loadingIndicator.ts';
export { openMediaSource } from './openMediaSource.ts';
export {
  closeMediaPlayback,
  requiresVisualTerminal,
  resolveMediaPlayback,
  resolvePlaybackRoute,
} from './resolveMediaPlayback.ts';
export { runCliPlayback } from './runCliPlayback.ts';
export * from './consts.ts';
export * from './types.ts';

const args = parseCliArgs(process.argv.slice(2));

if (args.action === 'help') {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(EXIT_OK);
}

if (args.action === 'version') {
  process.stdout.write(`${VERSION}\n`);
  process.exit(EXIT_OK);
}

if (args.action === 'usage-error') {
  process.stderr.write(`kitty-media-player: ${args.message}\n\n${HELP_TEXT}\n`);
  process.exit(EXIT_USAGE);
}

// A prompt is impossible without a TTY and fallback output to a pipe is
// garbage, so --fallback does not override this. Exit 0 keeps CI green.
if (!process.stdout.isTTY) {
  process.stderr.write(`${UNSUPPORTED_TERMINAL_MESSAGE}\n`);
  process.exit(EXIT_OK);
}

// Only file playback has audio. The procedural demo is silent, and a file
// whose audio cannot play (no stream, no device) resolves hasAudio false
// and is closed again, so the players below see null and skip every call.
// One classification probe runs per file and feeds both pipelines: the
// source construction branches on it, and the audio player reads its
// has-audio answer from it, so startup runs one ffprobe and the audio
// device open hides behind the source open.
const openingProbe = args.file === undefined ? null : probeMediaFile(args.file);
const audioPlayer =
  args.file === undefined || openingProbe === null
    ? null
    : createFfmpegAudioPlayer({
        filePath: args.file,
        probeAudio: async () => {
          const probe = await openingProbe;
          return probe.kind === 'audio' ? true : probe.hasAudio;
        },
      });

// Resolves the opened player or null, never rejects: AudioPlayer.open()
// and close() resolve on every failure by contract, so no try/catch is
// needed around them here
const openAudio = async (): Promise<AudioPlayer | null> => {
  if (audioPlayer === null) {
    return null;
  }
  const { hasAudio } = await audioPlayer.open();
  if (hasAudio) {
    return audioPlayer;
  }
  await audioPlayer.close();
  return null;
};

// A slow open says so instead of sitting silent: remote URLs probe (and
// sometimes measure their duration) over the network, which can take
// seconds. The indicator is delayed internally so fast local opens never
// flash it, and stopped explicitly on the error path because process.exit
// skips finally blocks.
const loadingIndicator = args.file === undefined ? null : startLoadingIndicator(args.file);

const reportError = (error: unknown): void => {
  const message =
    isAudioError(error) || isMediaProbeError(error) || isFfmpegSourceError(error)
      ? error.message
      : String(error);
  process.stderr.write(`kitty-media-player: ${message}\n`);
};

const result = await runCliPlayback<PlayerScreen>({
  openPlayback: () =>
    resolveMediaPlayback({
      filePath: args.file,
      visual: args.visual,
      probe: openingProbe,
      audio: openAudio(),
    }),
  closeOpeningResources: () => audioPlayer?.close() ?? Promise.resolve(),
  onOpeningSettled: () => loadingIndicator?.stop(),
  fallback: args.fallback,
  renderMode: args.renderMode,
  muted: args.muted,
  dependencies: {
    detectReasons: detectFallbackReasons,
    resolveFallbackMode: resolveFallbackRenderMode,
    confirmFallback: async (route) => {
      const reasonLines = route.reasons.map(
        (reason) => `  - ${FALLBACK_REASON_MESSAGES[reason]}`,
      );
      process.stderr.write(`${FALLBACK_WARNING_HEADER}\n${reasonLines.join('\n')}\n`);
      if (route.fallbackMode === 'kitty') {
        process.stderr.write(`${FALLBACK_KITTY_NOTE}\n`);
      }
      return confirmFallback({
        input: process.stdin,
        output: process.stderr,
        prompt: route.fallbackMode === 'kitty' ? FALLBACK_PROMPT_KITTY : FALLBACK_PROMPT,
      });
    },
    prepareKittyFallback: detectCellPixelSize,
    createFallbackScreen: (playback, mode) => createFallbackScreen(playback.info, mode),
    runVisualFallback: async (playback, screen) => {
      await runFallbackPlayer({
        screen,
        source: playback.source,
        info: playback.info,
        input: process.stdin,
        audio: playback.kind === 'procedural' ? null : playback.audio,
        muted: args.muted,
      });
    },
    runAudioFallback: async (playback) => {
      await runFallbackAudioPlayer({
        audio: playback.audio,
        durationMs: playback.durationMs,
        input: process.stdin,
        output: process.stdout,
        muted: args.muted,
        label: playback.label ?? undefined,
      });
    },
    createVisualScreen: async (playback, forceKitty) => {
      const region = computePanelRegion({
        termCols: process.stdout.columns,
        termRows: process.stdout.rows,
        sourceWidth: playback.info.width,
        sourceHeight: playback.info.height,
      });
      return createScreen({
        output: process.stdout,
        sourceWidth: playback.info.width,
        sourceHeight: playback.info.height,
        colorSpace: playback.info.colorSpace,
        renderMode: forceKitty ? 'kitty' : undefined,
        placement: 'unicode',
        embedded: true,
        region,
        autoResize: false,
        autoDispose: false,
      });
    },
    renderVisual: (playback, screen) => {
      render(
        <Video
          screen={screen}
          source={playback.source}
          info={playback.info}
          audio={playback.kind === 'procedural' ? undefined : playback.audio ?? undefined}
          muted={args.muted}
          autoPlay
          loop
          controls
          keyboard
          title
          help
        />,
        { exitOnCtrlC: false },
      );
    },
    renderAudio: (playback) => {
      const { audio, durationMs, label } = playback;
      render(
        <Box flexDirection="column">
          <Text bold color="cyan">{PLAYER_TITLE}</Text>
          <Box marginTop={1}>
            <AudioPlayerView
              audio={audio}
              durationMs={durationMs}
              resourceStatus="ready"
              autoPlay
              loop
              muted={args.muted}
              controls
              keyboard
              width={label === null ? undefined : DEFAULT_VISUAL_WIDTH}
              height={label === null ? CONTROLS_ROWS : DEFAULT_VISUAL_HEIGHT}
              visualStatus={label === null ? 'none' : 'placeholder'}
              visualSource={null}
              visualInfo={null}
              visualScreen={null}
              visualRows={[]}
              visualLabel={label}
              visualRegionRevision={0}
              onVisualError={() => undefined}
              onQuit={() => void audio?.close().catch(() => undefined)}
            />
          </Box>
          <Text dimColor>{PLAYER_HELP_TEXT}</Text>
        </Box>,
        { exitOnCtrlC: false },
      );
    },
    reportError,
  },
});

if (result === 'exit-ok') {
  process.exit(EXIT_OK);
}
if (result === 'exit-error') {
  process.exit(EXIT_USAGE);
}
