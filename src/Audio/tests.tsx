import { render } from 'ink-testing-library';
import { createRef, forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioPlayer } from '../audioPlayer/index.ts';
import { AUDIO_TICK_MS, DRIFT_RESYNC_THRESHOLD_MS } from './consts.ts';
import type { AudioPlaybackClock, AudioPlaybackClockOptions } from './types.ts';
import { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';

interface FakeAudioHarness {
  audio: AudioPlayer;
  playFroms: number[];
  pauseCalls: number;
  mutedValues: boolean[];
  closeCalls: number;
  starting: boolean;
  positionMs: number | null;
}

const createFakeAudio = (): FakeAudioHarness => {
  const harness: FakeAudioHarness = {
    playFroms: [],
    pauseCalls: 0,
    mutedValues: [],
    closeCalls: 0,
    starting: false,
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
      isStarting: () => harness.starting,
      getPositionMs: () => harness.positionMs,
      close: () => {
        harness.closeCalls += 1;
        return Promise.resolve();
      },
    },
  };
  return harness;
};

const ClockHarness = forwardRef<AudioPlaybackClock, AudioPlaybackClockOptions>((props, ref) => {
  const clock = useAudioPlaybackClock(props);
  useImperativeHandle(ref, () => clock, [clock]);
  return null;
});

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('useAudioPlaybackClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts autoplay at zero and holds while audio is starting', async () => {
    const harness = createFakeAudio();
    harness.starting = true;
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness ref={clock} audio={harness.audio} durationMs={20_000} autoPlay loop={false} />,
    );

    await flush();
    expect(harness.playFroms).toEqual([0]);
    expect(clock.current?.buffering).toBe(true);

    await advance(500);
    expect(clock.current?.getElapsedMs()).toBe(0);

    harness.starting = false;
    await advance(AUDIO_TICK_MS);
    expect(clock.current?.buffering).toBe(false);
    view.unmount();
  });

  it('seeks without starting while paused and restarts while playing', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay={false}
        loop={false}
      />,
    );
    await flush();

    clock.current?.seekToMs(5_000);
    expect(clock.current?.getElapsedMs()).toBe(5_000);
    expect(harness.playFroms).toEqual([]);

    clock.current?.play();
    expect(harness.playFroms).toEqual([5_000]);
    clock.current?.seekToMs(10_000);
    expect(harness.playFroms).toEqual([5_000, 10_000]);
    view.unmount();
  });

  it('pauses the player and reports pause once', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const onPause = vi.fn();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay
        loop={false}
        onPause={onPause}
      />,
    );
    await flush();

    clock.current?.pause();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(harness.pauseCalls).toBe(1);
    expect(clock.current?.playing).toBe(false);
    view.unmount();
  });

  it('parks at the end and calls onPause before onEnded', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const events: string[] = [];
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={100}
        autoPlay
        loop={false}
        onPause={() => events.push('pause')}
        onEnded={() => events.push('ended')}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 100);
    expect(clock.current?.getElapsedMs()).toBe(100);
    expect(clock.current?.playing).toBe(false);
    expect(clock.current?.ended).toBe(true);
    expect(events).toEqual(['pause', 'ended']);
    expect(harness.pauseCalls).toBe(1);
    view.unmount();
  });

  it('replays from zero after reaching the end', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness ref={clock} audio={harness.audio} durationMs={100} autoPlay loop={false} />,
    );
    await flush();
    await advance(AUDIO_TICK_MS + 100);

    clock.current?.play();
    expect(clock.current?.getElapsedMs()).toBe(0);
    expect(clock.current?.ended).toBe(false);
    expect(harness.playFroms.at(-1)).toBe(0);
    view.unmount();
  });

  it('loops through the start gate without calling onEnded', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const onEnded = vi.fn();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={100}
        autoPlay
        loop
        onEnded={onEnded}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 100);
    expect(onEnded).not.toHaveBeenCalled();
    expect(clock.current?.playing).toBe(true);
    expect(harness.playFroms).toEqual([0, 0]);
    view.unmount();
  });

  it('clamps seeks and pauses the player while paused', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay={false}
        loop={false}
      />,
    );
    await flush();

    clock.current?.seekToMs(-1_000);
    expect(clock.current?.getElapsedMs()).toBe(0);
    clock.current?.seekToMs(30_000);
    expect(clock.current?.getElapsedMs()).toBe(20_000);
    expect(harness.pauseCalls).toBe(2);
    view.unmount();
  });

  it('reports each whole-second crossing in seconds', async () => {
    const harness = createFakeAudio();
    const onTimeUpdate = vi.fn();
    const view = render(
      <ClockHarness
        audio={harness.audio}
        durationMs={20_000}
        autoPlay
        loop={false}
        onTimeUpdate={onTimeUpdate}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_000);
    expect(onTimeUpdate).toHaveBeenCalledWith({ currentTime: 1, duration: 20 });
    view.unmount();
  });

  it('restarts at the playhead when drift exceeds the threshold', async () => {
    const harness = createFakeAudio();
    harness.positionMs = 1_000 + DRIFT_RESYNC_THRESHOLD_MS + 1;
    const view = render(
      <ClockHarness audio={harness.audio} durationMs={20_000} autoPlay loop={false} />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_000);
    expect(harness.playFroms).toEqual([0, 1_000]);
    view.unmount();
  });

  it('does not restart for drift when onTimeUpdate pauses playback', async () => {
    const harness = createFakeAudio();
    harness.positionMs = 1_000 + DRIFT_RESYNC_THRESHOLD_MS + 1;
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay
        loop={false}
        onTimeUpdate={() => clock.current?.pause()}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_000);
    expect(clock.current?.playing).toBe(false);
    expect(clock.current?.buffering).toBe(false);
    expect(harness.playFroms).toEqual([0]);
    expect(harness.pauseCalls).toBe(1);
    view.unmount();
  });

  it('skips drift correction when the player has no position', async () => {
    const harness = createFakeAudio();
    harness.positionMs = null;
    const view = render(
      <ClockHarness audio={harness.audio} durationMs={20_000} autoPlay loop={false} />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_000);
    expect(harness.playFroms).toEqual([0]);
    view.unmount();
  });

  it('honors play and pause callback re-entry', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay={false}
        loop={false}
        onPlay={() => clock.current?.pause()}
        onPause={() => {
          if (harness.playFroms.length > 0) {
            clock.current?.play();
          }
        }}
      />,
    );
    await flush();

    clock.current?.play();
    expect(harness.playFroms).toEqual([]);
    expect(harness.pauseCalls).toBe(1);

    view.rerender(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay={false}
        loop={false}
        onPause={() => clock.current?.play()}
      />,
    );
    clock.current?.play();
    clock.current?.pause();
    expect(harness.playFroms).toEqual([0, 0]);
    expect(harness.pauseCalls).toBe(1);
    view.unmount();
  });

  it('lets an onEnded callback replay without pausing the restarted player', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={100}
        autoPlay
        loop={false}
        onEnded={() => clock.current?.play()}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 100);
    expect(harness.playFroms).toEqual([0, 0]);
    expect(harness.pauseCalls).toBe(0);
    expect(clock.current?.playing).toBe(true);
    view.unmount();
  });

  it('does not restart a loop when its onTimeUpdate pauses playback', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={1_100}
        autoPlay
        loop
        onTimeUpdate={(event) => {
          if (event.currentTime === 0) {
            clock.current?.pause();
          }
        }}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_100);
    expect(clock.current?.playing).toBe(false);
    expect(clock.current?.buffering).toBe(false);
    expect(harness.playFroms).toEqual([0]);
    expect(harness.pauseCalls).toBe(1);
    view.unmount();
  });

  it('pauses the old player and resets autoplay when the player is replaced', async () => {
    const first = createFakeAudio();
    const second = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness ref={clock} audio={first.audio} durationMs={20_000} autoPlay loop={false} />,
    );
    await flush();
    clock.current?.seekToMs(5_000);

    view.rerender(
      <ClockHarness ref={clock} audio={second.audio} durationMs={10_000} autoPlay loop={false} />,
    );
    await flush();
    expect(first.pauseCalls).toBe(1);
    expect(clock.current?.getElapsedMs()).toBe(0);
    expect(second.playFroms).toEqual([0]);
    view.unmount();
  });

  it('pauses the current player during cleanup', async () => {
    const harness = createFakeAudio();
    const view = render(
      <ClockHarness
        audio={harness.audio}
        durationMs={20_000}
        autoPlay={false}
        loop={false}
      />,
    );
    await flush();

    view.unmount();
    await flush();
    expect(harness.pauseCalls).toBe(1);
  });

  it('pauses a player during cleanup before metadata arrives', async () => {
    const harness = createFakeAudio();
    const view = render(
      <ClockHarness audio={harness.audio} durationMs={null} autoPlay loop={false} />,
    );
    await flush();

    view.unmount();
    await flush();
    expect(harness.pauseCalls).toBe(1);
  });
});
