import fs from 'node:fs';
import path from 'node:path';
import { KeepKeysError } from '../errors.js';
import { readText, atomicWrite } from '../fsutil.js';
import { upsert, hasValue } from '../dotenv.js';
import { ensureIgnored } from '../gitignore.js';
import { resolveFile } from '../paths.js';

export function fileDestination(spec, root, opts) {
  const { abs, rel } = resolveFile(spec, root, opts);
  return {
    kind: 'file',
    label: rel,
    path: abs,

    has(name) {
      const text = readText(abs);
      return text !== null && hasValue(text, name);
    },

    write(name, value) {
      const notes = [];
      const before = readText(abs);
      // direnv only passes on variables that are exported.
      const exportAll = path.basename(abs) === '.envrc';
      const { text, replaced } = upsert(before ?? '', name, value, { exportAll });
      try {
        atomicWrite(abs, text);
      } catch (err) {
        if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;
        throw new KeepKeysError(permissionHint(rel, abs));
      }
      notes.push(before === null ? 'created' : replaced ? 'replaced existing value' : 'added');
      const ig = ensureIgnored(abs, root);
      if (ig.added) notes.push('added to .gitignore');
      const warnings = [];
      if (ig.tracked) {
        warnings.push(
          `${rel} is already committed to git; .gitignore cannot hide it. Run: git rm --cached ${rel}` +
            ' and rotate any key that was ever committed.',
        );
      }
      return { notes, warnings };
    },
  };
}

// Explains a permission error in terms of who owns the file, instead of the
// temp file name the error was raised for.
function permissionHint(rel, abs) {
  let target = abs;
  while (!fs.existsSync(target) && path.dirname(target) !== target) target = path.dirname(target);
  let owner = '';
  try {
    const st = fs.statSync(target);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) owner = ` (${target === abs ? 'it' : path.basename(target) || target} belongs to user id ${st.uid})`;
  } catch {}
  const sudo = owner && typeof process.getuid === 'function' ? ' Run keepkeys as the user who owns the project, e.g. sudo -u <owner> keepkeys …; keepkeys keeps the file\'s owner and mode either way.' : '';
  return `cannot write ${rel}: permission denied${owner}.${sudo}`;
}
