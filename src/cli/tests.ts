import { describe, expect, it } from 'vitest';

// Import from parseCliArgs.ts directly (not ./index.tsx) because importing
// the entry module would run the CLI at module top level.
import { parseCliArgs } from './parseCliArgs.ts';

describe('parseCliArgs', () => {
  it('returns play when no arguments are given', () => {
    expect(parseCliArgs([])).toEqual({ action: 'play' });
  });

  it('returns help for --help', () => {
    expect(parseCliArgs(['--help'])).toEqual({ action: 'help' });
  });

  it('returns help for -h', () => {
    expect(parseCliArgs(['-h'])).toEqual({ action: 'help' });
  });

  it('returns version for --version', () => {
    expect(parseCliArgs(['--version'])).toEqual({ action: 'version' });
  });

  it('returns version for -v', () => {
    expect(parseCliArgs(['-v'])).toEqual({ action: 'version' });
  });

  it('returns unsupported-file naming the file for a positional argument', () => {
    expect(parseCliArgs(['movie.mp4'])).toEqual({
      action: 'unsupported-file',
      file: 'movie.mp4',
    });
  });

  it('reports only the first of several positional arguments', () => {
    expect(parseCliArgs(['a.mp4', 'b.mp4'])).toEqual({
      action: 'unsupported-file',
      file: 'a.mp4',
    });
  });

  it('prefers help over a positional file', () => {
    expect(parseCliArgs(['--help', 'movie.mp4'])).toEqual({ action: 'help' });
  });

  it('prefers help over version when both flags are given', () => {
    expect(parseCliArgs(['--version', '--help'])).toEqual({ action: 'help' });
  });

  it('returns usage-error with a message naming an unknown flag', () => {
    const result = parseCliArgs(['--bogus']);
    expect(result.action).toBe('usage-error');
    if (result.action === 'usage-error') {
      expect(result.message).toContain('--bogus');
    }
  });

  it('returns usage-error for an unknown short flag', () => {
    const result = parseCliArgs(['-x']);
    expect(result.action).toBe('usage-error');
  });
});
