import fs from 'node:fs';
import path from 'node:path';
import { KeepKeysError, EXIT } from './errors.js';

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.length > 128) {
    throw new KeepKeysError(`invalid variable name "${name}": use letters, digits and _ (for example STRIPE_SECRET_KEY)`, EXIT.USAGE);
  }
  return name;
}

// Files keepkeys is willing to write: .env, .env.*, *.env, .dev.vars, .dev.vars.*, .envrc
const SECRET_FILE_RE = /^(\.env(\..+)?|.+\.env|\.dev\.vars(\..+)?|\.envrc)$/i;

export function isSecretFileName(file) {
  const base = path.basename(file);
  return SECRET_FILE_RE.test(base) && !/\.(example|sample|template)$/i.test(base);
}

// realpath of the deepest part of `p` that exists, with the rest appended.
// This catches symlinked directories that point outside the project.
function realish(p) {
  let existing = p;
  const rest = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  let real = existing;
  try {
    real = fs.realpathSync.native(existing);
  } catch {}
  return path.join(real, ...rest);
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolves a destination file relative to the project root and refuses
 * anything outside it, or anything that is not an env-style file. Both rules
 * matter most for the MCP server, where the agent chooses the destination.
 */
export function resolveFile(spec, root, { allowAnyFile = false } = {}) {
  const abs = path.resolve(root, spec);
  const realRoot = realish(path.resolve(root));
  if (!isInside(realish(abs), realRoot)) {
    throw new KeepKeysError(`refusing to write outside the project: ${spec}`, EXIT.USAGE);
  }
  if (!allowAnyFile && !isSecretFileName(abs)) {
    throw new KeepKeysError(
      `refusing to write ${spec}: keepkeys only writes env files (.env, .env.*, *.env, .dev.vars, .envrc)`,
      EXIT.USAGE,
    );
  }
  return { abs, rel: path.relative(root, abs).split(path.sep).join('/') };
}
