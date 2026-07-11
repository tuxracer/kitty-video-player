import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameSource, FrameSourceInfo } from '../frameSource/index.ts';
import { KEY_ARROW_LEFT, KEY_ARROW_RIGHT, runFallbackPlayer } from './index.ts';
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

interface Setup {
  done: Promise<void>;
  screen: FakeScreenHarness;
  source: FakeSourceHarness;
  keys: FakeInputHarness;
}

const setup = (): Setup => {
  const screen = createFakeScreen();
  const source = createFakeSource();
  const keys = createFakeInput();
  const done = runFallbackPlayer({
    screen: screen.screen,
    source: source.source,
    info: INFO,
    input: keys.input,
  });
  return { done, screen, source, keys };
};

/** Quit the player and settle its teardown promise chain */
const quit = async (state: Setup): Promise<void> => {
  state.keys.press('q');
  await vi.advanceTimersByTimeAsync(0);
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
});
