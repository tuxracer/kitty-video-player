/** Milliseconds per second, for timestamp math (per-module duplicate, see src/index.ts) */
export const MS_PER_SECOND = 1_000;

/** PCM sample rate requested from ffmpeg and the audio device */
export const SAMPLE_RATE = 48_000;

/** Interleaved output channels (ffmpeg downmixes or upmixes everything to stereo) */
export const CHANNELS = 2;

/** Bytes per s16le sample */
export const BYTES_PER_SAMPLE = 2;

/** Requested device frame size in samples per channel (about 21 ms at 48 kHz) */
export const DEVICE_FRAME_SIZE = 1_024;

/** Cap on decoded-but-unplayed audio queued in the device, in ms */
export const AUDIO_QUEUE_CAP_MS = 500;

/**
 * RtAudio's RTAUDIO_SINT16 format flag. audify declares its formats as an
 * ambient const enum, which erasableSyntaxOnly cannot reference at runtime,
 * so the one value used lives here.
 */
export const RTAUDIO_FORMAT_SINT16 = 0x2;

/** Device output volume while muted */
export const VOLUME_MUTED = 0;

/** Device output volume while audible */
export const VOLUME_FULL = 1;

/**
 * Tick period of the adapter's frame-pacing timer, finer than one device
 * frame (about 21 ms at the default size) so backpressure resumes promptly
 */
export const FRAME_PACING_INTERVAL_MS = 10;

/** Rolling tail of ffmpeg stderr kept for error reporting */
export const STDERR_TAIL_MAX_CHARS = 2_048;

/** One-time stderr notice when no audio device or audify binding is available */
export const AUDIO_UNAVAILABLE_MESSAGE =
  'kitty-video-player: audio output is unavailable, playing without sound';
