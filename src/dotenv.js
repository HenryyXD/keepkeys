// Line-preserving editor for NAME=value files (.env, .env.local, .dev.vars).
// It never reformats lines it does not own: comments, blank lines and other
// keys stay byte-for-byte the same.

const BOM = '﻿';

export function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function stripBom(text) {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

const SAFE_UNQUOTED = /^[A-Za-z0-9_\-.,/:+=@~%^]*$/;

export function formatValue(value) {
  if (SAFE_UNQUOTED.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

function assignmentRegex(name) {
  return new RegExp(`^\\s*(export\\s+)?${name}\\s*=`);
}

// A double- or single-quoted value that opens on this line but does not close
// on it continues on the following lines (multi-line values in dotenv).
function opensMultiline(line) {
  const eq = line.indexOf('=');
  const rest = line.slice(eq + 1).trimStart();
  const quote = rest[0];
  if (quote !== '"' && quote !== "'") return null;
  const body = rest.slice(1);
  for (let i = 0; i < body.length; i++) {
    if (quote === '"' && body[i] === '\\') {
      i++;
      continue;
    }
    if (body[i] === quote) return null;
  }
  return quote;
}

function closesQuote(line, quote) {
  for (let i = 0; i < line.length; i++) {
    if (quote === '"' && line[i] === '\\') {
      i++;
      continue;
    }
    if (line[i] === quote) return true;
  }
  return false;
}

/**
 * Sets NAME to value in the file text. Every existing assignment of NAME is
 * replaced in place (keeping an `export ` prefix); if there is none, the line
 * is appended. `exportAll` writes `export NAME=…` (direnv's .envrc needs it).
 * Returns { text, replaced }.
 */
export function upsert(text, name, value, { exportAll = false } = {}) {
  const hadBom = text.startsWith(BOM);
  const body = stripBom(text);
  const eol = detectEol(body);
  const lines = body.length ? body.split(/\r?\n/) : [];
  const re = assignmentRegex(name);
  const out = [];
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = re.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const quote = opensMultiline(line);
    if (quote) {
      while (i + 1 < lines.length && !closesQuote(lines[i + 1], quote)) i++;
      if (i + 1 < lines.length) i++;
    }
    if (replaced) continue; // drop later duplicates; the first one now holds the value
    out.push(`${exportAll ? 'export ' : m[1] ?? ''}${name}=${formatValue(value)}`);
    replaced = true;
  }

  if (!replaced) {
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push(`${exportAll ? 'export ' : ''}${name}=${formatValue(value)}`);
  }
  let result = out.join(eol);
  if (!result.endsWith(eol)) result += eol;
  return { text: (hadBom ? BOM : '') + result, replaced };
}

/** Returns true if NAME is assigned a non-empty value in the file text. */
export function hasValue(text, name) {
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const line of stripBom(text).split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const v = m[1].replace(/(^|\s+)#.*$/, '').trim();
    if (v && v !== '""' && v !== "''") return true;
  }
  return false;
}
