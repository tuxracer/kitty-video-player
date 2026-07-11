#!/usr/bin/env node
/**
 * Executable CLI entry (built as dist/cli.js, the package bin). Parses argv,
 * guards on terminal capability, then hands a procedural FrameSource and a
 * kitty-motion Screen to the Ink Player. Importing this module runs the CLI,
 * so tests import parseCliArgs from ./parseCliArgs.ts directly.
 */
import { render } from 'ink';
import { createScreen, detectKittyUnicodePlaceholderSupport } from 'kitty-motion';

import { Player } from '../Player/index.tsx';
import { computePanelRegion } from '../playerLayout/index.ts';
import { createProceduralSource } from '../proceduralSource/index.ts';
import {
  EXIT_OK,
  EXIT_USAGE,
  FILE_DECODE_UNSUPPORTED_MESSAGE,
  HELP_TEXT,
  UNSUPPORTED_TERMINAL_MESSAGE,
  VERSION,
} from './consts.ts';
import { parseCliArgs } from './parseCliArgs.ts';

export { parseCliArgs } from './parseCliArgs.ts';
export * from './consts.ts';
export * from './types.ts';

const args = parseCliArgs(process.argv.slice(2));

if (args.action === 'help') {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(EXIT_OK);
}

if (args.action === 'version') {
  process.stdout.write(`${VERSION}\n`);
  process.exit(EXIT_OK);
}

if (args.action === 'usage-error') {
  process.stderr.write(`kitty-player: ${args.message}\n\n${HELP_TEXT}\n`);
  process.exit(EXIT_USAGE);
}

if (args.action === 'unsupported-file') {
  process.stderr.write(`kitty-player: ${args.file}: ${FILE_DECODE_UNSUPPORTED_MESSAGE}\n`);
  process.exit(EXIT_USAGE);
}

// Guard before creating any Screen or rendering Ink, so the CLI exits cleanly
// (code 0) in a non-interactive or unsupported terminal (CI-friendly).
if (!process.stdout.isTTY || !detectKittyUnicodePlaceholderSupport()) {
  process.stderr.write(`${UNSUPPORTED_TERMINAL_MESSAGE}\n`);
  process.exit(EXIT_OK);
}

const source = createProceduralSource();
const info = await source.open();

const region = computePanelRegion({
  termCols: process.stdout.columns,
  termRows: process.stdout.rows,
  sourceWidth: info.width,
  sourceHeight: info.height,
});

// Create the Screen before rendering Ink: createScreen runs terminal probes
// that read stdin, and that must finish before Ink's useInput takes over stdin.
const screen = await createScreen({
  output: process.stdout,
  sourceWidth: info.width,
  sourceHeight: info.height,
  colorSpace: info.colorSpace,
  placement: 'unicode',
  embedded: true,
  region,
  autoResize: false,
  autoDispose: false,
});

// exitOnCtrlC: false so the Player's own input handler can dispose the Screen
// and close the source before Ink tears the render down.
render(<Player screen={screen} source={source} info={info} />, { exitOnCtrlC: false });
