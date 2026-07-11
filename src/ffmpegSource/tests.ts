import { describe, expect, it } from 'vitest';

import { FfmpegSourceError, isFfmpegSourceError } from './index.ts';

describe('FfmpegSourceError', () => {
  it('is identified by the isFfmpegSourceError guard', () => {
    const error = new FfmpegSourceError('FILE_NOT_FOUND', 'missing.mp4: no such file');
    expect(isFfmpegSourceError(error)).toBe(true);
    expect(error.code).toBe('FILE_NOT_FOUND');
    expect(error.message).toBe('missing.mp4: no such file');
    expect(error.name).toBe('FfmpegSourceError');
  });

  it('rejects plain errors and non-errors', () => {
    expect(isFfmpegSourceError(new Error('FILE_NOT_FOUND'))).toBe(false);
    expect(isFfmpegSourceError('FILE_NOT_FOUND')).toBe(false);
    expect(isFfmpegSourceError(null)).toBe(false);
  });
});
