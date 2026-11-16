import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../bin/keepkeys.js', import.meta.url));

export function tmpProject({ git = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeys-')));
  if (git) spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

export function write(dir, rel, text) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
}

export function read(dir, rel) {
  try {
    return fs.readFileSync(path.join(dir, rel), 'utf8');
  } catch {
    return null;
  }
}

// Tests act like a desktop unless they set KEEPKEYS_HEADLESS=1.
const baseEnv = () => ({ ...process.env, KEEPKEYS_HEADLESS: '0', KEEPKEYS_NO_BROWSER: '1', KEEPKEYS_NO_NOTIFY: '1', KEEPKEYS_DIAG_LOG: os.devNull, NO_COLOR: '1', KEEPKEYS_CLAUDE_BIN: 'none' });

/** Runs the CLI to completion. */
export function run(args, { cwd, input, env } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8', env: { ...baseEnv(), ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Starts the CLI (or MCP server) and returns the child plus collected output. */
export function start(args, { cwd, env } = {}) {
  const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...baseEnv(), ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (d) => (out.stdout += d));
  child.stderr.setEncoding('utf8').on('data', (d) => (out.stderr += d));
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  return { child, out, exited };
}

export async function waitFor(fn, { timeoutMs = 10000, intervalMs = 25 } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const URL_RE = /http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+/;

export async function waitForPageUrl(out) {
  const m = await waitFor(() => URL_RE.exec(out.stderr));
  return m[0];
}

/** Posts to the paste page the way the page's own script does. */
export async function post(pageUrl, action, body, headers = {}) {
  const u = new URL(pageUrl);
  const res = await fetch(`${pageUrl}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: u.origin, ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
