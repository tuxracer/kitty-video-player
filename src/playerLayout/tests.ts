import { describe, expect, it } from 'vitest';

import { computePanelRegion, MAX_PANEL_COLS } from './index.ts';

// 240x140 source: aspect ratio (240/140) * 2 = 24/7 cols per row
const SOURCE = { sourceWidth: 240, sourceHeight: 140 };

describe('computePanelRegion', () => {
  it('caps cols at MAX_PANEL_COLS on a wide terminal and derives rows by aspect', () => {
    // availableCols = min(296, 100) = 100, rows = floor(100 / (24/7)) = 29
    const region = computePanelRegion({ termCols: 300, termRows: 100, ...SOURCE });
    expect(region).toEqual({ offsetCol: 1, offsetRow: 1, cols: MAX_PANEL_COLS, rows: 29 });
  });

  it('subtracts the horizontal margin when the terminal is below the cap', () => {
    // availableCols = 80 - 4 = 76, rows = floor(76 / (24/7)) = 22
    const region = computePanelRegion({ termCols: 80, termRows: 100, ...SOURCE });
    expect(region).toEqual({ offsetCol: 1, offsetRow: 1, cols: 76, rows: 22 });
  });

  it('is limited by rows on a short terminal', () => {
    // availableRows = 15 - 5 = 10, cols = floor(10 * (24/7)) = 34
    const region = computePanelRegion({ termCols: 200, termRows: 15, ...SOURCE });
    expect(region).toEqual({ offsetCol: 1, offsetRow: 1, cols: 34, rows: 10 });
  });

  it('returns at least 1x1 on a tiny terminal without throwing', () => {
    const region = computePanelRegion({ termCols: 10, termRows: 4, ...SOURCE });
    expect(region.cols).toBeGreaterThanOrEqual(1);
    expect(region.rows).toBeGreaterThanOrEqual(1);
    expect(region.offsetCol).toBe(1);
    expect(region.offsetRow).toBe(1);
  });

  it('always places the region at offset 1,1', () => {
    const terminals = [
      { termCols: 300, termRows: 100 },
      { termCols: 80, termRows: 100 },
      { termCols: 200, termRows: 15 },
      { termCols: 10, termRows: 4 },
    ];
    for (const terminal of terminals) {
      const region = computePanelRegion({ ...terminal, ...SOURCE });
      expect(region.offsetCol).toBe(1);
      expect(region.offsetRow).toBe(1);
    }
  });
});
