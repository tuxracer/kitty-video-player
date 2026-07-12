import { FIRST_BYTE_RANGE, HTTP_PARTIAL_CONTENT, RANGE_PROBE_TIMEOUT_MS } from './consts.ts';
import type { DetectRangeSupportOptions } from './types.ts';

export * from './consts.ts';
export * from './types.ts';

/**
 * True when the server answers a one-byte Range request with 206 Partial
 * Content, meaning ffmpeg can seek the URL with byte ranges (input-side
 * -ss). Everything else (a 200 full-body response, a network error, a
 * timeout) reports false and the decoders read the stream from the start
 * instead, so a false negative only makes seeking slower, never wrong.
 */
export const detectRangeSupport = async (
  url: string,
  { timeoutMs = RANGE_PROBE_TIMEOUT_MS }: DetectRangeSupportOptions = {},
): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      headers: { range: FIRST_BYTE_RANGE },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // The status is the answer, the body just holds the connection open
    await response.body?.cancel();
    return response.status === HTTP_PARTIAL_CONTENT;
  } catch {
    return false;
  }
};
