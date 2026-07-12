import { describe, expect, it } from 'vitest';

import { isRecord } from './index.ts';

describe('isRecord', () => {
  it('accepts plain objects and arrays are objects too', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, primitives, and undefined', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('text')).toBe(false);
    expect(isRecord(3)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});
