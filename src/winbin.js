// On Windows, Node resolves a bare command name ("git", "powershell.exe")
// starting in the current directory. keepkeys runs inside the person's
// project, which may be a freshly cloned repository, so a planted git.exe or
// powershell.exe there would run instead of the real one. These helpers turn
// bare names into absolute paths that never come from the working directory.
import fs from 'node:fs';
import path from 'node:path';

const isWin = () => process.platform === 'win32';

function systemRoot() {
  return process.env.SystemRoot || process.env.windir || 'C:\\Windows';
}

const SYSTEM32 = {
  'powershell.exe': (r) => path.join(r, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  powershell: (r) => path.join(r, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  reg: (r) => path.join(r, 'System32', 'reg.exe'),
  'reg.exe': (r) => path.join(r, 'System32', 'reg.exe'),
  where: (r) => path.join(r, 'System32', 'where.exe'),
  'cmd.exe': (r) => path.join(r, 'System32', 'cmd.exe'),
  rundll32: (r) => path.join(r, 'System32', 'rundll32.exe'),
};

const real = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};
const sameDir = (a, b) => real(a).toLowerCase() === real(b).toLowerCase();

/**
 * Finds `name` on PATH, ignoring the current directory and relative PATH
 * entries. Returns an absolute path or null.
 */
export function findOnPath(name, exts = ['.exe', '.cmd', '.bat']) {
  const cwd = process.cwd();
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir || !path.isAbsolute(dir) || sameDir(dir, cwd)) continue;
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/**
 * Windows: an absolute path for a bare command, or null if it is not found
 * outside the working directory. Other platforms: the command unchanged.
 */
export function safeCommand(cmd) {
  if (!isWin() || path.isAbsolute(cmd)) return cmd;
  const sys = SYSTEM32[cmd.toLowerCase()];
  if (sys) return sys(systemRoot());
  return findOnPath(cmd.replace(/\.(exe|cmd|bat)$/i, ''));
}

/** True if an absolute path sits inside the current directory (Windows only). */
export function insideCwd(file) {
  const rel = path.relative(process.cwd(), file);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
