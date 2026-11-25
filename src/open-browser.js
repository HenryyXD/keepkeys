import { spawn } from 'node:child_process';
import { isHeadless, onPath } from './env.js';
import { safeCommand } from './winbin.js';

/**
 * True when a browser page can be opened in front of the person: not with
 * KEEPKEYS_NO_BROWSER, no display, an SSH session (the browser would open on
 * this machine, not the person's), or no opener installed.
 */
export function browserAvailable() {
  if (process.env.KEEPKEYS_NO_BROWSER) return false;
  if (isHeadless()) return false;
  if (process.platform === 'linux' && !onPath('xdg-open')) return false;
  return true;
}

/**
 * The confirm page's address must never reach stdout or stderr: an agent reads
 * both and could approve a value itself. Only the test suite may opt in.
 */
export const mayShowConfirmUrl = () => process.env.KEEPKEYS_UNSAFE_SHOW_CONFIRM_URL === '1';

/** Opens a URL in the default browser. Returns false if that was skipped or failed. */
export function openBrowser(url) {
  if (!browserAvailable()) return false;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const bin = safeCommand(cmd);
    if (!bin) return false;
    const child = spawn(bin, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
