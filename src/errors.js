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
  // Nothing was saved: keepkeys printed the command the person has to run in
  // their own terminal (an agent on a server or over SSH).
  HANDOFF: 4,
};
