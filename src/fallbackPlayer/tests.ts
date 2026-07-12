import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioPlayer } from '../audioPlayer/index.ts';
import type { FrameSource, FrameSourceInfo } from '../frameSource/index.ts';
import { KEY_ARROW_LEFT, KEY_ARROW_RIGHT, resolveFallbackRenderMode, runFallbackPlayer } from './index.ts';
import type { FallbackKeyInput, FallbackScreen } from './index.ts';

const INFO: FrameSourceInfo = {
  width: 8,
  height: 4,
  colorSpace: 'rgb24',
  durationMs: 10_000,
  fps: 10,
};

/** 10 fps, so one playback tick every 100 ms */
const TICK_MS = 100;

interface FakeInputHarness {
  input: FallbackKeyInput;
  rawModeCalls: boolean[];
  press: (sequence: string) => void;
}

const createFakeInput = (): FakeInputHarness => {
  const emitter = new EventEmitter();
  const rawModeCalls: boolean[] = [];
  return {
    rawModeCalls,
    press: (sequence) => {
      emitter.emit('data', Buffer.from(sequence, 'utf8'));
    },
    input: {
      on: (event, listener) => emitter.on(event, listener),
      off: (event, listener) => emitter.off(event, listener),
      setRawMode: (mode) => {
        rawModeCalls.push(mode);
      },
    },
  };
};

interface FakeScreenHarness {
  screen: FallbackScreen;
  pushedFrames: Uint8Array[];
  disposeCalls: number;
}

const createFakeScreen = (): FakeScreenHarness => {
  const harness: FakeScreenHarness = {
    pushedFrames: [],
    disposeCalls: 0,
    screen: {
      pushFrame: (frame) => {
        harness.pushedFrames.push(frame);
      },
      isWritable: () => true,
      dispose: () => {
        harness.disposeCalls += 1;
      },
    },
  };
  return harness;
};

interface FakeSourceHarness {
  source: FrameSource;
  requestedMs: number[];
  seeks: number[];
  closed: boolean;
}

const createFakeSource = (): FakeSourceHarness => {
  const frame = new Uint8Array(INFO.width * INFO.height * 3);
  const harness: FakeSourceHarness = {
    requestedMs: [],
    seeks: [],
    closed: false,
    source: {
      open: () => Promise.resolve(INFO),
      getFrameAt: (timeMs) => {
        harness.requestedMs.push(timeMs);
        return Promise.resolve(frame);
      },
      seek: (timeMs) => {
        harness.seeks.push(timeMs);
        return Promise.resolve();
      },
      close: () => {
        harness.closed = true;
        return Promise.resolve();
      },
    },
  };
  return harness;
};

interface FakeAudioHarness {
  audio: AudioPlayer;
  playFroms: number[];
  pauseCalls: number;
  mutedValues: boolean[];
  closeCalls: number;
  positionMs: number | null;
}

const createFakeAudio = (): FakeAudioHarness => {
  const harness: FakeAudioHarness = {
    playFroms: [],
    pauseCalls: 0,
    mutedValues: [],
    closeCalls: 0,
    positionMs: null,
    audio: {
      open: () => Promise.resolve({ hasAudio: true }),
      playFrom: (timeMs) => {
        harness.playFroms.push(timeMs);
      },
      pause: () => {
        harness.pauseCalls += 1;
      },
      setMuted: (muted) => {
        harness.mutedValues.push(muted);
      },
      getPositionMs: () => harness.positionMs,
      close: () => {
        harness.closeCalls += 1;
        return Promise.resolve();
      },
    },
  };
  return harness;
};

interface Setup {
  done: Promise<void>;
  screen: FakeScreenHarness;
  source: FakeSourceHarness;
  keys: FakeInputHarness;
}

const setup = (audio?: FakeAudioHarness): Setup => {
  const screen = createFakeScreen();
  const source = createFakeSource();
  const keys = createFakeInput();
  const done = runFallbackPlayer({
    screen: screen.screen,
    source: source.source,
    info: INFO,
    input: keys.input,
    audio: audio?.audio ?? null,
  });
  return { done, screen, source, keys };
};

/**
 * Quit the player and settle its teardown promise chain. The audio describe
 * block below runs under real timers (its loop-wrap test needs genuine
 * setTimeout delays), so this only advances fake timers when they are
 * actually installed, matching the outer describe block's beforeEach.
 */
const quit = async (state: Setup): Promise<void> => {
  state.keys.press('q');
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
  }
  await state.done;
};

describe('runFallbackPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes frames at the source frame rate while playing', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS * 5);
    // Initial frame at 0 plus one per elapsed tick
    expect(state.screen.pushedFrames.length).toBe(6);
    expect(state.source.requestedMs.slice(0, 3)).toEqual([0, TICK_MS, TICK_MS * 2]);
    await quit(state);
  });

  it('passes frame buffers straight through to pushFrame', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    const [firstRequested] = state.screen.pushedFrames;
    expect(firstRequested).toBeInstanceOf(Uint8Array);
    expect(firstRequested.length).toBe(INFO.width * INFO.height * 3);
    await quit(state);
  });

  it('stops pushing frames on space and resumes on space again', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS * 2);
    state.keys.press(' ');
    const pausedCount = state.screen.pushedFrames.length;
    await vi.advanceTimersByTimeAsync(TICK_MS * 5);
    expect(state.screen.pushedFrames.length).toBe(pausedCount);
    state.keys.press(' ');
    await vi.advanceTimersByTimeAsync(TICK_MS * 2);
    expect(state.screen.pushedFrames.length).toBeGreaterThan(pausedCount);
    await quit(state);
  });

  it('seeks forward 5 seconds on right arrow', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    state.keys.press(KEY_ARROW_RIGHT);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.source.seeks).toEqual([TICK_MS + 5_000]);
    await quit(state);
  });

  it('clamps a backward seek at zero', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    state.keys.press(KEY_ARROW_LEFT);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.source.seeks).toEqual([0]);
    await quit(state);
  });

  it('wraps to the start at the end of the stream', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(INFO.durationMs + TICK_MS * 2);
    const wrapped = state.source.requestedMs.filter((ms) => ms < TICK_MS * 3);
    // The initial frame at 0 plus at least one post-wrap request
    expect(wrapped.length).toBeGreaterThan(1);
    await quit(state);
  });

  it('q restores raw mode, disposes the screen, and closes the source', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    await quit(state);
    expect(state.keys.rawModeCalls).toEqual([true, false]);
    expect(state.screen.disposeCalls).toBe(1);
    expect(state.source.closed).toBe(true);
  });

  it('ctrl-c quits like q', async () => {
    const state = setup();
    state.keys.press('\u0003');
    await vi.advanceTimersByTimeAsync(0);
    await state.done;
    expect(state.screen.disposeCalls).toBe(1);
    expect(state.source.closed).toBe(true);
  });

  it('stops pushing frames after quitting', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    await quit(state);
    const finalCount = state.screen.pushedFrames.length;
    await vi.advanceTimersByTimeAsync(TICK_MS * 5);
    expect(state.screen.pushedFrames.length).toBe(finalCount);
  });

  it('handles two arrow presses batched into one data chunk', async () => {
    const state = setup();
    state.keys.press(KEY_ARROW_RIGHT + KEY_ARROW_RIGHT);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.source.seeks).toEqual([5_000, 5_000]);
    await quit(state);
  });

  it('pauses and quits from a batched space-then-q chunk', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    state.keys.press(' q');
    await vi.advanceTimersByTimeAsync(0);
    await state.done;
    expect(state.screen.disposeCalls).toBe(1);
    expect(state.source.closed).toBe(true);
  });

  it('skips ticks while a frame fetch is in flight', async () => {
    const screen = createFakeScreen();
    const keys = createFakeInput();
    let resolveFrame: (frame: Uint8Array | null) => void = () => {};
    let getFrameCalls = 0;
    const source: FrameSource = {
      open: () => Promise.resolve(INFO),
      getFrameAt: () => {
        getFrameCalls += 1;
        return new Promise((resolve) => {
          resolveFrame = resolve;
        });
      },
      seek: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    const done = runFallbackPlayer({
      screen: screen.screen,
      source,
      info: INFO,
      input: keys.input,
    });
    await vi.advanceTimersByTimeAsync(TICK_MS * 4);
    // Only the initial fetch happened, every tick hit the in-flight guard
    expect(getFrameCalls).toBe(1);
    resolveFrame(new Uint8Array(INFO.width * INFO.height * 3));
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(getFrameCalls).toBe(2);
    keys.press('q');
    await vi.advanceTimersByTimeAsync(0);
    await done;
  });

  it('clamps a forward seek at the stream duration', async () => {
    const state = setup();
    // Settle the initial frame fetch first, otherwise the first press's
    // post-seek frame refresh is skipped by the in-flight guard and
    // elapsedMs lags one press behind
    await vi.advanceTimersByTimeAsync(0);
    // Flush twice per press so the whole seek then-chain settles
    const settleSeek = async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    };
    state.keys.press(KEY_ARROW_RIGHT);
    await settleSeek();
    state.keys.press(KEY_ARROW_RIGHT);
    await settleSeek();
    state.keys.press(KEY_ARROW_RIGHT);
    await settleSeek();
    // The third target is 15_000, past the 10_000 ms duration
    expect(state.source.seeks).toEqual([5_000, 10_000, 10_000]);
    await quit(state);
  });
});

describe('runFallbackPlayer audio', () => {
  it('starts audio at zero and closes it on quit', async () => {
    const audio = createFakeAudio();
    const state = setup(audio);
    expect(audio.playFroms[0]).toBe(0);
    await quit(state);
    expect(audio.closeCalls).toBe(1);
  });

  it('pauses audio on space and resumes from the playhead', async () => {
    const audio = createFakeAudio();
    const state = setup(audio);
    state.keys.press(' ');
    expect(audio.pauseCalls).toBe(1);
    const playsBefore = audio.playFroms.length;
    state.keys.press(' ');
    expect(audio.playFroms.length).toBe(playsBefore + 1);
    await quit(state);
  });

  it('restarts audio at the seek target while playing but not while paused', async () => {
    const audio = createFakeAudio();
    const state = setup(audio);
    state.keys.press(KEY_ARROW_RIGHT);
    expect(audio.playFroms.at(-1)).toBe(5_000);
    state.keys.press(' ');
    const playsBefore = audio.playFroms.length;
    state.keys.press(KEY_ARROW_RIGHT);
    expect(audio.playFroms.length).toBe(playsBefore);
    await quit(state);
  });

  it('toggles mute on the m key and applies the initial muted option', async () => {
    const audio = createFakeAudio();
    const screen = createFakeScreen();
    const source = createFakeSource();
    const keys = createFakeInput();
    const done = runFallbackPlayer({
      screen: screen.screen,
      source: source.source,
      info: INFO,
      input: keys.input,
      audio: audio.audio,
      muted: true,
    });
    expect(audio.mutedValues[0]).toBe(true);
    keys.press('m');
    expect(audio.mutedValues.at(-1)).toBe(false);
    keys.press('q');
    await done;
  });

  it('restarts audio at the wrap when playback loops', async () => {
    const audio = createFakeAudio();
    const state = setup(audio);
    // Settle the initial frame fetch first, otherwise the first press's
    // post-seek frame refresh is skipped by the in-flight guard (same race
    // as the "clamps a forward seek" test above) and elapsedMs never leaves 0.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Two 5 s seeks clamp elapsed to the 10 s duration, then one tick wraps.
    // The settle delays let each seek's promise chain land elapsedMs.
    state.keys.press(KEY_ARROW_RIGHT);
    await new Promise((resolve) => setTimeout(resolve, 50));
    state.keys.press(KEY_ARROW_RIGHT);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, TICK_MS + 50));
    expect(audio.playFroms.at(-1)).toBeLessThan(1_000);
    await quit(state);
  });
});

describe('resolveFallbackRenderMode', () => {
  it('returns a forced mode without probing', async () => {
    const probeKittyGraphics = vi.fn(() => Promise.resolve(true));
    await expect(
      resolveFallbackRenderMode('emoji', { probeKittyGraphics }),
    ).resolves.toBe('emoji');
    expect(probeKittyGraphics).not.toHaveBeenCalled();
  });

  it('returns a forced kitty mode without probing', async () => {
    const probeKittyGraphics = vi.fn(() => Promise.resolve(false));
    await expect(
      resolveFallbackRenderMode('kitty', { probeKittyGraphics }),
    ).resolves.toBe('kitty');
    expect(probeKittyGraphics).not.toHaveBeenCalled();
  });

  it('resolves kitty when the graphics probe passes', async () => {
    await expect(
      resolveFallbackRenderMode(undefined, {
        probeKittyGraphics: () => Promise.resolve(true),
        detectCellMode: () => 'half-block',
      }),
    ).resolves.toBe('kitty');
  });

  it('resolves the detected cell mode when the probe fails', async () => {
    await expect(
      resolveFallbackRenderMode(undefined, {
        probeKittyGraphics: () => Promise.resolve(false),
        detectCellMode: () => 'cell-background',
      }),
    ).resolves.toBe('cell-background');
  });

  it('resolves the cell mode without probing inside a multiplexed session', async () => {
    const probeKittyGraphics = vi.fn(() => Promise.resolve(true));
    await expect(
      resolveFallbackRenderMode(undefined, {
        probeKittyGraphics,
        detectCellMode: () => 'half-block',
        isMultiplexed: () => true,
      }),
    ).resolves.toBe('half-block');
    expect(probeKittyGraphics).not.toHaveBeenCalled();
  });

  it('returns forced kitty untouched even inside a multiplexed session', async () => {
    const probeKittyGraphics = vi.fn(() => Promise.resolve(false));
    const isMultiplexed = vi.fn(() => true);
    await expect(
      resolveFallbackRenderMode('kitty', { probeKittyGraphics, isMultiplexed }),
    ).resolves.toBe('kitty');
    expect(probeKittyGraphics).not.toHaveBeenCalled();
    expect(isMultiplexed).not.toHaveBeenCalled();
  });
});
