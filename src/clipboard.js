import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { KeepKeysError } from './errors.js';

// Tests point this at a file that stands in for the system clipboard.
const fakeFile = () => process.env.KEEPKEYS_FAKE_CLIPBOARD;

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 20 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand'];
const encodePs = (script) => Buffer.from(script, 'utf16le').toString('base64');
const fromB64 = (s) => Buffer.from(s.trim(), 'base64').toString('utf8');

// PowerShell prints the clipboard as base64 so no console code page can mangle it.
const WIN_TEXT = '$t = $null; try { $t = Get-Clipboard -Raw } catch {}; $b = if ($t) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)) } else { "" }';
const WIN_SEQ = `Add-Type -Namespace KeepKeys -Name Clip -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();'`;

// Windows numbers every clipboard change, so copying the same text twice is
// still seen as a new copy. Prints "<sequence> <base64 text>".
const WIN_READ_STAMPED = `${WIN_SEQ}
$n = [KeepKeys.Clip]::GetClipboardSequenceNumber(); ${WIN_TEXT}; [Console]::Out.WriteLine("$n $b")`;

// One long-lived PowerShell that prints a stamped line on every clipboard
// change (the first line is the current content). Starting PowerShell for
// every poll would cost ~200 ms each time.
const WIN_WATCH = `${WIN_SEQ}
$last = $null
while ($true) {
  $n = [KeepKeys.Clip]::GetClipboardSequenceNumber()
  if ($n -ne $last) {
    ${WIN_TEXT}
    [Console]::Out.WriteLine("$n $b"); [Console]::Out.Flush()
    $last = $n
  }
  Start-Sleep -Milliseconds 250
}`;

// macOS counts changes too (NSPasteboard.changeCount). Prints the count on
// the first line and the text after it.
const MAC_READ_STAMPED = `ObjC.import('AppKit');
const pb = $.NSPasteboard.generalPasteboard;
const s = pb.stringForType($.NSPasteboardTypeString);
pb.changeCount + '\\n' + (s.isNil() ? '' : s.js)`;

function winRead() {
  const out = run('powershell.exe', [...PS_ARGS, encodePs(`${WIN_TEXT}; [Console]::Out.Write($b)`)]);
  return out === null ? null : fromB64(out);
}

const READERS = {
  win32: [winRead],
  darwin: [() => run('pbpaste', [])],
  linux: [
    () => run('wl-paste', ['--no-newline']),
    () => run('xclip', ['-selection', 'clipboard', '-o']),
    () => run('xsel', ['--clipboard', '--output']),
  ],
};

const CLEARERS = {
  win32: [() => run('clip', [], '')],
  darwin: [() => run('pbcopy', [], '')],
  linux: [
    () => run('wl-copy', ['--clear']),
    () => run('xclip', ['-selection', 'clipboard', '-i'], ''),
    () => run('xsel', ['--clipboard', '--clear']),
  ],
};

export function readClipboard() {
  const fake = fakeFile();
  if (fake) {
    try {
      return fs.readFileSync(fake, 'utf8');
    } catch {
      return '';
    }
  }
  for (const read of READERS[process.platform] ?? READERS.linux) {
    const v = read();
    if (v !== null) return v;
  }
  throw new KeepKeysError(
    process.platform === 'linux'
      ? 'could not read the clipboard: install wl-clipboard, xclip or xsel'
      : 'could not read the clipboard',
  );
}

/**
 * Reads the clipboard with a stamp that changes on every copy, even when the
 * same text is copied again. Linux has no such counter, so there the text
 * itself is the stamp (copying identical text twice is not noticed).
 */
export function readStamped() {
  const fake = fakeFile();
  if (fake) {
    try {
      const st = fs.statSync(fake);
      return { stamp: `${st.mtimeMs}:${st.size}`, text: fs.readFileSync(fake, 'utf8') };
    } catch {
      return { stamp: 'none', text: '' };
    }
  }
  if (process.platform === 'win32') {
    const out = run('powershell.exe', [...PS_ARGS, encodePs(WIN_READ_STAMPED)]);
    if (out !== null) {
      const [n, b = ''] = out.trim().split(' ');
      return { stamp: n, text: fromB64(b) };
    }
  } else if (process.platform === 'darwin') {
    const out = run('osascript', ['-l', 'JavaScript', '-e', MAC_READ_STAMPED]);
    if (out !== null) {
      const nl = out.indexOf('\n');
      return { stamp: out.slice(0, nl), text: out.slice(nl + 1).replace(/\n$/, '') };
    }
  }
  const text = readClipboard();
  return { stamp: text, text };
}

export function clipboardAvailable() {
  try {
    readClipboard();
    return true;
  } catch {
    return false;
  }
}

/** Clears the clipboard, but only if it still holds `expected`. */
export function clearClipboardIf(expected) {
  let current;
  try {
    current = readClipboard();
  } catch {
    return false;
  }
  if (current !== expected && current.trim() !== expected.trim()) return false;
  const fake = fakeFile();
  if (fake) {
    fs.writeFileSync(fake, '');
    return true;
  }
  for (const clear of CLEARERS[process.platform] ?? CLEARERS.linux) {
    if (clear() !== null) return true;
  }
  return false;
}

function pollClipboard(onChange, intervalMs, { skipInitial = false, lastStamp = null } = {}) {
  let previous = lastStamp;
  let first = !skipInitial;
  const tick = () => {
    let now;
    try {
      now = readStamped();
    } catch {
      return;
    }
    if (first) {
      first = false;
      previous = now.stamp;
      onChange(now.text, true);
    } else if (now.stamp !== previous) {
      previous = now.stamp;
      onChange(now.text, false);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Calls onChange(text, isInitial) with the current clipboard and then on every
 * copy, including a copy of the same text again (Windows, macOS). Returns
 * stop(). `log` receives diagnostics (never clipboard text).
 */
export function watchClipboard(onChange, { intervalMs = 400, log = () => {}, startupMs = 4000 } = {}) {
  if (process.platform !== 'win32' || fakeFile()) return pollClipboard(onChange, intervalMs);

  // Windows: one long-lived PowerShell reports changes. If it does not report
  // the current clipboard quickly, or dies, fall back to polling, which starts
  // a short PowerShell every second: slower, but works wherever reading works.
  const child = spawn('powershell.exe', [...PS_ARGS, encodePs(WIN_WATCH)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  let started = false;
  let lastStamp = null;
  let stopped = false;
  let stopFallback = null;

  const fallBack = (why) => {
    if (stopped || stopFallback) return;
    log(`clipboard watcher ${why}; checking the clipboard every second instead`);
    child.kill();
    stopFallback = pollClipboard(onChange, Math.max(intervalMs, 1000), { skipInitial: started, lastStamp });
  };

  child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d).length > 4000 && (stderr = stderr.slice(-4000)));
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    if (stopped || stopFallback) return;
    const [stamp, b = ''] = line.trim().split(' ');
    const isInitial = !started;
    started = true;
    lastStamp = stamp;
    onChange(fromB64(b), isInitial);
  });
  child.on('error', (e) => fallBack(`could not start (${e.message})`));
  child.on('exit', (code) => {
    const firstLine = stderr.trim().split(/\r?\n/)[0];
    if (!stopped) fallBack(`stopped (exit ${code}${firstLine ? `: ${firstLine}` : ''})`);
  });
  const startupTimer = setTimeout(() => {
    if (!started) fallBack(`did not respond within ${startupMs / 1000}s`);
  }, startupMs);

  return () => {
    stopped = true;
    clearTimeout(startupTimer);
    child.kill();
    stopFallback?.();
  };
}
