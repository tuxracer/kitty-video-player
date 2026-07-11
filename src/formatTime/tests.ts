import { describe, expect, it } from 'vitest';

import { formatTime } from './index.ts';

describe('formatTime', () => {
  it('formats zero as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds below one minute', () => {
    expect(formatTime(59_000)).toBe('0:59');
  });

  it('rolls over to minutes', () => {
    expect(formatTime(60_000)).toBe('1:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(754_000)).toBe('12:34');
  });

  it('switches to h:mm:ss at one hour', () => {
    expect(formatTime(3_600_000)).toBe('1:00:00');
  });

  it('stays in m:ss just below one hour', () => {
    expect(formatTime(3_599_999)).toBe('59:59');
  });

  it('clamps negative input to 0:00', () => {
    expect(formatTime(-5_000)).toBe('0:00');
  });

  it('clamps NaN input to 0:00', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
  });

  it('floors partial seconds', () => {
    expect(formatTime(61_500)).toBe('1:01');
  });
});
