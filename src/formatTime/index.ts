import {
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  PADDED_FIELD_WIDTH,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from './consts.ts';

export * from './consts.ts';

/**
 * Format a millisecond timestamp as m:ss (0:00, 12:34), switching to h:mm:ss
 * once the time reaches one hour (1:00:00). Truncates to whole seconds.
 * Negative or non-finite input clamps to 0:00.
 */
export const formatTime = (ms: number): string => {
  const totalSeconds = Number.isFinite(ms)
    ? Math.max(Math.floor(ms / MS_PER_SECOND), 0)
    : 0;
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const paddedSeconds = String(seconds).padStart(PADDED_FIELD_WIDTH, '0');
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);

  if (hours > 0) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
    const paddedMinutes = String(minutes).padStart(PADDED_FIELD_WIDTH, '0');
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  return `${minutes}:${paddedSeconds}`;
};
