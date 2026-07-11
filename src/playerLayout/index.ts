import { fitToTerminal } from 'kitty-motion';
import type { ScreenRegion } from 'kitty-motion';

import {
  CELL_ASPECT_RATIO,
  CHROME_ROWS,
  MAX_PANEL_COLS,
  MIN_AVAILABLE_CELLS,
  PANEL_HORIZONTAL_MARGIN,
} from './consts.ts';
import type { PanelRegionOptions } from './types.ts';

export * from './consts.ts';
export * from './types.ts';

/**
 * Compute the video panel's cell-grid size for the current terminal, as a
 * kitty-motion ScreenRegion. The panel aspect-fits the source frame into the
 * space left after subtracting UI chrome rows and horizontal margin, capped
 * at MAX_PANEL_COLS. Offsets stay at 1,1 because the host Ink app owns actual
 * placement (placeholder cells are ordinary text laid out by Ink).
 */
export const computePanelRegion = ({
  termCols,
  termRows,
  sourceWidth,
  sourceHeight,
}: PanelRegionOptions): ScreenRegion => {
  const availableCols = Math.max(
    Math.min(termCols - PANEL_HORIZONTAL_MARGIN, MAX_PANEL_COLS),
    MIN_AVAILABLE_CELLS,
  );
  const availableRows = Math.max(termRows - CHROME_ROWS, MIN_AVAILABLE_CELLS);
  const aspectRatio = (sourceWidth / sourceHeight) * CELL_ASPECT_RATIO;
  const { width, height } = fitToTerminal({ availableCols, availableRows, aspectRatio });
  return { offsetCol: 1, offsetRow: 1, cols: width, rows: height };
};
