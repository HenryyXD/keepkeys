import { spawn } from 'node:child_process';
import { isHeadless, onPath } from './env.js';

/**
 * Opens a URL in the default browser. Returns false if that was skipped or
 * could not work: no display, an SSH session (the browser would open on this
 * machine, not the person's), or no opener installed.
 */
export function openBrowser(url) {
  if (process.env.KEEPKEYS_NO_BROWSER) return false;
  if (isHeadless()) return false;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  if (process.platform === 'linux' && !onPath(cmd)) return false;
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
