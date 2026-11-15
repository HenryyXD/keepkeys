import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText } from './fsutil.js';

export function findGitRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.error) return null; // git not installed
  return r.status;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// Fallback when git is unavailable: exact-path or basename lines only.
function naiveIgnored(gitignoreText, rel) {
  const base = rel.split('/').pop();
  return gitignoreText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => l === rel || l === `/${rel}` || l === base || l === `**/${base}`);
}

/**
 * Makes sure `file` is ignored by git. The entry goes into the .gitignore at
 * the repository root (or `fallbackRoot` outside a repository).
 * Returns { added, tracked, gitignore }: `tracked` means the file is already
 * committed, which .gitignore cannot undo.
 */
export function ensureIgnored(file, fallbackRoot) {
  const root = findGitRoot(path.dirname(file)) ?? fallbackRoot;
  const rel = toPosix(path.relative(root, file));
  const gitignore = path.join(root, '.gitignore');
  const inRepo = fs.existsSync(path.join(root, '.git'));

  let ignored = null;
  let tracked = false;
  if (inRepo) {
    const st = git(['check-ignore', '-q', '--no-index', '--', rel], root);
    if (st === 0) ignored = true;
    else if (st === 1) ignored = false;
    tracked = git(['ls-files', '--error-unmatch', '--', rel], root) === 0;
  }
  const current = readText(gitignore) ?? '';
  if (ignored === null) ignored = naiveIgnored(current, rel);
  if (ignored) return { added: false, tracked, gitignore };

  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  let next = current;
  if (next && !next.endsWith('\n')) next += eol;
  if (!/^# keepkeys\b/m.test(next)) next += `${next ? eol : ''}# keepkeys: files that hold secret values${eol}`;
  next += `/${rel}${eol}`;
  fs.writeFileSync(gitignore, next);
  return { added: true, tracked, gitignore };
}
