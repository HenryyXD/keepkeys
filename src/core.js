// The one place that stores a secret. The CLI, the browser page and the MCP
// server all go through here, so they share every check.
import { inspect, lastFour } from './detect.js';
import { checkKey } from './check.js';
import { validateName } from './paths.js';

/**
 * Cleans the pasted value and collects everything the person should confirm.
 * Returns { value, provider, fixes, warnings, check }.
 */
export async function review(name, raw, { check = false, fetchImpl } = {}) {
  validateName(name);
  const result = inspect(name, raw);
  result.check = null;
  if (check && result.value && result.provider) {
    result.check = await checkKey(result.provider, result.value, { fetchImpl });
    if (result.check.ok === false) result.warnings.push(result.check.detail);
  }
  return result;
}

/**
 * Writes an already-reviewed value to every destination.
 * Returns { name, ending, saved: [{ label, notes }], warnings }.
 */
export function commit(name, value, destinations) {
  validateName(name);
  const saved = [];
  const warnings = [];
  for (const d of destinations) {
    const r = d.write(name, value);
    saved.push({ label: d.label, notes: r.notes });
    warnings.push(...r.warnings);
  }
  return { name, ending: lastFour(value), saved, warnings: [...new Set(warnings)] };
}

/** One-line summary that is safe to show to an agent: never the value. */
export function summary(result) {
  const where = result.saved.map((s) => s.label).join(', ');
  const ignored = result.saved.filter((s) => s.notes.includes('added to .gitignore')).map((s) => s.label);
  let line = `ok: saved ${result.name} (ends in ${result.ending}) to ${where}`;
  if (ignored.length) line += `; added ${ignored.join(', ')} to .gitignore`;
  return line;
}
