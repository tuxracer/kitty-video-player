import { MAX_DECODE_HEIGHT, MAX_DECODE_WIDTH } from './consts.ts';
import type { DecodeSize } from './types.ts';

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
