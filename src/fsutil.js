import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Writes through a temp file in the same directory and renames it over the
 * target, so a crash never leaves a half-written secrets file. New files get
 * mode 0600 (ignored on Windows); existing files keep their mode.
 */
export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let mode = 0o600;
  try {
    mode = fs.statSync(file).mode & 0o777;
    if (process.platform !== 'win32') mode &= 0o700; // a secrets file is never group- or world-readable
  } catch {}
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, content, { mode });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows refuses to rename over a file another program holds open.
    fs.rmSync(tmp, { force: true });
    if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err;
    fs.writeFileSync(file, content);
  }
}
