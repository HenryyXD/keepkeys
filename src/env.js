// Where keepkeys is running, as far as handing over a key is concerned:
// can a person see a browser or a clipboard on this machine, and how would
// they run keepkeys themselves in their own terminal?
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const winQuote = (s) => (/^[A-Za-z0-9_\-.,/:\\@%+=]+$/.test(s) ? s : `"${s}"`);

/** Quotes a word for the person's shell; a path under $HOME becomes ~/… on POSIX. */
export function shellWord(s, { platform = process.platform, home = os.homedir(), path: isPath = false } = {}) {
  if (platform === 'win32') return winQuote(s);
  if (isPath && home && (s === home || s.startsWith(`${home}/`))) {
    const rest = s.slice(home.length + 1);
    return rest ? `~/${posixQuote(rest)}` : '~';
  }
  return posixQuote(s);
}

/**
 * How the person can start this same keepkeys in their own terminal.
 * Through npx it is `npx -y keepkeys`; a standalone binary or a global
 * install is `keepkeys`; a checkout is `node /path/to/bin/keepkeys.js`.
 */
export function selfCommand({ env = process.env, execPath = process.execPath, script = process.argv[1], platform = process.platform } = {}) {
  if (env.KEEPKEYS_SELF) return env.KEEPKEYS_SELF;
  if (env.npm_command === 'exec') return 'npx -y keepkeys';
  const exe = path.basename(execPath).toLowerCase();
  if (!/^node(\.exe)?$/.test(exe)) {
    // A standalone binary (bun --compile, Node SEA).
    return onPath(path.basename(execPath), env, platform) === execPath ? path.basename(execPath) : shellWord(execPath, { platform });
  }
  const installed = onPath('keepkeys', env, platform);
  if (installed && script) {
    try {
      if (fs.realpathSync(installed) === fs.realpathSync(script)) return 'keepkeys';
    } catch {}
  }
  const node = onPath('node', env, platform) === execPath ? 'node' : shellWord(execPath, { platform });
  return `${node} ${shellWord(script ?? 'keepkeys', { platform })}`;
}

/**
 * The one command the person should run in their own terminal (an SSH
 * session to this machine is fine). It never contains a secret: only the
 * project directory, the key names and destination files.
 */
export function handoffCommand(root, args, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const words = [selfCommand(opts), '--root', shellWord(root, { platform, home: opts.home, path: true }), ...args.map((a) => shellWord(a, { platform }))];
  return words.join(' ');
}
