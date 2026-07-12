import { createInterface } from 'node:readline';

import { FALLBACK_YES_ANSWERS } from './consts.ts';
import type { ConfirmFallbackOptions } from './types.ts';

/**
 * Ask whether to continue in fallback mode. Writes the given prompt to output
 * (stderr in production, keeping stdout clean for the renderer) and reads one
 * line from input in cooked mode. Resolves true only for a y/yes answer.
 * Anything else, an empty line, or EOF resolves false. An input stream error
 * also resolves false instead of crashing the process. Runs before any
 * Screen or Ink render exists, so it owns stdin briefly and releases it.
 */
export const confirmFallback = ({ input, output, prompt }: ConfirmFallbackOptions): Promise<boolean> =>
  new Promise((resolve) => {
    const readline = createInterface({ input, terminal: false });
    output.write(prompt);
    let answered = false;
    readline.once('line', (line) => {
      answered = true;
      readline.close();
      resolve(FALLBACK_YES_ANSWERS.includes(line.trim().toLowerCase()));
    });
    readline.once('error', () => {
      answered = true;
      readline.close();
      resolve(false);
    });
    readline.once('close', () => {
      if (!answered) {
        resolve(false);
      }
    });
  });
