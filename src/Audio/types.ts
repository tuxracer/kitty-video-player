import type { ReactNode } from 'react';

import type { AudioPlayer } from '../audioPlayer/index.ts';
import type { AudioVisualMode, AudioVisualProp } from '../audioVisual/index.ts';
import type { FrameSource, FrameSourceInfo } from '../frameSource/index.ts';
import type { AudioProbeResult } from '../mediaProbe/index.ts';
import type { PlayerScreen } from '../Video/index.tsx';

export type AudioErrorCode = 'NO_AUDIO_STREAM' | 'AUDIO_UNAVAILABLE';

export class AudioError extends Error {
  readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode) {
    super(code);
    this.name = 'AudioError';
    this.code = code;
  }
}

export const isAudioError = (error: unknown): error is AudioError => error instanceof AudioError;

export interface AudioTimeUpdateEvent {
  currentTime: number;
  duration: number;
}

export interface AudioLoadedMetadataEvent {
  duration: number;
}

export type ManagedAudioStatus = 'loading' | 'error' | 'ready';

export interface ManagedAudioResources {
  status: ManagedAudioStatus;
  audio: AudioPlayer | null;
  durationMs: number | null;
  probe: AudioProbeResult | null;
}

export interface ManagedAudioResourcesOptions {
  src: string;
  onLoadedMetadata?: (event: AudioLoadedMetadataEvent) => void;
  onError?: (error: unknown) => void;
}

export type ManagedAudioVisualStatus = 'none' | 'loading' | 'placeholder' | 'ready';

export interface ManagedAudioVisualResources {
  status: ManagedAudioVisualStatus;
  label: string | null;
  source: FrameSource | null;
  info: FrameSourceInfo | null;
  screen: PlayerScreen | null;
  placeholderRows: string[];
  regionRevision: number;
  degradeToPlaceholder(): void;
}

export interface ManagedAudioVisualResourcesOptions {
  enabled: boolean;
  src: string;
  probe: AudioProbeResult | null;
  mode: AudioVisualMode;
  width: number;
  height: number;
}

export interface AudioVisualRendererOptions {
  source: FrameSource | null;
  info: FrameSourceInfo | null;
  screen: PlayerScreen | null;
  playing: boolean;
  getElapsedMs(): number;
  onReady(): void;
  onVisualError(error: unknown): void;
  regionRevision?: number;
}

export interface AudioVisualRenderer {
  ready: boolean;
  repaint(): void;
}

export interface AudioPlaybackCallbacks {
  onTimeUpdate?: (event: AudioTimeUpdateEvent) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: unknown) => void;
}

export interface AudioPlaybackClockOptions extends AudioPlaybackCallbacks {
  audio: AudioPlayer | null;
  durationMs: number | null;
  autoPlay: boolean;
  loop: boolean;
  startBlocked?: boolean;
}

export interface AudioPlaybackClock {
  playing: boolean;
  elapsedMs: number;
  ended: boolean;
  buffering: boolean;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekToMs(targetMs: number): void;
  releaseStart(): void;
  getElapsedMs(): number;
}

export interface AudioRef {
  play(): Promise<void>;
  pause(): void;
  currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
  muted: boolean;
  readonly duration: number;
}

export interface AudioProps extends AudioPlaybackCallbacks {
  src: string;
  visual?: AudioVisualProp;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  keyboard?: boolean;
  width?: number;
  height?: number;
  children?: ReactNode;
  onLoadedMetadata?: (event: AudioLoadedMetadataEvent) => void;
}

export interface AudioPlayerViewProps extends AudioPlaybackCallbacks {
  audio: AudioPlayer | null;
  durationMs: number | null;
  resourceStatus: ManagedAudioStatus;
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  controls: boolean;
  keyboard: boolean;
  width?: number;
  height: number;
  visualStatus: ManagedAudioVisualStatus;
  visualSource: FrameSource | null;
  visualInfo: FrameSourceInfo | null;
  visualScreen: PlayerScreen | null;
  visualRows: string[];
  visualLabel: string | null;
  onVisualError(error: unknown): void;
  onLoadedMetadata?: (event: AudioLoadedMetadataEvent) => void;
  onQuit?: () => void;
  children?: ReactNode;
}
