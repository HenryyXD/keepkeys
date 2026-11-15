import fs from 'node:fs';
import path from 'node:path';
import { KeepKeysError } from './errors.js';
import { readText } from './fsutil.js';
import { stripBom } from './dotenv.js';
import { suggestWhere, identify } from './detect.js';
import { NAME_RE } from './paths.js';

export const MANIFEST_JSON = 'keepkeys.json';
export const EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template', '.dev.vars.example'];

function splitList(s) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// Example values that stand for "put your key here".
const PLACEHOLDER = /^(<.*>|\[.*\]|\{.*\}|x{3,}|\*{3,}|\.{3}|changeme|change[-_]?me|replace[-_]?me|todo|tbd|placeholder|none|null|example|secret|key|token)$|your|here|xxx/i;
// Names that hold secrets even when the example shows a real-looking value.
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE|CREDENTIAL|_KEY$/i;

function exampleValue(rest) {
  let v = rest.trim();
  const q = /^(["'])(.*?)\1/.exec(v);
  if (q) return q[2];
  return v.replace(/\s+#.*$/, '').trim();
}

/**
 * Parses an .env.example. Comment lines directly above a variable describe it:
 *   # Stripe secret key for the API server
 *   # where: https://dashboard.stripe.com/apikeys
 *   # to: .env.local, server/.dev.vars
 *   # optional
 *   STRIPE_SECRET_KEY=
 * A blank line ends a comment block.
 * Plain settings are left out: an entry whose example value is a real value
 * (PORT=3000, NODE_ENV=development) is configuration, not a secret, unless
 * its name says otherwise or a `# secret` line marks it.
 */
export function parseEnvExample(text) {
  const keys = [];
  let notes = [];
  let where = null;
  let to = null;
  let optional = false;
  let secret = false;
  const reset = () => {
    notes = [];
    where = null;
    to = null;
    optional = false;
    secret = false;
  };
  for (const raw of stripBom(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      reset();
      continue;
    }
    if (line.startsWith('#')) {
      const c = line.replace(/^#+\s*/, '');
      let m;
      if ((m = /^where\s*:\s*(.+)$/i.exec(c))) where = m[1].trim();
      else if ((m = /^to\s*:\s*(.+)$/i.exec(c))) to = splitList(m[1]);
      else if (/^optional\.?$/i.test(c)) optional = true;
      else if (/^secret\.?$/i.test(c)) secret = true;
      else if (c) notes.push(c);
      continue;
    }
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) {
      const value = exampleValue(m[2]);
      const isConfig = value && !PLACEHOLDER.test(value) && !identify(value) && !SECRET_NAME.test(m[1]) && !secret;
      if (!isConfig) keys.push({ name: m[1], description: notes.join(' ') || null, where, to, optional });
    }
    reset();
  }
  return keys;
}

export function parseManifestJson(text, file = MANIFEST_JSON) {
  let data;
  try {
    data = JSON.parse(stripBom(text));
  } catch (err) {
    throw new KeepKeysError(`${file} is not valid JSON: ${err.message}`);
  }
  const defaultsTo = data.defaults?.to ? [].concat(data.defaults.to) : null;
  const entries = data.keys ?? {};
  if (typeof entries !== 'object' || Array.isArray(entries)) {
    throw new KeepKeysError(`${file}: "keys" must be an object of NAME: { ... }`);
  }
  const keys = Object.entries(entries).map(([name, k]) => ({
    name,
    description: k?.description ?? null,
    where: k?.where ?? null,
    to: k?.to ? [].concat(k.to) : null,
    optional: Boolean(k?.optional),
  }));
  return { keys, defaultsTo };
}

/** Picks the default destination when nothing names one. */
export function defaultDestination(root) {
  if (fs.existsSync(path.join(root, '.env.local'))) return '.env.local';
  if (fs.existsSync(path.join(root, '.env'))) return '.env';
  return '.env.local';
}

/**
 * Loads the project's list of keys. keepkeys.json wins over .env.example.
 * Returns { source, keys, problems }, each key with `to` and `where` filled
 * in. Entries with invalid names are left out and listed in `problems`.
 */
export function loadManifest(root) {
  let source = null;
  let keys = [];
  let defaultsTo = null;

  const jsonText = readText(path.join(root, MANIFEST_JSON));
  if (jsonText !== null) {
    source = MANIFEST_JSON;
    ({ keys, defaultsTo } = parseManifestJson(jsonText));
  } else {
    for (const f of EXAMPLE_FILES) {
      const t = readText(path.join(root, f));
      if (t === null) continue;
      source = f;
      keys = parseEnvExample(t);
      if (f === '.dev.vars.example') defaultsTo = ['.dev.vars'];
      break;
    }
  }
  const fallback = defaultsTo ?? [defaultDestination(root)];
  const problems = keys.filter((k) => !NAME_RE.test(k.name)).map((k) => `${source}: invalid variable name "${k.name}" (skipped)`);
  return {
    source,
    problems,
    keys: keys
      .filter((k) => NAME_RE.test(k.name))
      .map((k) => ({ ...k, to: k.to?.length ? k.to : fallback, where: k.where ?? suggestWhere(k.name) })),
  };
}
