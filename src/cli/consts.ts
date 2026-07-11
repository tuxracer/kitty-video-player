/**
 * Package version printed by --version. Kept as a literal because importing
 * package.json from outside src/ breaks the tsconfig include. Keep in sync
 * with the "version" field in package.json.
 */
export const VERSION = '0.1.0';

/** Exit code for success paths (help, version, graceful unsupported-terminal exit) */
export const EXIT_OK = 0;

/** Exit code for usage errors (unknown flags, unsupported file arguments) */
export const EXIT_USAGE = 1;

/** Usage and controls text printed by --help (and to stderr after a usage error) */
export const HELP_TEXT = `kitty-player, a terminal video player (Ink UI with a kitty-motion video panel)

Usage:
  kitty-player            play the built-in procedural demo
  kitty-player <file>     video file decoding is not yet supported

Options:
  -h, --help              print this help and exit
  -v, --version           print the version and exit

Controls:
  space                   play or pause
  left/right arrow        seek 5 seconds
  q or Ctrl-C             quit

Requires an interactive Kitty or Ghostty terminal (Kitty graphics protocol
with Unicode placeholder support). On other terminals kitty-player prints a
notice and exits without drawing.`;

/** Printed to stderr when stdout is not an interactive placeholder-capable terminal */
export const UNSUPPORTED_TERMINAL_MESSAGE =
  'kitty-player needs an interactive Kitty or Ghostty terminal (Kitty graphics ' +
  'protocol with Unicode placeholder support). Nothing was drawn.';

/** Printed to stderr, prefixed with the file name, when a file argument is passed */
export const FILE_DECODE_UNSUPPORTED_MESSAGE =
  'video file decoding is not yet supported. Run kitty-player with no ' +
  'arguments to play the built-in procedural demo.';
