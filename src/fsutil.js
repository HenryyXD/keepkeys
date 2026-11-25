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
  mkdirOwned(dir);
  let st = null;
  try {
    st = fs.statSync(file);
  } catch {}
  let mode = st ? st.mode & 0o777 : 0o600;
  if (st && process.platform !== 'win32') mode &= 0o700; // a secrets file is never group- or world-readable
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  let owner = null; // [uid, gid] the result must have, when it differs from ours
  if (uid !== null) {
    if (st && (st.uid !== uid || st.gid !== process.getgid())) owner = [st.uid, st.gid];
    else if (!st) owner = inheritedOwner(dir);
  }

  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, content, { mode });
    fs.chmodSync(tmp, mode); // writeFileSync's mode is reduced by the umask
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    // No new file can be created here: write the existing file in place.
    if (st && (err.code === 'EPERM' || err.code === 'EACCES')) return fs.writeFileSync(file, content);
    throw err;
  }
  if (owner) {
    try {
      fs.chownSync(tmp, owner[0], owner[1]);
    } catch {
      // Can't give the file its owner (not root; or an id unmapped in a user
      // namespace, EINVAL). An existing file is written in place instead,
      // which keeps owner and mode; a new one simply stays ours.
      if (st) {
        fs.rmSync(tmp, { force: true });
        return fs.writeFileSync(file, content);
      }
    }
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

/**
 * Under root (sudo), files and directories keepkeys creates belong to the
 * owner of the closest existing directory, i.e. the project's user, not root.
 * Returns [uid, gid] or null when nothing needs changing.
 */
export function inheritedOwner(dir) {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return null;
  let d = dir;
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  try {
    const st = fs.statSync(d);
    return st.uid !== 0 ? [st.uid, st.gid] : null;
  } catch {
    return null;
  }
}

/** mkdir -p, giving new directories the owner of the closest existing one (see inheritedOwner). */
export function mkdirOwned(dir) {
  const owner = inheritedOwner(dir);
  const first = fs.mkdirSync(dir, { recursive: true });
  if (!owner || !first) return;
  for (let d = dir; d.length >= first.length; d = path.dirname(d)) {
    try {
      fs.chownSync(d, owner[0], owner[1]);
    } catch {}
    if (d === first) break;
  }
}
