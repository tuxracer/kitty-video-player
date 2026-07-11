/** Milliseconds per second, for timestamp math (per-module duplicate, see src/index.ts) */
export const MS_PER_SECOND = 1_000;

/** Bytes per rgb24 pixel */
export const RGB_CHANNELS = 3;

/**
 * Decode dimension caps. kitty-motion scales the framebuffer to the panel
 * region anyway, so decoding beyond this is wasted memory and CPU (a 4K
 * rgb24 frame is about 24 MB, a capped one about 1.5 MB).
 */
export const MAX_DECODE_WIDTH = 960;
export const MAX_DECODE_HEIGHT = 540;

/** Hard cap on the readahead queue (about one second of video, but never more frames than this) */
export const READAHEAD_FRAME_CAP = 60;

/** Rolling tail of ffmpeg stderr kept for error reporting */
export const STDERR_TAIL_MAX_CHARS = 2_048;
