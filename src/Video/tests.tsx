import { render } from 'ink-testing-library';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FrameSource, FrameSourceInfo } from '../frameSource/index.ts';
import { createProceduralSource } from '../proceduralSource/index.ts';
import { HELP_TEXT, PAUSE_GLYPH, PLAY_GLYPH, PLAYER_TITLE, Player, Video } from './index.tsx';
import type { PlayerScreen, VideoRef } from './index.tsx';

// Let queued microtasks and immediates settle (getFrameAt/seek promise chains)
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
};

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface FakeScreenHarness {
  screen: PlayerScreen;
  pushedFrames: Uint8Array[];
  setRegionCalls: number;
  disposeCalls: number;
}

const createFakeScreen = (): FakeScreenHarness => {
  const harness: FakeScreenHarness = {
    pushedFrames: [],
    setRegionCalls: 0,
    disposeCalls: 0,
    screen: {
      getPlaceholderRows: () => ['row0', 'row1'],
      pushFrame: (frame) => {
        harness.pushedFrames.push(frame);
      },
      setRegion: () => {
        harness.setRegionCalls += 1;
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
  seeks: number[];
}

const createFakeSource = (info: FrameSourceInfo): FakeSourceHarness => {
  const harness: FakeSourceHarness = {
    seeks: [],
    source: {
      open: () => Promise.resolve(info),
      getFrameAt: () => Promise.resolve(new Uint8Array(info.width * info.height * 3)),
      seek: (timeMs) => {
        harness.seeks.push(timeMs);
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    },
  };
  return harness;
};

const setup = async (): Promise<{
  harness: FakeScreenHarness;
  source: ReturnType<typeof createProceduralSource>;
  info: FrameSourceInfo;
}> => {
  const source = createProceduralSource({ width: 8, height: 4, durationMs: 20_000 });
  const info = await source.open();
  return { harness: createFakeScreen(), source, info };
};

describe('Player', () => {
  it('renders the placeholder rows and the time text', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, unmount } = render(
      <Player screen={harness.screen} source={source} info={info} autoPlay keyboard controls />,
    );
    await flush();

    const frame = lastFrame();
    expect(frame).toContain('row0');
    expect(frame).toContain('row1');
    expect(frame).toContain('0:00');
    expect(frame).toContain('0:20');
    expect(frame).toContain(PLAY_GLYPH);

    unmount();
  });

  it('toggles the pause glyph on space', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, stdin, unmount } = render(
      <Player screen={harness.screen} source={source} info={info} autoPlay keyboard controls />,
    );
    await flush();
    expect(lastFrame()).toContain(PLAY_GLYPH);

    stdin.write(' ');
    await flush();
    expect(lastFrame()).toContain(PAUSE_GLYPH);

    stdin.write(' ');
    await flush();
    expect(lastFrame()).toContain(PLAY_GLYPH);

    unmount();
  });

  it('pushes the initial frame to the screen', async () => {
    const { harness, source, info } = await setup();
    const { unmount } = render(
      <Player screen={harness.screen} source={source} info={info} autoPlay keyboard controls />,
    );
    await flush();

    expect(harness.pushedFrames.length).toBeGreaterThanOrEqual(1);

    unmount();
  });

  it('seeks forward on right arrow and updates the time text', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, stdin, unmount } = render(
      <Player screen={harness.screen} source={source} info={info} autoPlay keyboard controls />,
    );
    await flush();

    stdin.write('\u001B[C'); // right arrow
    await flush();
    expect(lastFrame()).toContain('0:05 / 0:20');

    unmount();
  });

  it('stops pushing frames after unmount', async () => {
    const { harness, source, info } = await setup();
    const { unmount } = render(
      <Player screen={harness.screen} source={source} info={info} autoPlay keyboard controls />,
    );
    await flush();

    unmount();
    await flush(); // let any in-flight frame settle
    const pushedAfterUnmount = harness.pushedFrames.length;

    // At 30fps a live interval would push roughly three frames in 100ms
    await delay(100);
    expect(harness.pushedFrames.length).toBe(pushedAfterUnmount);
  });
});

describe('Video playback semantics', () => {
  it('mounts paused on the first frame without autoPlay', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, unmount } = render(
      <Video screen={harness.screen} source={source} info={info} controls />,
    );
    await flush();

    // First frame is shown even while paused
    expect(harness.pushedFrames.length).toBeGreaterThanOrEqual(1);
    expect(lastFrame()).toContain(PAUSE_GLYPH);

    unmount();
  });

  it('fires onLoadedMetadata with dimensions and duration in seconds', async () => {
    const { harness, source, info } = await setup();
    const onLoadedMetadata = vi.fn();
    const { unmount } = render(
      <Video
        screen={harness.screen}
        source={source}
        info={info}
        onLoadedMetadata={onLoadedMetadata}
      />,
    );
    await flush();

    expect(onLoadedMetadata).toHaveBeenCalledWith({
      videoWidth: 8,
      videoHeight: 4,
      duration: 20,
    });

    unmount();
  });

  it('fires onTimeUpdate in seconds when the displayed second changes', async () => {
    const { harness, source, info } = await setup();
    const onTimeUpdate = vi.fn();
    const { stdin, unmount } = render(
      <Video
        screen={harness.screen}
        source={source}
        info={info}
        autoPlay
        keyboard
        controls
        onTimeUpdate={onTimeUpdate}
      />,
    );
    await flush();

    stdin.write('\u001B[C'); // right arrow seeks +5s, crossing a second boundary
    await flush();

    expect(onTimeUpdate).toHaveBeenCalledWith({ currentTime: 5, duration: 20 });

    unmount();
  });

  it('fires onPause and onPlay when space toggles playback', async () => {
    const { harness, source, info } = await setup();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const { stdin, unmount } = render(
      <Video
        screen={harness.screen}
        source={source}
        info={info}
        autoPlay
        keyboard
        controls
        onPlay={onPlay}
        onPause={onPause}
      />,
    );
    await flush();

    stdin.write(' ');
    await flush();
    expect(onPause).toHaveBeenCalledTimes(1);

    stdin.write(' ');
    await flush();
    expect(onPlay).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('stops at the end and fires onEnded when loop is false', async () => {
    const source = createProceduralSource({ width: 8, height: 4, durationMs: 100 });
    const info = await source.open();
    const harness = createFakeScreen();
    const onEnded = vi.fn();
    const { lastFrame, unmount } = render(
      <Video
        screen={harness.screen}
        source={source}
        info={info}
        autoPlay
        keyboard
        controls
        onEnded={onEnded}
      />,
    );

    // 100ms duration at 30fps ends within a few ticks
    await delay(300);
    await flush();

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(lastFrame()).toContain(PAUSE_GLYPH);

    unmount();
  });

  it('wraps around and never fires onEnded when loop is true', async () => {
    const source = createProceduralSource({ width: 8, height: 4, durationMs: 100 });
    const info = await source.open();
    const harness = createFakeScreen();
    const onEnded = vi.fn();
    const { lastFrame, unmount } = render(
      <Video
        screen={harness.screen}
        source={source}
        info={info}
        autoPlay
        loop
        keyboard
        controls
        onEnded={onEnded}
      />,
    );

    await delay(300);
    await flush();

    expect(onEnded).not.toHaveBeenCalled();
    expect(lastFrame()).toContain(PLAY_GLYPH);

    unmount();
  });
});

describe('Video chrome and keyboard gating', () => {
  it('renders only the video rows by default', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, unmount } = render(
      <Video screen={harness.screen} source={source} info={info} />,
    );
    await flush();

    const frame = lastFrame();
    expect(frame).toContain('row0');
    expect(frame).not.toContain(PLAYER_TITLE.trim());
    expect(frame).not.toContain(HELP_TEXT);
    expect(frame).not.toContain(PAUSE_GLYPH);
    expect(frame).not.toContain('0:00');

    unmount();
  });

  it('ignores keys unless keyboard is set', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, stdin, unmount } = render(
      <Video screen={harness.screen} source={source} info={info} autoPlay controls />,
    );
    await flush();
    expect(lastFrame()).toContain(PLAY_GLYPH);

    stdin.write(' ');
    await flush();
    expect(lastFrame()).toContain(PLAY_GLYPH);

    unmount();
  });

  it('shows title and help when requested', async () => {
    const { harness, source, info } = await setup();
    const { lastFrame, unmount } = render(
      <Video screen={harness.screen} source={source} info={info} title help />,
    );
    await flush();

    const frame = lastFrame();
    expect(frame).toContain(PLAYER_TITLE.trim());
    expect(frame).toContain(HELP_TEXT);

    unmount();
  });
});

describe('VideoRef', () => {
  const INFO: FrameSourceInfo = {
    width: 8,
    height: 4,
    colorSpace: 'rgb24',
    durationMs: 20_000,
    fps: 30,
  };

  it('exposes HTML5-shaped getters', async () => {
    const { harness } = { harness: createFakeScreen() };
    const fake = createFakeSource(INFO);
    const ref = createRef<VideoRef>();
    const { unmount } = render(
      <Video ref={ref} screen={harness.screen} source={fake.source} info={INFO} />,
    );
    await flush();

    expect(ref.current?.paused).toBe(true);
    expect(ref.current?.ended).toBe(false);
    expect(ref.current?.duration).toBe(20);
    expect(ref.current?.videoWidth).toBe(8);
    expect(ref.current?.videoHeight).toBe(4);
    expect(ref.current?.currentTime).toBe(0);

    unmount();
  });

  it('play() resolves and starts playback, pause() stops it', async () => {
    const harness = createFakeScreen();
    const fake = createFakeSource(INFO);
    const ref = createRef<VideoRef>();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const { unmount } = render(
      <Video
        ref={ref}
        screen={harness.screen}
        source={fake.source}
        info={INFO}
        onPlay={onPlay}
        onPause={onPause}
      />,
    );
    await flush();

    await ref.current?.play();
    await flush();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(ref.current?.paused).toBe(false);

    ref.current?.pause();
    await flush();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(ref.current?.paused).toBe(true);

    unmount();
  });

  it('setting currentTime seeks in seconds', async () => {
    const harness = createFakeScreen();
    const fake = createFakeSource(INFO);
    const ref = createRef<VideoRef>();
    const { unmount } = render(
      <Video ref={ref} screen={harness.screen} source={fake.source} info={INFO} />,
    );
    await flush();

    if (ref.current) {
      ref.current.currentTime = 5;
    }
    await flush();

    expect(fake.seeks).toContain(5_000);
    expect(ref.current?.currentTime).toBe(5);

    unmount();
  });
});
