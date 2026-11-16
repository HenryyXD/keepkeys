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
 * target, so a crash never leaves a half-written secrets file.
 * - New files get mode 0600 (ignored on Windows).
 * - Existing files keep their mode and their owner. That matters under sudo:
 *   a rename would otherwise hand the project's .env to root, and the app
 *   running as the project's user could no longer read it. When the owner
 *   can't be kept (not root, someone else's file), the file is rewritten in
 *   place instead, which keeps owner and mode.
 * - A new file created by root (sudo) goes to the owner of its directory.
 */
export function atomicWrite(file, content) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  let st = null;
  try {
    st = fs.statSync(file);
  } catch {}
  const mode = st ? st.mode & 0o777 : 0o600;
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  let owner = null; // [uid, gid] the result must have, when it differs from ours
  if (uid !== null) {
    if (st && (st.uid !== uid || st.gid !== process.getgid())) owner = [st.uid, st.gid];
    else if (!st && uid === 0) {
      const d = fs.statSync(dir);
      if (d.uid !== 0) owner = [d.uid, d.gid];
    }
  }

  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, content, { mode });
    fs.chmodSync(tmp, mode); // writeFileSync's mode is reduced by the umask
    if (owner) fs.chownSync(tmp, owner[0], owner[1]);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    // Can't create a file here, or can't give it the original owner: write
    // the existing file in place instead.
    if (st && (err.code === 'EPERM' || err.code === 'EACCES')) return fs.writeFileSync(file, content);
    throw err;
  }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows refuses to rename over a file another program holds open.
    fs.rmSync(tmp, { force: true });
    if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err;
    fs.writeFileSync(file, content);
  }
}
