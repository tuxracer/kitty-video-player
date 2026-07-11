/** Milliseconds per second, for tick-interval math */
export const MS_PER_SECOND = 1_000;

/** Space toggles play/pause */
export const KEY_SPACE = ' ';

/** q quits */
export const KEY_QUIT = 'q';

/** Ctrl-C arrives as ETX in raw mode (no SIGINT) and quits like q */
export const KEY_CTRL_C = '\u0003';

/** Right arrow escape sequence, seeks forward */
export const KEY_ARROW_RIGHT = '\u001b[C';

/** Left arrow escape sequence, seeks backward */
export const KEY_ARROW_LEFT = '\u001b[D';
