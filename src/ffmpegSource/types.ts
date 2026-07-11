export interface FfmpegSourceOptions {
  /** Path to the video file to decode */
  filePath: string;
}

/** Machine-readable reasons an ffmpeg source can fail */
export type FfmpegSourceErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PROBE_FAILED'
  | 'NO_VIDEO_STREAM'
  | 'DECODE_FAILED';

/** Video stream metadata read by ffprobe, in source-native dimensions */
export interface ProbeResult {
  /** Native pixel width of the video stream */
  nativeWidth: number;
  /** Native pixel height of the video stream */
  nativeHeight: number;
  /** Total duration in ms */
  durationMs: number;
  /** Native frame rate */
  fps: number;
}

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
