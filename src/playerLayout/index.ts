import { fitToTerminal } from 'kitty-motion';
import type { ScreenRegion } from 'kitty-motion';

import {
  CELL_ASPECT_RATIO,
  CHROME_ROWS,
  MAX_PANEL_COLS,
  MIN_AVAILABLE_CELLS,
  PANEL_HORIZONTAL_MARGIN,
} from './consts.ts';
import type { EmbeddedRegionOptions, PanelRegionOptions } from './types.ts';

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

/**
 * Compute the placeholder grid for an embedded video box of a fixed cell
 * size, aspect-fitting the source frame inside it (object-fit: contain).
 * Offsets stay at 1,1 because the host Ink app owns actual placement.
 *
 * Unlike computePanelRegion, this function does not delegate to
 * fitToTerminal, because fitToTerminal enforces a minimum display size
 * floor (roughly 32 cols x 15 rows) that distorts aspect ratio inside boxes
 * smaller than the floor. An embedded box must respect its exact requested
 * dimensions, so this function hand-rolls the fit logic to preserve aspect
 * ratio while staying strictly within the box bounds.
 */
export const computeEmbeddedRegion = ({
  cols,
  rows,
  sourceWidth,
  sourceHeight,
}: EmbeddedRegionOptions): ScreenRegion => {
  const availableCols = Math.max(cols, MIN_AVAILABLE_CELLS);
  const availableRows = Math.max(rows, MIN_AVAILABLE_CELLS);
  const aspectRatio = (sourceWidth / sourceHeight) * CELL_ASPECT_RATIO;

  // Try height-first fit: use all available rows, then derive cols by aspect
  const potentialCols = Math.floor(availableRows * aspectRatio);
  if (potentialCols <= availableCols) {
    // Height-first fit works: use all rows and as many cols as aspect allows
    return {
      offsetCol: 1,
      offsetRow: 1,
      cols: Math.max(potentialCols, MIN_AVAILABLE_CELLS),
      rows: availableRows,
    };
  }

  // Width-constrained: use all available cols and derive rows by aspect
  return {
    offsetCol: 1,
    offsetRow: 1,
    cols: availableCols,
    rows: Math.max(Math.floor(availableCols / aspectRatio), MIN_AVAILABLE_CELLS),
  };
};
