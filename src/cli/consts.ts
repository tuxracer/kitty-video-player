import type { FallbackReason } from './types.ts';

/**
 * Package version printed by --version. Kept as a literal because importing
 * package.json from outside src/ breaks the tsconfig include. Keep in sync
 * with the "version" field in package.json.
 */
export const VERSION = '0.1.0';

/** Exit code for success paths (help, version, graceful unsupported-terminal exit) */
export const EXIT_OK = 0;

/** Exit code for usage errors and unplayable files */
export const EXIT_USAGE = 1;

/** Usage and controls text printed by --help (and to stderr after a usage error) */
export const HELP_TEXT = `kitty-player, a terminal video player (Ink UI with a kitty-motion video panel)

Usage:
  kitty-player            play the built-in procedural demo
  kitty-player <file>     play a video file (decoded with the bundled ffmpeg)

Options:
  -h, --help              print this help and exit
  -v, --version           print the version and exit
      --half-block        play with the half-block cell renderer instead of
                          kitty graphics (works on any terminal and inside
                          tmux or screen, reduced quality, no on-screen UI)

Controls:
  space                   play or pause
  left/right arrow        seek 5 seconds
  q or Ctrl-C             quit
  (the same keys work in half-block mode, there is just no on-screen UI)

The full player requires an interactive Kitty or Ghostty terminal (Kitty
graphics protocol with Unicode placeholder support) outside tmux/screen.
On other terminals kitty-player offers to play in half-block mode instead.`;

/** Printed to stderr when stdout is not an interactive terminal */
export const UNSUPPORTED_TERMINAL_MESSAGE =
  'kitty-player needs an interactive terminal (stdout is not a TTY). Nothing was drawn.';

/** First line of the warning printed before the half-block prompt */
export const FALLBACK_WARNING_HEADER = 'kitty-player: the full player cannot run here:';

/** One warning line per fallback reason, printed under FALLBACK_WARNING_HEADER */
export const FALLBACK_REASON_MESSAGES: Record<FallbackReason, string> = {
  'no-placeholder-support':
    'this terminal does not support kitty graphics with Unicode placeholders',
  'multiplexed-session':
    'tmux or GNU screen is intercepting the kitty graphics escape sequences',
};

/** The [y/N] question printed after the fallback warning lines */
export const FALLBACK_PROMPT =
  'Continue in half-block mode (reduced quality, no on-screen UI)? [y/N] ';

/** Answers that accept the half-block prompt, compared trimmed and lowercased */
export const FALLBACK_YES_ANSWERS: readonly string[] = ['y', 'yes'];
