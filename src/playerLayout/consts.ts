/**
 * Widest panel we ever render, in terminal columns. Beyond this the encode
 * cost grows without a matching gain in perceived quality.
 */
export const MAX_PANEL_COLS = 100;

/** Columns reserved around the panel so it never touches the terminal edges */
export const PANEL_HORIZONTAL_MARGIN = 4;

/**
 * Rows of UI chrome around the panel: the title row, the controls row, the
 * help row, and the blank spacer rows the Player draws between them. Counted
 * from the Player's actual layout, currently five rows total.
 */
export const CHROME_ROWS = 5;

/**
 * A terminal cell is roughly twice as tall as it is wide, so a source pixel
 * aspect ratio doubles when expressed as cell columns per row.
 */
export const CELL_ASPECT_RATIO = 2;

/**
 * Floor for the available cols/rows passed to fitToTerminal. fitToTerminal
 * clamps its own output, but this keeps tiny terminals from producing zero
 * or negative available space on the way in.
 */
export const MIN_AVAILABLE_CELLS = 1;
