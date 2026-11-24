// "env:user": a variable every new terminal sees.
//   Windows:      user environment (HKCU\Environment) via .NET, no setx length limit.
//   macOS/Linux:  one managed `export` line in the shell's startup file.
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { safeCommand } from '../winbin.js';
import { readText, atomicWrite } from '../fsutil.js';
import { detectEol } from '../dotenv.js';
import { KeepKeysError } from '../errors.js';

const MARK = '# keepkeys';

export function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function rcFileFor({ shell = process.env.SHELL ?? '', platform = process.platform, home = os.homedir() } = {}) {
  if (process.env.KEEPKEYS_RC_FILE) return { file: process.env.KEEPKEYS_RC_FILE, fish: /\.fish$/.test(process.env.KEEPKEYS_RC_FILE) };
  const sh = path.basename(shell);
  if (sh === 'zsh') return { file: path.join(home, '.zshrc'), fish: false };
  if (sh === 'bash') return { file: path.join(home, platform === 'darwin' ? '.bash_profile' : '.bashrc'), fish: false };
  if (sh === 'fish') return { file: path.join(home, '.config', 'fish', 'conf.d', 'keepkeys.fish'), fish: true };
  if (platform === 'darwin') return { file: path.join(home, '.zshrc'), fish: false };
  return { file: path.join(home, '.profile'), fish: false };
}

function rcLineRegex(name, fish) {
  return fish ? new RegExp(`^\\s*set\\s+(-\\w+\\s+)*${name}\\s`) : new RegExp(`^\\s*export\\s+${name}=`);
}

/** Replaces every assignment of NAME in the rc text, or appends one. Pure. */
export function upsertRc(text, name, value, { fish = false } = {}) {
  const eol = detectEol(text);
  const line = fish ? `set -gx ${name} ${shellQuote(value)}  ${MARK}` : `export ${name}=${shellQuote(value)}  ${MARK}`;
  const re = rcLineRegex(name, fish);
  const lines = text.length ? text.split(/\r?\n/) : [];
  let replaced = false;
  const out = [];
  for (const l of lines) {
    if (!re.test(l)) out.push(l);
    else if (!replaced) {
      out.push(line);
      replaced = true;
    }
  }
  if (!replaced) {
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push(line);
  }
  let result = out.join(eol);
  if (!result.endsWith(eol)) result += eol;
  return { text: result, replaced };
}

export function rcHas(text, name, { fish = false } = {}) {
  const re = rcLineRegex(name, fish);
  return text.split(/\r?\n/).some((l) => re.test(l));
}

// PowerShell gets its script as -EncodedCommand (UTF-16LE) and the value as
// base64 on stdin, so the secret never appears in a command line and no
// console code page can mangle it.
function powershell(script, input) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const r = spawnSync(safeCommand('powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    input,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.error) throw new KeepKeysError(`could not run PowerShell: ${r.error.message}`);
  return r;
}

export function windowsSetUserEnv(name, value) {
  const script =
    '$b = [Console]::In.ReadToEnd().Trim(); ' +
    '$v = if ($b) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) } else { $null }; ' +
    `[Environment]::SetEnvironmentVariable('${name}', $v, 'User')`;
  const r = powershell(script, value === null ? '' : Buffer.from(value, 'utf8').toString('base64'));
  if (r.status !== 0) throw new KeepKeysError(`could not set the user variable ${name}: ${r.stderr.trim()}`);
}

export function windowsHasUserEnv(name) {
  const r = spawnSync(safeCommand('reg'), ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

export function envUserDestination() {
  const win = process.platform === 'win32';
  const rc = win ? null : rcFileFor();
  const caveat = 'only terminals opened from now on will see it, and every program you run can read it';
  return {
    kind: 'env-user',
    label: win ? 'user environment (Windows)' : `env:user (${rc.file.replace(os.homedir(), '~')})`,

    has(name) {
      if (win) return windowsHasUserEnv(name);
      const text = readText(rc.file);
      return text !== null && rcHas(text, name, rc);
    },

    write(name, value) {
      if (win) {
        windowsSetUserEnv(name, value);
        return { notes: ['set for your Windows user'], warnings: [caveat] };
      }
      const before = readText(rc.file) ?? '';
      const { text, replaced } = upsertRc(before, name, value, rc);
      atomicWrite(rc.file, text);
      return { notes: [replaced ? 'replaced existing export' : 'added export'], warnings: [caveat] };
    },
  };
}
