import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

import ffprobeStatic from 'ffprobe-static';

import { MAX_DECODE_HEIGHT, MAX_DECODE_WIDTH, MS_PER_SECOND } from './consts.ts';
import { FfmpegSourceError } from './errors.ts';
import type { DecodeSize, ProbeResult } from './types.ts';

const execFileAsync = promisify(execFile);

/** Nearest even number, never below 2 (codec- and scaler-friendly dimensions) */
const toEven = (value: number): number => Math.max(2, 2 * Math.round(value / 2));

/**
 * Fits native dimensions within MAX_DECODE_WIDTH x MAX_DECODE_HEIGHT,
 * preserving aspect ratio and never upscaling.
 */
export const computeDecodeSize = (nativeWidth: number, nativeHeight: number): DecodeSize => {
  const scale = Math.min(1, MAX_DECODE_WIDTH / nativeWidth, MAX_DECODE_HEIGHT / nativeHeight);
  return { width: toEven(nativeWidth * scale), height: toEven(nativeHeight * scale) };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** ffprobe reports numbers both as JSON numbers and as decimal strings */
const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

/** r_frame_rate arrives as a fraction string like "30000/1001" */
const parseFrameRate = (value: unknown): number | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const [numerator, denominator = '1'] = value.split('/');
  const num = asFiniteNumber(numerator);
  const den = asFiniteNumber(denominator);
  if (num === null || den === null || num <= 0 || den <= 0) {
    return null;
  }
  return num / den;
};

/**
 * Reads the first video stream's metadata with ffprobe. Rejects with
 * FfmpegSourceError: FILE_NOT_FOUND, PROBE_FAILED (unreadable media or
 * missing metadata), or NO_VIDEO_STREAM.
 */
export const probeFile = async (filePath: string): Promise<ProbeResult> => {
  try {
    await access(filePath);
  } catch {
    throw new FfmpegSourceError('FILE_NOT_FOUND', `${filePath}: no such file`);
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(ffprobeStatic.path, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]));
  } catch (error) {
    const detail = isRecord(error) && typeof error.stderr === 'string' ? error.stderr.trim() : '';
    throw new FfmpegSourceError(
      'PROBE_FAILED',
      `${filePath}: not a readable media file${detail === '' ? '' : ` (${detail})`}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new FfmpegSourceError('PROBE_FAILED', `${filePath}: ffprobe emitted unparseable JSON`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.streams)) {
    throw new FfmpegSourceError('PROBE_FAILED', `${filePath}: ffprobe reported no streams`);
  }

  const video = parsed.streams.find(
    (stream): stream is Record<string, unknown> =>
      isRecord(stream) && stream.codec_type === 'video',
  );
  if (video === undefined) {
    throw new FfmpegSourceError('NO_VIDEO_STREAM', `${filePath}: no video stream`);
  }

  const nativeWidth = asFiniteNumber(video.width);
  const nativeHeight = asFiniteNumber(video.height);
  const fps = parseFrameRate(video.r_frame_rate);
  const durationSeconds =
    asFiniteNumber(video.duration) ??
    (isRecord(parsed.format) ? asFiniteNumber(parsed.format.duration) : null);

  if (
    nativeWidth === null || nativeWidth <= 0 ||
    nativeHeight === null || nativeHeight <= 0 ||
    fps === null ||
    durationSeconds === null || durationSeconds <= 0
  ) {
    throw new FfmpegSourceError(
      'PROBE_FAILED',
      `${filePath}: video stream is missing dimensions, frame rate, or duration`,
    );
  }

  return {
    nativeWidth,
    nativeHeight,
    durationMs: Math.round(durationSeconds * MS_PER_SECOND),
    fps,
  };
};
