# kitty-player

A terminal video player. The UI (title, progress bar, controls) is an [Ink](https://github.com/vadimdemedes/ink) app, and the video pixels are rendered by [kitty-motion](https://github.com/tuxracer/kitty-motion) through Kitty graphics Unicode placeholders. The placeholder cells are ordinary text that Ink lays out, so the picture and the React-driven UI share the terminal without stepping on each other.

## Requirements

- Node.js >= 24
- An interactive Kitty or Ghostty terminal (Kitty graphics protocol with Unicode placeholder support). On any other terminal, or when stdout is not a TTY, kitty-player prints a notice and exits without drawing
- ffmpeg is bundled (via ffmpeg-static and ffprobe-static), no system install needed

## Install and run

```sh
npx kitty-player
npx kitty-player movie.mp4
```

Or install globally:

```sh
npm install -g kitty-player
kitty-player
```

For development from a checkout:

```sh
pnpm install
pnpm dev
```

## Current status

kitty-player plays video files (`kitty-player movie.mp4`) through a bundled ffmpeg,
decoded as a stream at a capped resolution with seek and pause. Audio is not
played yet. Running with no arguments plays the built-in procedural demo clip,
a hue-cycling ball moving on a Lissajous path over a 20 second loop.

## Controls

| Key              | Action           |
| ---------------- | ---------------- |
| space            | play or pause    |
| left/right arrow | seek 5 seconds   |
| q or Ctrl-C      | quit             |

## CLI flags

| Flag              | Action                                                                |
| ----------------- | --------------------------------------------------------------------- |
| `<file>`          | play this video file (optional, plays the built-in demo when omitted) |
| `-h`, `--help`    | print help and exit                                                   |
| `-v`, `--version` | print the version and exit                                            |

## How it works

- The kitty-motion `Screen` is created before Ink renders. Its terminal probes read responses from stdin, and that handshake must finish before Ink's `useInput` takes stdin over
- `Screen.getPlaceholderRows()` returns one string per grid row, and the player renders each as an ordinary Ink `<Text>`. The terminal fills those cells with the video
- Each frame goes straight to `screen.pushFrame()`, so pixels update at the source frame rate without any Ink redraw
- Ink itself redraws only when the displayed whole second changes (the time readout and progress bar), roughly once per second
- On terminal resize the panel region is recomputed, the placeholder rows are re-read (the grid size can change), and the current frame is repainted

## Library use

The package also exports the pieces for embedding a player panel in your own Ink app: `Player`, the `FrameSource`/`FrameSourceInfo` contract, `createProceduralSource`, `createFfmpegSource`, `computePanelRegion`, and `formatTime`.

```tsx
import { render } from 'ink';
import { createScreen } from 'kitty-motion';
import { computePanelRegion, createProceduralSource, Player } from 'kitty-player';

const source = createProceduralSource();
const info = await source.open();

const region = computePanelRegion({
  termCols: process.stdout.columns,
  termRows: process.stdout.rows,
  sourceWidth: info.width,
  sourceHeight: info.height,
});

// Create the Screen before rendering Ink. createScreen probes the terminal
// through stdin, and Ink's useInput takes stdin after render().
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

render(<Player screen={screen} source={source} info={info} />, { exitOnCtrlC: false });
```

`FrameSource` is the seam a real decoder implements. `open()` returns the stream info (pixel dimensions, color space, duration, frame rate). `getFrameAt(timeMs)` resolves the frame at or nearest after that timestamp, or `null` to keep the last frame on screen, and the returned buffer is only valid until the next call because sources may reuse it. `seek(timeMs)` repositions the source so nearby `getFrameAt` calls are cheap (a no-op for random-access sources). `close()` releases decoder resources and is idempotent. `createFfmpegSource` implements those four methods over a bundled ffmpeg pipe, and is the FrameSource behind file playback.

## License

MIT
