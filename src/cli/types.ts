/** Play a video file, or the built-in procedural demo when file is absent */
export interface PlayAction {
  action: 'play';
  /** Path of the video file to play (the positional argument) */
  file?: string;
  /** Skip terminal detection and play with the half-block renderer (--half-block) */
  halfBlock: boolean;
}

/** Print HELP_TEXT to stdout and exit 0 (--help / -h) */
export interface HelpAction {
  action: 'help';
}

/** Print VERSION to stdout and exit 0 (--version / -v) */
export interface VersionAction {
  action: 'version';
}

/** An unknown or malformed flag. The parseArgs message is printed with the usage text, exit 1. */
export interface UsageErrorAction {
  action: 'usage-error';
  /** The parseArgs error message describing the bad flag */
  message: string;
}

/** Discriminated union of everything a CLI invocation can ask for */
export type ParsedCliArgs = PlayAction | HelpAction | VersionAction | UsageErrorAction;

/** Why the kitty-graphics player cannot run in this terminal */
export type FallbackReason = 'no-placeholder-support' | 'multiplexed-session';
