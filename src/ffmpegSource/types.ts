import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import type { VideoProbeResult } from '../mediaProbe/index.ts';

export interface FfmpegSourceOptions {
  /** Path to the video file to decode */
  filePath: string;
  /**
   * Pre-computed classification from probeMediaFile. When given, open()
   * skips its own probe, so a caller that already classified the file
   * (the cli does) never probes it twice.
   */
  probe?: VideoProbeResult;
}

/** Machine-readable reasons an ffmpeg source can fail (probe failures reject as MediaProbeError) */
export type FfmpegSourceErrorCode = 'NO_VIDEO_STREAM' | 'DECODE_FAILED';

/** Decode dimensions fitted within the MAX_DECODE_* caps */
export interface DecodeSize {
  /** Decode width in pixels, even */
  width: number;
  /** Decode height in pixels, even */
  height: number;
}

/** One decoded frame waiting in the readahead queue */
export interface DecodedFrame {
  /** Presentation timestamp in ms */
  timestampMs: number;
  /** Raw rgb24 bytes, width * height * 3 */
  data: Uint8Array;
}

/** One live ffmpeg decode process and its readahead state */
export interface Decoder {
  /** Decoded frames ahead of playback, oldest first */
  frames: DecodedFrame[];
  /** Timestamp the next frame off the pipe will carry */
  nextTimestampMs: number;
  /** True when this decoder was killed on purpose (seek, respawn, close) */
  killed: boolean;
  /** True once this decoder's process is gone for any reason (stream end, crash, spawn failure) */
  exited: boolean;
  /** The ffmpeg child process, stdout piped for frames, stderr piped for errors */
  child: ChildProcessByStdio<null, Readable, Readable>;
}
