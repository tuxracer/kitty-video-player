import type { FfmpegSourceErrorCode } from './types.ts';

/** Typed failure from probing or decoding a video file */
export class FfmpegSourceError extends Error {
  readonly code: FfmpegSourceErrorCode;

  constructor(code: FfmpegSourceErrorCode, message: string) {
    super(message);
    this.name = 'FfmpegSourceError';
    this.code = code;
  }
}

export const isFfmpegSourceError = (error: unknown): error is FfmpegSourceError =>
  error instanceof FfmpegSourceError;
