import { SEEK_STEP_MS } from '../Video/index.tsx';
import {
  KEY_ARROW_LEFT,
  KEY_ARROW_RIGHT,
  KEY_CTRL_C,
  KEY_QUIT,
  KEY_SPACE,
  MS_PER_SECOND,
} from './consts.ts';
import type { FallbackPlayerOptions } from './types.ts';

export * from './consts.ts';
export * from './types.ts';

/**
 * Playback loop for half-block fallback mode. No Ink here: the half-block
 * renderer writes cells directly and produces no placeholder rows, so there
 * is nothing for Ink to lay out. This is a plain-function port of
 * usePlaybackClock's behavior (a setInterval at the source frame rate, an
 * in-flight guard so async getFrameAt calls never pile up, frames straight
 * to pushFrame), always autoplay and always loop, matching what the cli
 * passes to Video. Keys come from a raw stdin data listener. Resolves when
 * the user quits, after the screen is disposed and the source is closed.
 */
export const runFallbackPlayer = ({
  screen,
  source,
  info,
  input,
}: FallbackPlayerOptions): Promise<void> =>
  new Promise((resolve) => {
    let playing = true;
    let elapsedMs = 0;
    let inFlight = false;
    let sourceErrorNoted = false;
    const intervalMs = Math.round(MS_PER_SECOND / info.fps);

    const noteSourceError = (): void => {
      if (!sourceErrorNoted) {
        sourceErrorNoted = true;
        process.stderr.write('kitty-player: frame source error, playback continues\n');
      }
    };

    const showFrameAt = (nextMs: number): void => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      void source
        .getFrameAt(nextMs)
        .then((frame) => {
          if (frame) {
            screen.pushFrame(frame);
          }
          elapsedMs = nextMs;
        })
        .catch(noteSourceError)
        .finally(() => {
          inFlight = false;
        });
    };

    const seekToMs = (targetMs: number): void => {
      const clampedMs = Math.min(Math.max(targetMs, 0), info.durationMs);
      void source
        .seek(clampedMs)
        .then(() => {
          showFrameAt(clampedMs);
        })
        .catch(noteSourceError);
    };

    showFrameAt(0);
    const interval = setInterval(() => {
      if (!playing || !screen.isWritable() || inFlight) {
        return;
      }
      const nextMs = elapsedMs + intervalMs;
      // Always loop, wrapping like usePlaybackClock's loop branch
      showFrameAt(nextMs < info.durationMs ? nextMs : nextMs % info.durationMs);
    }, intervalMs);

    const onKey = (chunk: Buffer): void => {
      const key = chunk.toString('utf8');
      if (key === KEY_QUIT || key === KEY_CTRL_C) {
        clearInterval(interval);
        input.off('data', onKey);
        input.setRawMode?.(false);
        input.pause?.();
        screen.dispose();
        void source
          .close()
          .catch(noteSourceError)
          .finally(() => {
            resolve();
          });
        return;
      }
      if (key === KEY_SPACE) {
        playing = !playing;
        return;
      }
      if (key === KEY_ARROW_RIGHT) {
        seekToMs(elapsedMs + SEEK_STEP_MS);
        return;
      }
      if (key === KEY_ARROW_LEFT) {
        seekToMs(elapsedMs - SEEK_STEP_MS);
      }
    };

    input.setRawMode?.(true);
    input.resume?.();
    input.on('data', onKey);
  });
