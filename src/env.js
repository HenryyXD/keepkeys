// Where keepkeys is running, as far as handing over a key is concerned:
// can a person see a browser or a clipboard on this machine, and how would
// they run keepkeys themselves in their own terminal?
import fs from 'node:fs';
import path from 'node:path';
import { VERSION } from './version.js';

/** True inside an SSH session: the clipboard and browser here are not the person's. */
export function isRemoteSession(env = process.env) {
  return Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY);
}

/** True when a graphical session could show a browser or own a clipboard. */
export function hasDisplay(env = process.env, platform = process.platform) {
  if (platform === 'win32' || platform === 'darwin') return true;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

/**
 * True when nobody sitting at this machine's screen can be asked to copy a
 * key or open a page: a server without a display, or an SSH session.
 * KEEPKEYS_HEADLESS=1 / 0 overrides the guess.
 */
export function isHeadless(env = process.env, platform = process.platform) {
  if (env.KEEPKEYS_HEADLESS === '1') return true;
  if (env.KEEPKEYS_HEADLESS === '0') return false;
  return isRemoteSession(env) || !hasDisplay(env, platform);
}

/** Finds a command on PATH, like `command -v`. Returns its path or null. */
export function onPath(cmd, env = process.env, platform = process.platform) {
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const f = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(f).isFile()) return f;
      } catch {}
    }
  }
  return null;
}

const posixQuote = (s) => (/^[A-Za-z0-9_\-.,/:@%+=]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

// Windows: the person may paste into cmd.exe (the OpenSSH default) or
// PowerShell. Plain words go bare; words with spaces, commas or @ (PowerShell
// would split or splat them) get double quotes, which both shells read the
// same way. Anything else ($ ` % " ' ; & | < > ^ ( ) …) means something to one
// of the shells even inside quotes, so it is not quoted at all: null.
function winQuote(s) {
  // A "~" is only special at the start of a word, so the 8.3 short names that
  // Windows puts in temp paths (PCGAME~1) are fine anywhere but first.
  if (/^[A-Za-z0-9_\-.:\\/][A-Za-z0-9_\-.:\\/~]*$/.test(s)) return s;
  if (/^[A-Za-z0-9_\-.:\\/][A-Za-z0-9_\-.:\\/ ,@+=~]*$/.test(s)) return `"${s}"`;
  return null;
}

/** Quotes a word for the person's shell, or returns null if it can't be done safely. */
export function shellWord(s, { platform = process.platform } = {}) {
  return platform === 'win32' ? winQuote(s) : posixQuote(s);
}

const realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * How the person can start this same keepkeys in their own terminal.
 * Through npx it is `npx -y keepkeys@<this version>`; a standalone binary or a
 * global install is `keepkeys`; a checkout is `node /path/to/bin/keepkeys.js`.
 */
export function selfCommand({ env = process.env, execPath = process.execPath, script = process.argv[1], platform = process.platform, version = VERSION } = {}) {
  if (env.KEEPKEYS_SELF) return env.KEEPKEYS_SELF;
  // npm exec / npx runs packages from its cache (…/_npx/…); a plain
  // npm_command=exec could be inherited from some unrelated parent.
  if (env.npm_command === 'exec' && /[\\/]_npx[\\/]/.test(script ?? '')) return `npx -y keepkeys@${version}`;
  const exe = path.basename(execPath).toLowerCase();
  if (!/^node(\.exe)?$/.test(exe)) {
    // A standalone binary (bun --compile, Node SEA).
    const found = onPath(path.basename(execPath), env, platform);
    return found && realpath(found) === realpath(execPath) ? path.basename(execPath) : shellWord(execPath, { platform }) ?? path.basename(execPath);
  }
  const installed = onPath('keepkeys', env, platform);
  if (installed && script && realpath(installed) === realpath(script)) return 'keepkeys';
  const nodeOnPath = onPath('node', env, platform);
  const node = nodeOnPath && realpath(nodeOnPath) === realpath(execPath) ? 'node' : shellWord(execPath, { platform }) ?? 'node';
  return `${node} ${shellWord(script ?? 'keepkeys', { platform }) ?? 'keepkeys'}`;
}

/**
 * The one command the person should run in their own terminal (an SSH
 * session to this machine is fine). It never contains a secret: only the
 * project directory, the key names and destination files. The directory is
 * always absolute: the person may be a different user with a different ~.
 * Returns { command, cdFirst }: cdFirst is set when the directory can't be
 * written safely into a command, and the person has to cd there first.
 */
export function handoff(root, args, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const rootWord = shellWord(root, { platform });
  const rest = args.map((a) => shellWord(a, { platform }));
  if (rest.includes(null)) throw new Error('internal: unquotable handoff argument');
  const words = [selfCommand(opts), ...(rootWord === null ? [] : ['--root', rootWord]), ...rest];
  return { command: words.join(' '), cdFirst: rootWord === null ? root : null };
}

/** The handoff command as one line of text (with a "cd" hint when needed). */
export function handoffCommand(root, args, opts = {}) {
  const h = handoff(root, args, opts);
  return h.cdFirst ? `${h.command}   (run it inside ${h.cdFirst})` : h.command;
}
