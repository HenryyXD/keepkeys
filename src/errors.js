// Errors carry an exit code so the CLI can report them without a stack trace.
export class KeepKeysError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'KeepKeysError';
    this.exitCode = exitCode;
  }
}

export const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  CANCELLED: 3,
};
