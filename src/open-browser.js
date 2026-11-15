import { spawn } from 'node:child_process';

/** Opens a URL in the default browser. Returns false if that was skipped or failed. */
export function openBrowser(url) {
  if (process.env.KEEPKEYS_NO_BROWSER) return false;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
