import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { createRef, forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioPlayer } from '../audioPlayer/index.ts';
import type { AudioVisualMode, AudioVisualSelection } from '../audioVisual/index.ts';
import type { FfmpegAudioPlayerOptions } from '../ffmpegAudioPlayer/index.ts';
import type { FrameSource, FrameSourceInfo } from '../frameSource/index.ts';
import type { AudioProbeResult } from '../mediaProbe/index.ts';
import { MediaProbeError } from '../mediaProbe/index.ts';
import type { PlayerScreen } from '../Video/index.tsx';
import {
  AUDIO_TICK_MS,
  BUFFERING_TEXT,
  DRIFT_RESYNC_THRESHOLD_MS,
  LOADING_DELAY_MS,
  LOADING_TEXT,
  PAUSE_GLYPH,
} from './consts.ts';
import { AudioError } from './types.ts';
import type {
  AudioLoadedMetadataEvent,
  AudioRef,
  AudioPlaybackClock,
  AudioPlaybackClockOptions,
  AudioPlayerViewProps,
  AudioVisualRenderer,
  AudioVisualRendererOptions,
  ManagedAudioVisualResources,
  ManagedAudioVisualResourcesOptions,
  ManagedAudioResources,
  ManagedAudioResourcesOptions,
} from './types.ts';
import { Audio, AudioPlayerView } from './index.tsx';
import { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';
import { useAudioVisualRenderer } from './useAudioVisualRenderer.ts';
import { useManagedResources } from './useManagedResources.ts';
import { useManagedVisualResources } from './useManagedVisualResources.ts';

const mediaProbeMocks = vi.hoisted(() => ({
  probeMediaFile: vi.fn(),
}));

const ffmpegAudioMocks = vi.hoisted(() => ({
  createFfmpegAudioPlayer: vi.fn(),
}));

const audioVisualMocks = vi.hoisted(() => ({
  openAudioVisual: vi.fn(),
}));

const managedScreenMocks = vi.hoisted(() => ({
  canDisplayVideo: vi.fn((): boolean => true),
  createManagedScreen: vi.fn(),
}));

const appMocks = vi.hoisted(() => ({
  exit: vi.fn(),
}));

vi.mock('ink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ink')>()),
  useApp: () => ({ exit: appMocks.exit }),
}));
vi.mock('../mediaProbe/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mediaProbe/index.ts')>()),
  ...mediaProbeMocks,
}));
vi.mock('../ffmpegAudioPlayer/index.ts', () => ffmpegAudioMocks);
vi.mock('../audioVisual/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audioVisual/index.ts')>()),
  ...audioVisualMocks,
}));
vi.mock('../Video/managedScreen.ts', () => managedScreenMocks);

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

const settle = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

const createDeferred = <T,>(): Deferred<T> => {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

const mockSuccessfulLoad = (harness: FakeAudioHarness, durationMs: number): void => {
  mediaProbeMocks.probeMediaFile.mockResolvedValue({
    kind: 'audio',
    durationMs,
    coverArt: null,
    title: null,
  });
  ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);
};

const ManagedResourcesHarness = forwardRef<ManagedAudioResources, ManagedAudioResourcesOptions>(
  (props, ref) => {
    const resources = useManagedResources(props);
    useImperativeHandle(ref, () => resources, [resources]);
    return <Text>{`${resources.status}:${resources.durationMs ?? 'null'}`}</Text>;
  },
);

const VISUAL_INFO: FrameSourceInfo = {
  width: 640,
  height: 360,
  colorSpace: 'rgb24',
  durationMs: 20_000,
  fps: 25,
};

interface FakeVisualSource {
  source: FrameSource;
  closeCalls: number;
}

const createFakeVisualSource = (
  getFrameAt: FrameSource['getFrameAt'] = () => Promise.resolve(new Uint8Array([1, 2, 3])),
): FakeVisualSource => {
  const harness: FakeVisualSource = {
    closeCalls: 0,
    source: {
      open: () => Promise.resolve(VISUAL_INFO),
      getFrameAt,
      seek: () => Promise.resolve(),
      close: () => {
        harness.closeCalls += 1;
        return Promise.resolve();
      },
    },
  };
  return harness;
};

interface FakeVisualScreen {
  screen: PlayerScreen;
  pushedFrames: Uint8Array[];
  regions: unknown[];
  disposeCalls: number;
  rows: string[];
}

const createFakeVisualScreen = (): FakeVisualScreen => {
  const harness: FakeVisualScreen = {
    pushedFrames: [],
    regions: [],
    disposeCalls: 0,
    rows: ['visual-row'],
    screen: {
      getPlaceholderRows: () => [...harness.rows],
      pushFrame: (frame) => harness.pushedFrames.push(frame),
      setRegion: (region) => harness.regions.push(region),
      isWritable: () => true,
      dispose: () => {
        harness.disposeCalls += 1;
      },
    },
  };
  return harness;
};

const AUDIO_PROBE: AudioProbeResult = {
  kind: 'audio',
  durationMs: 20_000,
  coverArt: null,
  title: 'Track',
};

const VisualResourcesHarness = forwardRef<
  ManagedAudioVisualResources,
  ManagedAudioVisualResourcesOptions
>((props, ref) => {
  const resources = useManagedVisualResources(props);
  useImperativeHandle(ref, () => resources, [resources]);
  return <Text>{`${resources.status}:${resources.label ?? ''}:${resources.placeholderRows.join('|')}`}</Text>;
});

const VisualRendererHarness = forwardRef<AudioVisualRenderer, AudioVisualRendererOptions>(
  (props, ref) => {
    const renderer = useAudioVisualRenderer(props);
    useImperativeHandle(ref, () => renderer, [renderer]);
    return <Text>{renderer.ready ? 'ready' : 'waiting'}</Text>;
  },
);

describe('useManagedResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens audio and reports duration metadata in seconds', async () => {
    const harness = createFakeAudio();
    const onLoadedMetadata = vi.fn();
    mediaProbeMocks.probeMediaFile.mockResolvedValue({
      kind: 'audio',
      durationMs: 20_000,
      coverArt: null,
      title: null,
    });
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);

    const view = render(
      <ManagedResourcesHarness src="track.mp3" onLoadedMetadata={onLoadedMetadata} />,
    );
    await settle();

    expect(view.lastFrame()).toContain('ready:20000');
    expect(onLoadedMetadata).toHaveBeenCalledOnce();
    expect(onLoadedMetadata).toHaveBeenCalledWith({ duration: 20 });
    view.unmount();
  });

  it('retains the exact successful media probe', async () => {
    const harness = createFakeAudio();
    const probe: AudioProbeResult = { ...AUDIO_PROBE };
    mediaProbeMocks.probeMediaFile.mockResolvedValue(probe);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);
    const resources = createRef<ManagedAudioResources>();

    const view = render(<ManagedResourcesHarness ref={resources} src="track.mp3" />);
    await settle();

    expect(resources.current?.probe).toBe(probe);
    view.unmount();
  });

  it('accepts a video probe that contains audio', async () => {
    const harness = createFakeAudio();
    mediaProbeMocks.probeMediaFile.mockResolvedValue({
      kind: 'video',
      nativeWidth: 640,
      nativeHeight: 360,
      durationMs: 20_000,
      fps: 30,
      hasAudio: true,
    });
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);

    const view = render(<ManagedResourcesHarness src="clip.mp4" />);
    await settle();

    expect(view.lastFrame()).toContain('ready:20000');
    view.unmount();
  });

  it('uses the pending media probe for the player audio probe', async () => {
    const harness = createFakeAudio();
    mediaProbeMocks.probeMediaFile.mockResolvedValue({
      kind: 'audio',
      durationMs: 20_000,
      coverArt: null,
      title: null,
    });
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockImplementation(
      (options: FfmpegAudioPlayerOptions) => ({
        ...harness.audio,
        open: async () => ({ hasAudio: (await options.probeAudio?.()) ?? false }),
      }),
    );

    const view = render(<ManagedResourcesHarness src="track.mp3" />);
    await settle();

    expect(view.lastFrame()).toContain('ready:20000');
    expect(mediaProbeMocks.probeMediaFile).toHaveBeenCalledOnce();
    expect(mediaProbeMocks.probeMediaFile).toHaveBeenCalledWith('track.mp3');
    view.unmount();
  });

  it('rejects a video without an audio stream and closes the player', async () => {
    const harness = createFakeAudio();
    const onError = vi.fn();
    mediaProbeMocks.probeMediaFile.mockResolvedValue({
      kind: 'video',
      nativeWidth: 640,
      nativeHeight: 360,
      durationMs: 20_000,
      fps: 30,
      hasAudio: false,
    });
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);

    const view = render(<ManagedResourcesHarness src="silent.mp4" onError={onError} />);
    await settle();

    expect(view.lastFrame()).toContain('error:null');
    expect(onError).toHaveBeenCalledWith(new AudioError('NO_AUDIO_STREAM'));
    expect(harness.closeCalls).toBe(1);
    view.unmount();
  });

  it('reports unavailable audio output after confirming the stream', async () => {
    const harness = createFakeAudio();
    const onError = vi.fn();
    harness.audio.open = () => Promise.resolve({ hasAudio: false });
    mediaProbeMocks.probeMediaFile.mockResolvedValue({
      kind: 'audio',
      durationMs: 20_000,
      coverArt: null,
      title: null,
    });
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);

    const view = render(<ManagedResourcesHarness src="track.mp3" onError={onError} />);
    await settle();

    expect(view.lastFrame()).toContain('error:null');
    expect(onError).toHaveBeenCalledWith(new AudioError('AUDIO_UNAVAILABLE'));
    expect(harness.closeCalls).toBe(1);
    view.unmount();
  });

  it('passes through a typed media probe failure', async () => {
    const harness = createFakeAudio();
    const onError = vi.fn();
    const error = new MediaProbeError('FILE_NOT_FOUND', 'missing');
    mediaProbeMocks.probeMediaFile.mockRejectedValue(error);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);

    const view = render(<ManagedResourcesHarness src="missing.mp3" onError={onError} />);
    await settle();

    expect(view.lastFrame()).toContain('error:null');
    expect(onError).toHaveBeenCalledWith(error);
    expect(harness.closeCalls).toBe(1);
    view.unmount();
  });

  it('closes the old player and resets to loading when src changes', async () => {
    const first = createFakeAudio();
    const second = createFakeAudio();
    const secondProbe = createDeferred<{
      kind: 'audio';
      durationMs: number;
      coverArt: null;
      title: null;
    }>();
    mediaProbeMocks.probeMediaFile
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 20_000, coverArt: null, title: null })
      .mockReturnValueOnce(secondProbe.promise);
    ffmpegAudioMocks.createFfmpegAudioPlayer
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const view = render(<ManagedResourcesHarness src="first.mp3" />);
    await settle();
    expect(view.lastFrame()).toContain('ready:20000');

    view.rerender(<ManagedResourcesHarness src="second.mp3" />);
    await settle();
    expect(view.lastFrame()).toContain('loading:null');
    expect(first.closeCalls).toBe(1);

    secondProbe.resolve({ kind: 'audio', durationMs: 10_000, coverArt: null, title: null });
    await settle();
    expect(view.lastFrame()).toContain('ready:10000');
    view.unmount();
  });

  it('closes an unresolved open on unmount without reporting callbacks', async () => {
    const harness = createFakeAudio();
    const probe = createDeferred<{
      kind: 'audio';
      durationMs: number;
      coverArt: null;
      title: null;
    }>();
    const open = createDeferred<{ hasAudio: boolean }>();
    harness.audio.open = () => open.promise;
    const onLoadedMetadata = vi.fn();
    const onError = vi.fn();
    mediaProbeMocks.probeMediaFile.mockReturnValue(probe.promise);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);
    const view = render(
      <ManagedResourcesHarness
        src="track.mp3"
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
      />,
    );
    await settle();

    view.unmount();
    await settle();
    expect(harness.closeCalls).toBe(1);
    probe.resolve({ kind: 'audio', durationMs: 20_000, coverArt: null, title: null });
    open.reject(new Error('open failed after unmount'));
    await settle();

    expect(onLoadedMetadata).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useManagedVisualResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managedScreenMocks.canDisplayVideo.mockReturnValue(true);
  });

  const renderVisual = (
    ref: ReturnType<typeof createRef<ManagedAudioVisualResources>>,
    overrides: Partial<ManagedAudioVisualResourcesOptions> = {},
  ) =>
    render(
      <VisualResourcesHarness
        ref={ref}
        enabled
        src="song.mp3"
        probe={AUDIO_PROBE}
        mode="waveform"
        width={40}
        height={12}
        {...overrides}
      />,
    );

  it.each<[AudioVisualMode, AudioVisualSelection, string]>([
    ['none', { kind: 'none' }, 'none::'],
    ['artwork', { kind: 'placeholder', label: 'Track' }, 'placeholder:Track:'],
  ])('returns the %s selection without constructing a screen', async (mode, selection, frame) => {
    audioVisualMocks.openAudioVisual.mockResolvedValue(selection);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources, { mode });
    await settle();

    expect(view.lastFrame()).toContain(frame);
    expect(managedScreenMocks.createManagedScreen).not.toHaveBeenCalled();
    view.unmount();
  });

  it('opens a source and creates a probe-free letterboxed screen', async () => {
    const visual = createFakeVisualSource();
    const screen = createFakeVisualScreen();
    audioVisualMocks.openAudioVisual.mockResolvedValue({
      kind: 'source',
      visualKind: 'waveform',
      source: visual.source,
      info: VISUAL_INFO,
      label: 'Track',
    });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();

    expect(resources.current?.status).toBe('ready');
    expect(resources.current?.placeholderRows).toEqual(['visual-row']);
    expect(managedScreenMocks.createManagedScreen).toHaveBeenCalledWith({
      region: { offsetCol: 1, offsetRow: 1, cols: 40, rows: 11 },
      sourceWidth: 640,
      sourceHeight: 360,
      colorSpace: 'rgb24',
    });
    view.unmount();
  });

  it('closes a selected source and degrades when Kitty placeholders are unsupported', async () => {
    const visual = createFakeVisualSource();
    managedScreenMocks.canDisplayVideo.mockReturnValue(false);
    audioVisualMocks.openAudioVisual.mockResolvedValue({
      kind: 'source',
      visualKind: 'waveform',
      source: visual.source,
      info: VISUAL_INFO,
      label: 'Track',
    });
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();

    expect(resources.current?.status).toBe('placeholder');
    expect(resources.current?.label).toBe('Track');
    expect(visual.closeCalls).toBe(1);
    expect(managedScreenMocks.createManagedScreen).not.toHaveBeenCalled();
    view.unmount();
  });

  it('degrades with the retained label when visual selection rejects', async () => {
    audioVisualMocks.openAudioVisual.mockRejectedValue(new Error('visual selection failed'));
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();

    expect(resources.current?.status).toBe('placeholder');
    expect(resources.current?.label).toBe('Track');
    expect(managedScreenMocks.createManagedScreen).not.toHaveBeenCalled();
    view.unmount();
  });

  it('closes the source when managed screen construction throws', async () => {
    const visual = createFakeVisualSource();
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockImplementation(() => {
      throw new Error('screen failed');
    });
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();

    expect(resources.current?.status).toBe('placeholder');
    expect(resources.current?.label).toBe('Track');
    expect(visual.closeCalls).toBe(1);
    view.unmount();
  });

  it('disposes the screen and closes the source when placeholder rows throw', async () => {
    const visual = createFakeVisualSource();
    const screen = createFakeVisualScreen();
    screen.screen.getPlaceholderRows = () => {
      throw new Error('rows failed');
    };
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();

    expect(resources.current?.status).toBe('placeholder');
    expect(resources.current?.label).toBe('Track');
    expect(screen.disposeCalls).toBe(1);
    expect(visual.closeCalls).toBe(1);
    view.unmount();
  });

  it('replaces only visual resources when the visual mode changes', async () => {
    const audio = createFakeAudio();
    const firstVisual = createFakeVisualSource();
    const secondVisual = createFakeVisualSource();
    const firstScreen = createFakeVisualScreen();
    const secondScreen = createFakeVisualScreen();
    mediaProbeMocks.probeMediaFile.mockResolvedValue(AUDIO_PROBE);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(audio.audio);
    audioVisualMocks.openAudioVisual
      .mockResolvedValueOnce({ kind: 'source', visualKind: 'waveform', source: firstVisual.source, info: VISUAL_INFO, label: 'Track' })
      .mockResolvedValueOnce({ kind: 'source', visualKind: 'artwork', source: secondVisual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen
      .mockReturnValueOnce(firstScreen.screen)
      .mockReturnValueOnce(secondScreen.screen);

    const CombinedHarness = ({ mode }: { mode: AudioVisualMode }) => {
      const managed = useManagedResources({ src: 'song.mp3' });
      useManagedVisualResources({ enabled: true, src: 'song.mp3', probe: managed.probe, mode, width: 40, height: 12 });
      return null;
    };
    const view = render(<CombinedHarness mode="waveform" />);
    await settle();
    view.rerender(<CombinedHarness mode="artwork" />);
    await settle();

    expect(mediaProbeMocks.probeMediaFile).toHaveBeenCalledTimes(1);
    expect(ffmpegAudioMocks.createFfmpegAudioPlayer).toHaveBeenCalledTimes(1);
    expect(firstVisual.closeCalls).toBe(1);
    expect(firstScreen.disposeCalls).toBe(1);
    expect(audio.closeCalls).toBe(0);
    view.unmount();
  });

  it('closes a stale visual open and never lets it replace the current visual', async () => {
    const stale = createDeferred<AudioVisualSelection>();
    const staleVisual = createFakeVisualSource();
    const currentVisual = createFakeVisualSource();
    const screen = createFakeVisualScreen();
    audioVisualMocks.openAudioVisual
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ kind: 'source', visualKind: 'artwork', source: currentVisual.source, info: VISUAL_INFO, label: 'Current' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    view.rerender(
      <VisualResourcesHarness ref={resources} enabled src="song.mp3" probe={AUDIO_PROBE} mode="artwork" width={40} height={12} />,
    );
    await settle();
    stale.resolve({ kind: 'source', visualKind: 'waveform', source: staleVisual.source, info: VISUAL_INFO, label: 'Stale' });
    await settle();

    expect(resources.current?.label).toBe('Current');
    expect(staleVisual.closeCalls).toBe(1);
    expect(managedScreenMocks.createManagedScreen).toHaveBeenCalledTimes(1);
    resources.current?.degradeToPlaceholder();
    await settle();
    expect(resources.current?.label).toBe('Current');
    view.unmount();
  });

  it('disposes the exact screen and closes the exact source on unmount', async () => {
    const visual = createFakeVisualSource();
    const screen = createFakeVisualScreen();
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const view = renderVisual(createRef<ManagedAudioVisualResources>());
    await settle();
    view.unmount();
    await settle();

    expect(screen.disposeCalls).toBe(1);
    expect(visual.closeCalls).toBe(1);
  });

  it('updates the region and rows without reopening the source', async () => {
    const visual = createFakeVisualSource();
    const screen = createFakeVisualScreen();
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();
    screen.rows = ['resized-row'];
    view.rerender(
      <VisualResourcesHarness ref={resources} enabled src="song.mp3" probe={AUDIO_PROBE} mode="waveform" width={20} height={8} />,
    );
    await settle();

    expect(screen.regions.at(-1)).toEqual({ offsetCol: 1, offsetRow: 1, cols: 20, rows: 5 });
    expect(resources.current?.placeholderRows).toEqual(['resized-row']);
    expect(audioVisualMocks.openAudioVisual).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('repaints the paused current frame after a region change', async () => {
    const getFrameAt = vi.fn(() => Promise.resolve(new Uint8Array([1])));
    const visual = createFakeVisualSource(getFrameAt);
    const screen = createFakeVisualScreen();
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);

    const ResizeHarness = ({ width }: { width: number }) => {
      const managed = useManagedVisualResources({ enabled: true, src: 'song.mp3', probe: AUDIO_PROBE, mode: 'waveform', width, height: 12 });
      useAudioVisualRenderer({
        source: managed.source,
        info: managed.info,
        screen: managed.screen,
        playing: false,
        getElapsedMs: () => 750,
        onReady: () => undefined,
        onVisualError: managed.degradeToPlaceholder,
        regionRevision: managed.regionRevision,
      });
      return null;
    };
    const view = render(<ResizeHarness width={40} />);
    await settle();
    getFrameAt.mockClear();
    screen.pushedFrames.length = 0;
    screen.rows = ['resized-row'];

    view.rerender(<ResizeHarness width={20} />);
    await settle();

    expect(screen.regions.at(-1)).toEqual({ offsetCol: 1, offsetRow: 1, cols: 20, rows: 5 });
    expect(getFrameAt).toHaveBeenCalledWith(750);
    expect(screen.pushedFrames).toEqual([new Uint8Array([1])]);
    view.unmount();
  });

  it('does not resize a disposed screen during simultaneous visual and dimension replacement', async () => {
    const firstVisual = createFakeVisualSource();
    const firstScreen = createFakeVisualScreen();
    const replacement = createDeferred<AudioVisualSelection>();
    audioVisualMocks.openAudioVisual
      .mockResolvedValueOnce({ kind: 'source', visualKind: 'waveform', source: firstVisual.source, info: VISUAL_INFO, label: 'Track' })
      .mockReturnValueOnce(replacement.promise);
    managedScreenMocks.createManagedScreen.mockReturnValue(firstScreen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const view = renderVisual(resources);
    await settle();
    const regionCalls = firstScreen.regions.length;

    view.rerender(
      <VisualResourcesHarness ref={resources} enabled src="song.mp3" probe={AUDIO_PROBE} mode="artwork" width={20} height={8} />,
    );
    await settle();

    expect(firstScreen.disposeCalls).toBe(1);
    expect(firstScreen.regions).toHaveLength(regionCalls);
    view.unmount();
  });

  it('routes renderer failures to visual degradation without reporting a media error', async () => {
    const failure = new Error('visual frame failed');
    const visual = createFakeVisualSource(() => Promise.reject(failure));
    const screen = createFakeVisualScreen();
    const audio = createFakeAudio();
    mediaProbeMocks.probeMediaFile.mockResolvedValue(AUDIO_PROBE);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(audio.audio);
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'source', visualKind: 'waveform', source: visual.source, info: VISUAL_INFO, label: 'Track' });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const resources = createRef<ManagedAudioVisualResources>();
    const onMediaError = vi.fn();
    const FailureHarness = forwardRef<ManagedAudioVisualResources>((_, ref) => {
      const managedAudio = useManagedResources({ src: 'song.mp3', onError: onMediaError });
      const managed = useManagedVisualResources({ enabled: true, src: 'song.mp3', probe: managedAudio.probe, mode: 'waveform', width: 40, height: 12 });
      useAudioVisualRenderer({
        source: managed.source,
        info: managed.info,
        screen: managed.screen,
        playing: false,
        getElapsedMs: () => 0,
        onReady: () => undefined,
        onVisualError: managed.degradeToPlaceholder,
      });
      useImperativeHandle(ref, () => managed, [managed]);
      return null;
    });
    const view = render(<FailureHarness ref={resources} />);
    await settle();

    expect(resources.current?.status).toBe('placeholder');
    expect(onMediaError).not.toHaveBeenCalled();
    expect(screen.disposeCalls).toBe(1);
    expect(visual.closeCalls).toBe(1);
    view.unmount();
  });
});

describe('useAudioVisualRenderer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pushes immediately and becomes ready only after frame and source buffering clear', async () => {
    let buffering = true;
    const visual = createFakeVisualSource();
    visual.source.isBuffering = () => buffering;
    const screen = createFakeVisualScreen();
    const onReady = vi.fn();
    const renderer = createRef<AudioVisualRenderer>();
    const view = render(
      <VisualRendererHarness ref={renderer} source={visual.source} info={VISUAL_INFO} screen={screen.screen} playing={false} getElapsedMs={() => 250} onReady={onReady} onVisualError={vi.fn()} />,
    );
    await flush();
    expect(screen.pushedFrames).toHaveLength(1);
    expect(renderer.current?.ready).toBe(false);

    buffering = false;
    renderer.current?.repaint();
    await flush();
    expect(renderer.current?.ready).toBe(true);
    expect(onReady).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('ticks at the visual frame rate while playing with an in-flight guard', async () => {
    const frame = createDeferred<Uint8Array | null>();
    const getFrameAt = vi.fn(() => frame.promise);
    const visual = createFakeVisualSource(getFrameAt);
    const screen = createFakeVisualScreen();
    const view = render(
      <VisualRendererHarness source={visual.source} info={VISUAL_INFO} screen={screen.screen} playing getElapsedMs={() => 500} onReady={vi.fn()} onVisualError={vi.fn()} />,
    );
    await advance(120);
    expect(getFrameAt).toHaveBeenCalledTimes(1);
    frame.resolve(new Uint8Array([1]));
    await flush();
    await advance(40);
    expect(getFrameAt).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('queues a region repaint behind an in-flight paused frame', async () => {
    const firstFrame = createDeferred<Uint8Array | null>();
    const getFrameAt = vi
      .fn<FrameSource['getFrameAt']>()
      .mockReturnValueOnce(firstFrame.promise)
      .mockResolvedValue(new Uint8Array([2]));
    const visual = createFakeVisualSource(getFrameAt);
    const screen = createFakeVisualScreen();
    const view = render(
      <VisualRendererHarness source={visual.source} info={VISUAL_INFO} screen={screen.screen} playing={false} getElapsedMs={() => 750} onReady={vi.fn()} onVisualError={vi.fn()} regionRevision={0} />,
    );

    view.rerender(
      <VisualRendererHarness source={visual.source} info={VISUAL_INFO} screen={screen.screen} playing={false} getElapsedMs={() => 750} onReady={vi.fn()} onVisualError={vi.fn()} regionRevision={1} />,
    );
    await flush();
    expect(getFrameAt).toHaveBeenCalledTimes(1);

    firstFrame.resolve(new Uint8Array([1]));
    await flush();
    expect(getFrameAt).toHaveBeenCalledTimes(2);
    expect(getFrameAt).toHaveBeenLastCalledWith(750);
    view.unmount();
  });

  it('ignores a stale fetch after source replacement', async () => {
    const staleFrame = createDeferred<Uint8Array | null>();
    const stale = createFakeVisualSource(() => staleFrame.promise);
    const current = createFakeVisualSource(() => Promise.resolve(new Uint8Array([2])));
    const screen = createFakeVisualScreen();
    const onReady = vi.fn();
    const view = render(
      <VisualRendererHarness source={stale.source} info={VISUAL_INFO} screen={screen.screen} playing={false} getElapsedMs={() => 0} onReady={onReady} onVisualError={vi.fn()} />,
    );
    view.rerender(
      <VisualRendererHarness source={current.source} info={VISUAL_INFO} screen={screen.screen} playing={false} getElapsedMs={() => 0} onReady={onReady} onVisualError={vi.fn()} />,
    );
    await flush();
    staleFrame.resolve(new Uint8Array([1]));
    await flush();

    expect(screen.pushedFrames).toEqual([new Uint8Array([2])]);
    expect(onReady).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('reports one visual error per source and stops its renderer', async () => {
    const failure = new Error('frame failed');
    const getFrameAt = vi.fn(() => Promise.reject(failure));
    const visual = createFakeVisualSource(getFrameAt);
    const screen = createFakeVisualScreen();
    const onVisualError = vi.fn();
    const renderer = createRef<AudioVisualRenderer>();
    const view = render(
      <VisualRendererHarness ref={renderer} source={visual.source} info={VISUAL_INFO} screen={screen.screen} playing getElapsedMs={() => 0} onReady={vi.fn()} onVisualError={onVisualError} />,
    );
    await flush();
    renderer.current?.repaint();
    await advance(200);

    expect(onVisualError).toHaveBeenCalledOnce();
    expect(onVisualError).toHaveBeenCalledWith(failure);
    expect(getFrameAt).toHaveBeenCalledOnce();
    view.unmount();
  });
});

describe('AudioPlayerView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  const viewProps = (
    overrides: Partial<AudioPlayerViewProps> = {},
  ): AudioPlayerViewProps => ({
    audio: null,
    durationMs: 2_000,
    resourceStatus: 'ready',
    autoPlay: false,
    loop: false,
    muted: false,
    controls: true,
    keyboard: false,
    height: 1,
    visualStatus: 'none',
    visualSource: null,
    visualInfo: null,
    visualScreen: null,
    visualRows: [],
    visualLabel: null,
    onVisualError: () => undefined,
    ...overrides,
  });

  it('runs transport, time rendering, seek, and loop from the wall clock without audio', async () => {
    const ref = createRef<AudioRef>();
    const view = render(<AudioPlayerView ref={ref} {...viewProps({ autoPlay: true, loop: true })} />);
    await flush();
    await advance(1_050);
    expect(ref.current?.currentTime).toBeCloseTo(1.05, 1);
    expect(view.lastFrame()).toContain('0:01 / 0:02');

    ref.current!.currentTime = 1.75;
    expect(ref.current?.currentTime).toBe(1.75);
    await advance(350);
    expect(ref.current?.paused).toBe(false);
    expect(ref.current!.currentTime).toBeLessThan(0.2);
    view.unmount();
  });

  it('waits for metadata and the first buffered visual frame before autoplay starts', async () => {
    const audio = createFakeAudio();
    const firstFrame = createDeferred<Uint8Array | null>();
    const visual = createFakeVisualSource(() => firstFrame.promise);
    const screen = createFakeVisualScreen();
    const view = render(
      <AudioPlayerView
        {...viewProps({
          audio: audio.audio,
          autoPlay: true,
          visualStatus: 'ready',
          visualSource: visual.source,
          visualInfo: VISUAL_INFO,
          visualScreen: screen.screen,
          visualRows: screen.rows,
          height: 2,
        })}
      />,
    );
    await flush();
    expect(audio.playFroms).toEqual([]);

    firstFrame.resolve(new Uint8Array([1]));
    await flush();
    expect(audio.playFroms).toEqual([0]);
    view.unmount();
  });

  it.each(['none', 'placeholder'] as const)(
    'releases autoplay immediately for a %s visual outcome',
    async (visualStatus) => {
      const audio = createFakeAudio();
      const view = render(
        <AudioPlayerView
          {...viewProps({
            audio: audio.audio,
            autoPlay: true,
            visualStatus,
            visualLabel: visualStatus === 'placeholder' ? 'Track' : null,
          })}
        />,
      );
      await flush();

      expect(audio.playFroms).toEqual([0]);
      view.unmount();
    },
  );

  it('renders visual frames at ref time and repaints after seeks and resizes', async () => {
    const times: number[] = [];
    const visual = createFakeVisualSource((timeMs) => {
      times.push(timeMs);
      return Promise.resolve(new Uint8Array([1]));
    });
    const screen = createFakeVisualScreen();
    const ref = createRef<AudioRef>();
    const firstProps = viewProps({
      visualStatus: 'ready',
      visualSource: visual.source,
      visualInfo: VISUAL_INFO,
      visualScreen: screen.screen,
      visualRows: screen.rows,
      width: 30,
      height: 8,
    });
    const view = render(<AudioPlayerView ref={ref} {...firstProps} />);
    await flush();
    times.length = 0;

    ref.current!.currentTime = 1.25;
    await flush();
    expect(times.at(-1)).toBe(1_250);

    view.rerender(<AudioPlayerView ref={ref} {...firstProps} width={40} />);
    await flush();
    expect(times.at(-1)).toBe(1_250);
    view.unmount();
  });

  it('retains the previous frame when the visual source has no new frame', async () => {
    const visual = createFakeVisualSource(
      vi
        .fn<FrameSource['getFrameAt']>()
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockResolvedValue(null),
    );
    const screen = createFakeVisualScreen();
    const ref = createRef<AudioRef>();
    const view = render(
      <AudioPlayerView
        ref={ref}
        {...viewProps({
          visualStatus: 'ready',
          visualSource: visual.source,
          visualInfo: VISUAL_INFO,
          visualScreen: screen.screen,
          visualRows: screen.rows,
          height: 2,
        })}
      />,
    );
    await flush();
    ref.current!.currentTime = 1;
    await flush();

    expect(screen.pushedFrames).toEqual([new Uint8Array([1])]);
    view.unmount();
  });
});

describe('Audio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lays out optional visuals and controls within the requested dimensions', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'placeholder', label: 'Track' });

    const controlsOnly = render(<Audio src="song.mp3" />);
    const defaultVisual = render(<Audio src="song.mp3" visual />);
    const artwork = render(<Audio src="song.mp3" visual="artwork" width={30} height={8} />);
    const waveform = render(
      <Audio
        src="song.mp3"
        visual="waveform"
        controls={false}
        width={30}
        height={8}
      />,
    );
    await flush();

    expect(controlsOnly.lastFrame()?.split('\n')).toHaveLength(1);
    expect(controlsOnly.lastFrame()).toHaveLength(47);
    expect(defaultVisual.lastFrame()?.split('\n')).toHaveLength(13);
    expect(defaultVisual.lastFrame()?.split('\n').at(5)?.trim()).toBe('Track');
    expect(artwork.lastFrame()?.split('\n')).toHaveLength(8);
    expect(artwork.lastFrame()?.split('\n').at(3)?.trim()).toBe('Track');
    expect(waveform.lastFrame()?.split('\n')).toHaveLength(8);
    expect(waveform.lastFrame()?.split('\n').at(3)?.trim()).toBe('Track');

    controlsOnly.unmount();
    defaultVisual.unmount();
    artwork.unmount();
    waveform.unmount();
  });

  it('gives a one-row component to controls and renders nothing with no content', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    audioVisualMocks.openAudioVisual.mockResolvedValue({ kind: 'placeholder', label: 'Track' });
    const controls = render(<Audio src="song.mp3" visual height={1} />);
    const empty = render(<Audio src="song.mp3" controls={false} />);
    await flush();

    expect(controls.lastFrame()?.split('\n')).toHaveLength(1);
    expect(controls.lastFrame()).not.toContain('Track');
    expect(empty.lastFrame()).toBe('');
    controls.unmount();
    empty.unmount();
  });

  it('replaces only visual resources while preserving audio and playhead', async () => {
    const audio = createFakeAudio();
    const artwork = createFakeVisualSource();
    const waveform = createFakeVisualSource();
    const artworkScreen = createFakeVisualScreen();
    const waveformScreen = createFakeVisualScreen();
    mockSuccessfulLoad(audio, 20_000);
    audioVisualMocks.openAudioVisual
      .mockResolvedValueOnce({
        kind: 'source',
        visualKind: 'artwork',
        source: artwork.source,
        info: VISUAL_INFO,
        label: 'Track',
      })
      .mockResolvedValueOnce({
        kind: 'source',
        visualKind: 'waveform',
        source: waveform.source,
        info: VISUAL_INFO,
        label: 'Track',
      });
    managedScreenMocks.createManagedScreen
      .mockReturnValueOnce(artworkScreen.screen)
      .mockReturnValueOnce(waveformScreen.screen);
    const ref = createRef<AudioRef>();
    const view = render(<Audio ref={ref} src="song.mp3" visual="artwork" />);
    await flush();
    ref.current!.currentTime = 5;

    view.rerender(<Audio ref={ref} src="song.mp3" visual="waveform" />);
    await flush();

    expect(mediaProbeMocks.probeMediaFile).toHaveBeenCalledOnce();
    expect(ffmpegAudioMocks.createFfmpegAudioPlayer).toHaveBeenCalledOnce();
    expect(artwork.closeCalls).toBe(1);
    expect(artworkScreen.disposeCalls).toBe(1);
    expect(audio.closeCalls).toBe(0);
    expect(ref.current?.currentTime).toBe(5);
    view.unmount();
  });

  it('degrades a failed runtime visual without pausing or reporting a media error', async () => {
    const audio = createFakeAudio();
    const failure = new Error('visual failed');
    const visual = createFakeVisualSource(
      vi
        .fn<FrameSource['getFrameAt']>()
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockRejectedValue(failure),
    );
    const screen = createFakeVisualScreen();
    mockSuccessfulLoad(audio, 20_000);
    audioVisualMocks.openAudioVisual.mockResolvedValue({
      kind: 'source',
      visualKind: 'waveform',
      source: visual.source,
      info: VISUAL_INFO,
      label: 'Track',
    });
    managedScreenMocks.createManagedScreen.mockReturnValue(screen.screen);
    const onError = vi.fn();
    const ref = createRef<AudioRef>();
    const view = render(
      <Audio ref={ref} src="song.mp3" visual="waveform" autoPlay onError={onError} />,
    );
    await flush();
    await advance(100);

    expect(view.lastFrame()).toContain('Track');
    expect(ref.current?.paused).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    view.unmount();
  });

  it('shows controls by default and hides them only when controls is false', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    const shown = render(<Audio src="song.mp3" />);
    await flush();
    expect(shown.lastFrame()).toContain(PAUSE_GLYPH);
    expect(shown.lastFrame()).toContain('0:00 / 0:20');
    shown.unmount();

    const hidden = render(<Audio src="song.mp3" controls={false} />);
    await flush();
    expect(hidden.lastFrame()).toBe('');
    hidden.unmount();
  });

  it('exposes HTML-shaped transport and metadata through AudioRef', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    const ref = createRef<AudioRef>();
    const view = render(<Audio ref={ref} src="song.mp3" />);
    await flush();

    expect(ref.current?.duration).toBe(20);
    expect(ref.current?.paused).toBe(true);
    ref.current!.currentTime = 5;
    await ref.current?.play();
    expect(harness.playFroms).toEqual([5_000]);
    ref.current!.muted = true;
    await flush();
    expect(harness.mutedValues.at(-1)).toBe(true);
    expect(ref.current?.muted).toBe(true);
    view.unmount();
  });

  it('exposes current ref state inside transport callbacks', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 1_000);
    const ref = createRef<AudioRef>();
    const snapshots: Array<Pick<AudioRef, 'paused' | 'ended' | 'muted'>> = [];
    const capture = (): void => {
      snapshots.push({
        paused: ref.current!.paused,
        ended: ref.current!.ended,
        muted: ref.current!.muted,
      });
    };
    const view = render(
      <Audio
        ref={ref}
        src="song.mp3"
        onPlay={capture}
        onPause={capture}
        onEnded={capture}
      />,
    );
    await flush();

    ref.current!.muted = true;
    await ref.current!.play();
    ref.current!.pause();
    await ref.current!.play();
    await advance(AUDIO_TICK_MS + 1_000);

    expect(snapshots).toEqual([
      { paused: false, ended: false, muted: true },
      { paused: true, ended: false, muted: true },
      { paused: false, ended: false, muted: true },
      { paused: true, ended: true, muted: true },
      { paused: true, ended: true, muted: true },
    ]);
    view.unmount();
  });

  it('makes metadata available and seekable before autoplay', async () => {
    const harness = createFakeAudio();
    const events: string[] = [];
    harness.audio.playFrom = (timeMs) => {
      harness.playFroms.push(timeMs);
      events.push(`play:${timeMs}`);
    };
    mockSuccessfulLoad(harness, 20_000);
    const ref = createRef<AudioRef>();
    const view = render(
      <Audio
        ref={ref}
        src="song.mp3"
        autoPlay
        onLoadedMetadata={() => {
          events.push(`metadata:${ref.current?.duration}`);
          ref.current!.currentTime = 5;
        }}
      />,
    );
    await flush();

    expect(events).toEqual(['metadata:20', 'play:5000']);
    expect(ref.current?.currentTime).toBe(5);
    view.unmount();
  });

  it('lets metadata pause cancel pending autoplay', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    const ref = createRef<AudioRef>();
    const view = render(
      <Audio
        ref={ref}
        src="song.mp3"
        autoPlay
        onLoadedMetadata={() => ref.current?.pause()}
      />,
    );
    await flush();

    expect(harness.playFroms).toEqual([]);
    expect(ref.current?.paused).toBe(true);
    view.unmount();
  });

  it('applies a replacement metadata seek before starting the new player', async () => {
    const first = createFakeAudio();
    const second = createFakeAudio();
    mediaProbeMocks.probeMediaFile
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 20_000, coverArt: null, title: null })
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 10_000, coverArt: null, title: null });
    ffmpegAudioMocks.createFfmpegAudioPlayer
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const ref = createRef<AudioRef>();
    const view = render(
      <Audio
        ref={ref}
        src="first.mp3"
        autoPlay
        onLoadedMetadata={(event: AudioLoadedMetadataEvent) => {
          if (event.duration === 10) {
            ref.current!.currentTime = 5;
          }
        }}
      />,
    );
    await flush();
    expect(first.playFroms).toEqual([0]);

    view.rerender(
      <Audio
        ref={ref}
        src="second.mp3"
        autoPlay
        onLoadedMetadata={(event: AudioLoadedMetadataEvent) => {
          if (event.duration === 10) {
            ref.current!.currentTime = 5;
          }
        }}
      />,
    );
    await flush();

    expect(second.playFroms).toEqual([5_000]);
    expect(ref.current?.paused).toBe(false);
    view.unmount();
  });

  it('lets replacement metadata pause prevent the new player from starting', async () => {
    const first = createFakeAudio();
    const second = createFakeAudio();
    mediaProbeMocks.probeMediaFile
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 20_000, coverArt: null, title: null })
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 10_000, coverArt: null, title: null });
    ffmpegAudioMocks.createFfmpegAudioPlayer
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const ref = createRef<AudioRef>();
    const onLoadedMetadata = (event: AudioLoadedMetadataEvent): void => {
      if (event.duration === 10) {
        ref.current?.pause();
      }
    };
    const view = render(
      <Audio
        ref={ref}
        src="first.mp3"
        autoPlay
        onLoadedMetadata={onLoadedMetadata}
      />,
    );
    await flush();
    expect(first.playFroms).toEqual([0]);

    view.rerender(
      <Audio
        ref={ref}
        src="second.mp3"
        autoPlay
        onLoadedMetadata={onLoadedMetadata}
      />,
    );
    await flush();

    expect(second.playFroms).toEqual([]);
    expect(ref.current?.paused).toBe(true);
    view.unmount();
  });

  it('delays loading and buffering indicators and hides them without controls', async () => {
    const pending = createDeferred<{
      kind: 'audio';
      durationMs: number;
      coverArt: null;
      title: null;
    }>();
    const harness = createFakeAudio();
    mediaProbeMocks.probeMediaFile.mockReturnValue(pending.promise);
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(harness.audio);
    const loading = render(<Audio src="song.mp3" />);
    await advance(LOADING_DELAY_MS - 1);
    expect(loading.lastFrame()).not.toContain(LOADING_TEXT);
    await advance(1);
    expect(loading.lastFrame()).toContain(LOADING_TEXT);
    loading.unmount();

    const hidden = render(<Audio src="song.mp3" controls={false} />);
    await advance(LOADING_DELAY_MS);
    expect(hidden.lastFrame()).toBe('');
    hidden.unmount();

    harness.starting = true;
    mockSuccessfulLoad(harness, 20_000);
    const buffering = render(<Audio src="song.mp3" autoPlay />);
    await flush();
    await advance(LOADING_DELAY_MS - 1);
    expect(buffering.lastFrame()).not.toContain(BUFFERING_TEXT);
    await advance(1);
    expect(buffering.lastFrame()).toContain(BUFFERING_TEXT);
    buffering.unmount();
  });

  it('uses width for the progress bar and centers the row within height', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    const natural = render(<Audio src="song.mp3" />);
    const sized = render(<Audio src="song.mp3" width={20} />);
    const narrow = render(<Audio src="song.mp3" width={5} />);
    const tall = render(<Audio src="song.mp3" height={3} />);
    await flush();

    expect(natural.lastFrame()).toHaveLength(47);
    expect(sized.lastFrame()).toHaveLength(20);
    expect(narrow.lastFrame()).toHaveLength(15);
    expect(tall.lastFrame()?.split('\n')).toEqual(['', natural.lastFrame(), '']);
    natural.unmount();
    sized.unmount();
    narrow.unmount();
    tall.unmount();
  });

  it('keeps buffering output within the effective narrow width', async () => {
    const harness = createFakeAudio();
    harness.starting = true;
    mockSuccessfulLoad(harness, 20_000);
    const view = render(<Audio src="song.mp3" autoPlay width={5} />);
    await flush();
    await advance(LOADING_DELAY_MS);

    expect(view.lastFrame()?.split('\n')).toHaveLength(1);
    expect(view.lastFrame()).toHaveLength(15);
    view.unmount();
  });

  it('handles transport keys only when keyboard is enabled', async () => {
    const enabledAudio = createFakeAudio();
    mockSuccessfulLoad(enabledAudio, 20_000);
    const enabled = render(<Audio src="song.mp3" keyboard />);
    await flush();
    enabled.stdin.write(' ');
    enabled.stdin.write('\u001B[C');
    enabled.stdin.write('\u001B[D');
    enabled.stdin.write('m');
    await flush();
    expect(enabledAudio.playFroms).toEqual([0, 5_000, 0]);
    expect(enabledAudio.mutedValues.at(-1)).toBe(true);
    enabled.unmount();

    const disabledAudio = createFakeAudio();
    mockSuccessfulLoad(disabledAudio, 20_000);
    const disabled = render(<Audio src="song.mp3" />);
    await flush();
    disabled.stdin.write(' ');
    disabled.stdin.write('\u001B[C');
    disabled.stdin.write('m');
    disabled.stdin.write('q');
    await flush();
    expect(disabledAudio.playFroms).toEqual([]);
    expect(disabledAudio.mutedValues).toEqual([false]);
    expect(appMocks.exit).not.toHaveBeenCalled();
    disabled.unmount();
  });

  it.each(['q', '\u0003'])('requests close before exiting for %j', async (input) => {
    const calls: string[] = [];
    const harness = createFakeAudio();
    harness.audio.close = () => {
      calls.push('close');
      return Promise.resolve();
    };
    appMocks.exit.mockImplementation(() => calls.push('exit'));
    mockSuccessfulLoad(harness, 20_000);
    const view = render(<Audio src="song.mp3" keyboard />);
    await flush();
    view.stdin.write(input);
    await flush();
    expect(calls).toEqual(['close', 'exit']);
    view.unmount();
  });

  it('renders children after errors even without controls and otherwise renders nothing', async () => {
    mediaProbeMocks.probeMediaFile.mockRejectedValue(new Error('failed'));
    ffmpegAudioMocks.createFfmpegAudioPlayer.mockReturnValue(createFakeAudio().audio);
    const fallback = render(
      <Audio src="song.mp3" controls={false}>
        <Text>audio unavailable</Text>
      </Audio>,
    );
    const empty = render(<Audio src="song.mp3" controls={false} />);
    await flush();
    expect(fallback.lastFrame()).toBe('audio unavailable');
    expect(empty.lastFrame()).toBe('');
    fallback.unmount();
    empty.unmount();
  });

  it('applies prop muting and reports metadata and time callbacks in seconds', async () => {
    const harness = createFakeAudio();
    const onLoadedMetadata = vi.fn();
    const onTimeUpdate = vi.fn();
    mockSuccessfulLoad(harness, 20_000);
    const view = render(
      <Audio
        src="song.mp3"
        muted
        autoPlay
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
      />,
    );
    await flush();
    expect(harness.mutedValues.at(-1)).toBe(true);
    expect(onLoadedMetadata).toHaveBeenCalledWith({ duration: 20 });
    await advance(AUDIO_TICK_MS + 1_000);
    expect(onTimeUpdate).toHaveBeenCalledWith({ currentTime: 1, duration: 20 });
    view.unmount();
  });

  it('synchronizes muted prop changes after mount', async () => {
    const harness = createFakeAudio();
    mockSuccessfulLoad(harness, 20_000);
    const ref = createRef<AudioRef>();
    const view = render(<Audio ref={ref} src="song.mp3" muted={false} />);
    await flush();
    expect(ref.current?.muted).toBe(false);

    view.rerender(<Audio ref={ref} src="song.mp3" muted />);
    await flush();
    expect(harness.mutedValues.at(-1)).toBe(true);
    expect(ref.current?.muted).toBe(true);
    view.unmount();
  });

  it('reports NaN before load and resets metadata and playhead when src changes', async () => {
    const first = createFakeAudio();
    const second = createFakeAudio();
    const secondProbe = createDeferred<{
      kind: 'audio';
      durationMs: number;
      coverArt: null;
      title: null;
    }>();
    mediaProbeMocks.probeMediaFile
      .mockResolvedValueOnce({ kind: 'audio', durationMs: 20_000, coverArt: null, title: null })
      .mockReturnValueOnce(secondProbe.promise);
    ffmpegAudioMocks.createFfmpegAudioPlayer
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const ref = createRef<AudioRef>();
    const view = render(<Audio ref={ref} src="first.mp3" />);
    expect(ref.current?.duration).toBe(Number.NaN);
    await flush();
    ref.current!.currentTime = 5;
    expect(ref.current?.currentTime).toBe(5);

    view.rerender(<Audio ref={ref} src="second.mp3" />);
    await flush();
    expect(ref.current?.duration).toBe(Number.NaN);
    expect(ref.current?.currentTime).toBe(0);
    secondProbe.resolve({ kind: 'audio', durationMs: 10_000, coverArt: null, title: null });
    await flush();
    expect(ref.current?.duration).toBe(10);
    view.unmount();
  });
});

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

  it('keeps an onTimeUpdate seek made while looping', async () => {
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
            clock.current?.seekToMs(500);
          }
        }}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_100);
    expect(clock.current?.getElapsedMs()).toBe(500);
    expect(harness.playFroms).toEqual([0, 500]);
    view.unmount();
  });

  it('keeps an onTimeUpdate seek made at the end', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const onEnded = vi.fn();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={1_000}
        autoPlay
        loop={false}
        onTimeUpdate={(event) => {
          if (event.currentTime === 1) {
            clock.current?.seekToMs(500);
          }
        }}
        onEnded={onEnded}
      />,
    );
    await flush();

    await advance(AUDIO_TICK_MS + 1_000);
    expect(clock.current?.getElapsedMs()).toBe(500);
    expect(clock.current?.playing).toBe(true);
    expect(clock.current?.ended).toBe(false);
    expect(harness.playFroms).toEqual([0, 500]);
    expect(onEnded).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps a nested onTimeUpdate seek made during a direct seek', async () => {
    const harness = createFakeAudio();
    const clock = createRef<AudioPlaybackClock>();
    const view = render(
      <ClockHarness
        ref={clock}
        audio={harness.audio}
        durationMs={20_000}
        autoPlay
        loop={false}
        onTimeUpdate={(event) => {
          if (event.currentTime === 1) {
            clock.current?.seekToMs(500);
          }
        }}
      />,
    );
    await flush();

    clock.current?.seekToMs(1_000);
    expect(clock.current?.getElapsedMs()).toBe(500);
    expect(harness.playFroms).toEqual([0, 500]);
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
