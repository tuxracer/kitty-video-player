/** Play the built-in procedural demo (no arguments) */
export interface PlayAction {
  action: 'play';
}

/** Print HELP_TEXT to stdout and exit 0 (--help / -h) */
export interface HelpAction {
  action: 'help';
}

/** Print VERSION to stdout and exit 0 (--version / -v) */
export interface VersionAction {
  action: 'version';
}

/** A positional file argument was passed. File decoding is not supported yet, so this exits 1. */
export interface UnsupportedFileAction {
  action: 'unsupported-file';
  /** The file path the user passed (the first positional argument) */
  file: string;
}

/** An unknown or malformed flag. The parseArgs message is printed with the usage text, exit 1. */
export interface UsageErrorAction {
  action: 'usage-error';
  /** The parseArgs error message describing the bad flag */
  message: string;
}

/** Discriminated union of everything a CLI invocation can ask for */
export type ParsedCliArgs =
  | PlayAction
  | HelpAction
  | VersionAction
  | UnsupportedFileAction
  | UsageErrorAction;
