import { detectKittyUnicodePlaceholderSupport, isMultiplexedSession } from 'kitty-motion';
import type { SessionEnv } from 'kitty-motion';

import type { FallbackReason } from './types.ts';

/**
 * Why the kitty-graphics player cannot run here. An empty array means fully
 * supported. Both checks are synchronous and env-based (no terminal round
 * trip), and both can fire at once (tmux on a non-kitty terminal). The env
 * parameter is injectable for tests and defaults to process.env.
 */
export const detectFallbackReasons = (env: SessionEnv = process.env): FallbackReason[] => {
  const reasons: FallbackReason[] = [];
  if (!detectKittyUnicodePlaceholderSupport(env)) {
    reasons.push('no-placeholder-support');
  }
  if (isMultiplexedSession(env)) {
    reasons.push('multiplexed-session');
  }
  return reasons;
};
