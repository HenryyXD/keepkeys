// Desktop notifications, so the person sees that keepkeys is waiting, got the
// key, or ignored a copy, even when the agent's chat is out of view.
// Messages never contain a secret: at most its last 4 characters.
import { spawn } from 'node:child_process';

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const asQuote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function windowsToast(title, body) {
  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $x.GetElementsByTagName('text')
$t.Item(0).AppendChild($x.CreateTextNode(${psQuote(title)})) > $null
$t.Item(1).AppendChild($x.CreateTextNode(${psQuote(body)})) > $null
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
  return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]];
}

export function notifyCommand(title, body, platform = process.platform) {
  if (platform === 'win32') return windowsToast(title, body);
  if (platform === 'darwin') return ['osascript', ['-e', `display notification ${asQuote(body)} with title ${asQuote(title)}`]];
  return ['notify-send', ['--app-name=keepkeys', title, body]];
}

/** Shows a notification without waiting for it. Returns false if skipped. */
export function notify(title, body) {
  if (process.env.KEEPKEYS_NO_NOTIFY) return false;
  const [cmd, args] = notifyCommand(title, body);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
