import { KeepKeysError, EXIT } from '../errors.js';
import { fileDestination } from './file.js';
import { envUserDestination } from './env-user.js';

// Platform targets planned for a later version. Listed so the error message
// says "not yet" instead of treating them as file names.
const PLANNED = ['wrangler:', 'vercel:', 'gh:', 'netlify:', 'fly:'];

/**
 * Turns destination specs ("path/to/.env.local", "env:user") into objects
 * with has(name) and write(name, value). Everything is resolved before
 * anything is written, so one bad spec stops the whole operation.
 */
export function resolveDestinations(specs, root, { allowAnyFile = false, allowEnvUser = true } = {}) {
  if (!specs?.length) throw new KeepKeysError('no destination given (use --to)', EXIT.USAGE);
  const seen = new Set();
  const out = [];
  for (const raw of specs) {
    const spec = String(raw).trim();
    if (!spec || seen.has(spec)) continue;
    seen.add(spec);
    if (spec === 'env:user') {
      if (!allowEnvUser) {
        throw new KeepKeysError('env:user is disabled here; start the MCP server with --allow-env-user to enable it', EXIT.USAGE);
      }
      out.push(envUserDestination());
      continue;
    }
    if (PLANNED.some((p) => spec.startsWith(p))) {
      throw new KeepKeysError(`"${spec}": platform destinations are planned but not supported yet`, EXIT.USAGE);
    }
    if (/^[a-z]+:(?![\\/])/i.test(spec) && !/^[a-z]:[\\/]/i.test(spec)) {
      throw new KeepKeysError(`unknown destination "${spec}"`, EXIT.USAGE);
    }
    out.push(fileDestination(spec, root, { allowAnyFile }));
  }
  return out;
}
