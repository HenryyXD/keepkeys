import path from 'node:path';
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
      atomicWrite(abs, text);
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
