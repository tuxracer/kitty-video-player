# kitty-media-player

Play video and audio in the terminal. An [Ink](https://github.com/vadimdemedes/ink) UI provides controls while [kitty-motion](https://github.com/tuxracer/kitty-motion) renders video through Kitty graphics placeholders.

## Requirements

- Node.js 24 or newer
- Kitty or Ghostty outside tmux or GNU screen for the full player
- An interactive terminal

Other terminals can use a reduced fallback player. ffmpeg and ffprobe are bundled.

## Run

```sh
npx kitty-media-player
npx kitty-media-player movie.mp4
npx kitty-media-player song.mp3
npx kitty-media-player https://example.com/movie.mp4
```

With no input, the player runs a silent procedural demo.

Install globally with `npm install -g kitty-media-player`, or run a checkout with:

```sh
pnpm install
pnpm dev
```

Video files and URLs support audio, pause, and seeking. Audio-only files show embedded artwork when available and a waveform otherwise. Playback continues silently when no audio output device is available.

## Controls

| Key              | Action               |
| ---------------- | -------------------- |
| space            | play or pause        |
| left/right arrow | seek 5 seconds       |
| m                | mute or unmute       |
| q or Ctrl-C      | quit                 |

## Options

| Flag                                        | Action                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `<file>` or `<url>`                         | play a local file or HTTP(S) URL                                          |
| `-h`, `--help`                              | show help                                                                 |
| `-v`, `--version`                           | show the version                                                          |
| `--fallback`                                | use the best available renderer without the Ink UI                        |
| `--muted`                                   | start muted                                                               |
| `--visual <auto\|artwork\|waveform\|none>` | choose the visual for audio-only input                                    |
| `--render-mode <mode>`                      | force `kitty`, `half-block`, `cell-background`, `emoji`, or `ascii`       |

The fallback player has keyboard controls but no on-screen controls. Video ignores `--visual`. Cell render modes use the fallback player.

## Embed In Ink

The package exports `Video` and `Audio` components for Ink apps. `Video` uses terminal-cell dimensions and accepts children as fallback content.

```tsx
import { render, Text } from 'ink';
import { Video } from 'kitty-media-player';

const App = () => (
  <Video src="cat.mp4" width={40} height={12} autoPlay loop controls>
    <Text>Kitty graphics are unavailable</Text>
  </Video>
);

render(<App />);
```

`Video` also accepts a `FrameSource` through `srcObject`. Its events and ref API follow the HTML media element where practical, with times measured in seconds.

`Audio` has no visual by default. Set `visual` for automatic artwork or waveform selection, or choose one explicitly.

```tsx
import { Audio } from 'kitty-media-player';

<Audio src="song.mp3" visual />
<Audio src="song.mp3" visual="artwork" width={48} height={13} />
<Audio src="song.mp3" visual="waveform" controls={false} />
```

The package also exports its frame sources, audio player interfaces, layout helpers, and media utilities. See [docs/TRD.md](docs/TRD.md) for architecture, lower-level APIs, and custom resource ownership.

## License

MIT
