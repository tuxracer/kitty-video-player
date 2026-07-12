import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface FfmpegAudioPlayerOptions {
  /** Path of the media file whose audio track plays */
  filePath: string;
  /** Injectable device factory (the audify RtAudio adapter in production) */
  createDevice?: CreateAudioDevice;
}

export interface AudioDeviceOptions {
  /** Sample frames per second */
  sampleRate: number;
  /** Interleaved channel count */
  channels: number;
  /** Requested samples per channel per write (the device may adjust it, see AudioDevice.frameSize) */
  frameSize: number;
  /** Called once each time a written frame finishes playing on the device */
  onFrameDone: () => void;
}

/**
 * Structural seam over the audify RtAudio output stream, so tests can pass a
 * fake and CI never opens a real sound device.
 */
export interface AudioDevice {
  /** Actual samples per channel per write (openStream may adjust the requested size) */
  frameSize: number;
  /** Queues one device frame of interleaved s16le PCM (frameSize * channels * 2 bytes) */
  write(pcm: Buffer): void;
  /** Drops all queued-but-unplayed PCM */
  clearQueue(): void;
  /** Output volume, VOLUME_MUTED silences and VOLUME_FULL restores */
  setVolume(volume: number): void;
  /** Stops and closes the device stream */
  close(): void;
}

/** Opens an audio output device, or resolves null when none is available */
export type CreateAudioDevice = (options: AudioDeviceOptions) => Promise<AudioDevice | null>;

/** Structural subset of audify's RtAudio instance that the adapter drives */
export interface RtAudioStream {
  /** Output volume between 0 and 1 */
  outputVolume: number;
  openStream(
    output: { deviceId: number; nChannels: number },
    input: null,
    format: number,
    sampleRate: number,
    frameSize: number,
    streamName: string,
    inputCallback: null,
    frameOutputCallback: () => void,
  ): number;
  getDefaultOutputDevice(): number;
  start(): void;
  stop(): void;
  closeStream(): void;
  write(pcm: Buffer): void;
  clearOutputQueue(): void;
}

/** One live ffmpeg audio decode process */
export interface AudioDecoder {
  /** Playback offset the decode started from (the -ss value), in ms */
  startMs: number;
  /** True when this decoder was killed on purpose (pause, respawn, close) */
  killed: boolean;
  /** The ffmpeg child process, stdout piped for PCM, stderr piped for errors */
  child: ChildProcessByStdio<null, Readable, Readable>;
}
