import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { clipboardMatch, providersForName } from '../src/detect.js';
import { tmpProject, read, start, waitFor, waitForPageUrl, post } from './helpers.js';

const STRIPE = 'sk_test_' + 'Q'.repeat(24) + 'C0PY';

test('clipboardMatch accepts keys and ignores ordinary copies', () => {
  assert.deepEqual(
    [clipboardMatch('STRIPE_SECRET_KEY', STRIPE).ok, clipboardMatch('STRIPE_SECRET_KEY', STRIPE).strong],
    [true, true],
  );
  for (const text of ['hello world, how are you', 'https://dashboard.stripe.com/apikeys', 'npm install', '', 'abcdefghijklmnop']) {
    assert.equal(clipboardMatch('MY_TOKEN', text).ok, false, text);
  }
  assert.equal(clipboardMatch('MY_TOKEN', 'tok_8f3k2j5h7g9d1s').ok, true);
  assert.equal(clipboardMatch('MY_TOKEN', 'tok_8f3k2j5h7g9d1s').strong, false);
  // Another prefix for a known provider name is possible, but not "strong": it needs confirming.
  assert.deepEqual(
    [clipboardMatch('STRIPE_SECRET_KEY', 'tok_8f3k2j5h7g9d1s').ok, clipboardMatch('STRIPE_SECRET_KEY', 'tok_8f3k2j5h7g9d1s').strong],
    [true, false],
  );
  // File paths and emails are never taken for keys.
  for (const text of ['C:\\Users\\me\\proj1\\a.txt', 'src/app2/page.tsx', './build/out1.js', 'me123@example.com']) {
    assert.equal(clipboardMatch('MY_TOKEN', text).ok, false, text);
  }
  // Keys that contain slashes still count.
  assert.equal(clipboardMatch('AWS_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY').ok, true);
  // OAuth client secrets and IDs are not expected to have the provider's API-key prefix.
  assert.deepEqual(providersForName('GITHUB_CLIENT_SECRET'), []);
  assert.deepEqual(providersForName('GOOGLE_CLIENT_SECRET'), []);
  assert.deepEqual(providersForName('STRIPE_PRICE_ID'), []);
  assert.equal(providersForName('STRIPE_SECRET_KEY')[0].id, 'stripe-secret');
  // Paste accidents are cleaned before matching.
  assert.equal(clipboardMatch('STRIPE_SECRET_KEY', `  "${STRIPE}"\n`).value, STRIPE);
});

function project(initialClipboard) {
  const dir = tmpProject();
  const clip = path.join(dir, '..', `${path.basename(dir)}.clipboard`);
  fs.writeFileSync(clip, initialClipboard);
  return { dir, clip, env: { KEEPKEYS_FAKE_CLIPBOARD: clip } };
}

function addWithoutTerminal(args, p) {
  const r = start(['add', ...args], { cwd: p.dir, env: p.env });
  r.child.stdin.end(); // no TTY: an agent's shell
  return r;
}

test('without a terminal, add waits for a copy, saves it and clears the clipboard', async () => {
  const p = project('some earlier text');
  const r = addWithoutTerminal(['STRIPE_SECRET_KEY', '--to', '.env.local,server/.dev.vars'], p);
  await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'));
  fs.writeFileSync(p.clip, 'Thanks, see you tomorrow'); // an unrelated copy is ignored
  await waitFor(() => r.out.stderr.includes('ignored something copied'));
  fs.writeFileSync(p.clip, STRIPE);
  assert.equal(await r.exited, 0, r.out.stderr);
  assert.equal(read(p.dir, '.env.local'), `STRIPE_SECRET_KEY=${STRIPE}\n`);
  assert.equal(read(p.dir, 'server/.dev.vars'), `STRIPE_SECRET_KEY=${STRIPE}\n`);
  assert.equal(fs.readFileSync(p.clip, 'utf8'), '');
  assert.match(r.out.stdout, /ok: saved STRIPE_SECRET_KEY \(ends in …C0PY\)/);
  assert.ok(!r.out.stdout.includes(STRIPE) && !r.out.stderr.includes(STRIPE));
});

test('a key already in the clipboard is not taken; copying it again is', async () => {
  const p = project(STRIPE);
  const r = addWithoutTerminal(['STRIPE_SECRET_KEY', '--to', '.env'], p);
  await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'));
  await new Promise((done) => setTimeout(done, 900));
  assert.equal(read(p.dir, '.env'), null, 'took the old clipboard value');
  fs.writeFileSync(p.clip, STRIPE); // the same text, copied again
  assert.equal(await r.exited, 0, r.out.stderr);
  assert.equal(read(p.dir, '.env'), `STRIPE_SECRET_KEY=${STRIPE}\n`);
});

test('an unrecognised key is saved only after the person confirms it', async () => {
  const p = project('');
  const r = addWithoutTerminal(['MY_SERVICE_TOKEN', '--to', '.env'], p);
  await waitFor(() => r.out.stderr.includes('copy MY_SERVICE_TOKEN now'));
  fs.writeFileSync(p.clip, 'new_token_0987654321');
  const url = await waitForPageUrl(r.out);
  assert.match(r.out.stderr, /to confirm the copied value/);
  assert.equal(read(p.dir, '.env'), null, 'saved before confirming');
  assert.equal((await post(url, 'confirm', { name: 'MY_SERVICE_TOKEN', accept: true })).status, 200);
  assert.equal(await r.exited, 0, r.out.stderr);
  assert.equal(read(p.dir, '.env'), 'MY_SERVICE_TOKEN=new_token_0987654321\n');
  assert.ok(!r.out.stderr.includes('new_token_0987654321') && !r.out.stdout.includes('new_token_0987654321'));
});

test('a declined value is not saved and keepkeys keeps waiting', async () => {
  const p = project('');
  const r = addWithoutTerminal(['MY_SERVICE_TOKEN', '--to', '.env', '--timeout', '6'], p);
  await waitFor(() => r.out.stderr.includes('copy MY_SERVICE_TOKEN now'));
  fs.writeFileSync(p.clip, 'password_from_vault_123');
  const url = await waitForPageUrl(r.out);
  await post(url, 'confirm', { name: 'MY_SERVICE_TOKEN', accept: false });
  await waitFor(() => r.out.stderr.includes('did not confirm'));
  assert.equal(await r.exited, 3);
  assert.equal(read(p.dir, '.env'), null);
});

test('a publishable Stripe key for a secret variable needs confirming', async () => {
  const p = project('');
  const r = addWithoutTerminal(['STRIPE_SECRET_KEY', '--to', '.env', '--timeout', '6'], p);
  await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'));
  fs.writeFileSync(p.clip, 'pk_test_51' + 'x'.repeat(24));
  const url = await waitForPageUrl(r.out);
  const page = await fetch(url).then((res) => res.text());
  assert.match(page, /publishable key/);
  await post(url, 'confirm', { name: 'STRIPE_SECRET_KEY', accept: false });
  assert.equal(await r.exited, 3);
  assert.equal(read(p.dir, '.env'), null);
});

test('a timeout explains that the copy did not register', async () => {
  const p = project('');
  const r = addWithoutTerminal(['STRIPE_SECRET_KEY', '--to', '.env', '--timeout', '1'], p);
  assert.equal(await r.exited, 3);
  assert.match(r.out.stdout, /timeout: STRIPE_SECRET_KEY was not saved; .*copy probably did not register/);
  assert.equal(read(p.dir, '.env'), null);
});

test('MCP request_secret uses the clipboard by default and tells the agent what to say', async () => {
  const p = project('');
  const r = start(['mcp', '--root', p.dir], { cwd: p.dir, env: p.env });
  const lines = () => r.out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const send = (m) => r.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  try {
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    const init = await waitFor(() => lines().find((m) => m.id === 1));
    assert.match(init.result.instructions, /pick it up from the clipboard/);
    send({ id: 2, method: 'tools/call', params: { name: 'request_secret', arguments: { name: 'STRIPE_SECRET_KEY' } } });
    await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'));
    fs.writeFileSync(p.clip, STRIPE);
    // The first clipboard save of a session is confirmed even with the right prefix.
    const url = await waitForPageUrl(r.out);
    assert.equal(read(p.dir, '.env.local'), null, 'saved before confirming');
    assert.equal((await post(url, 'confirm', { name: 'STRIPE_SECRET_KEY', accept: true })).status, 200);
    const res = await waitFor(() => lines().find((m) => m.id === 2), { timeoutMs: 15000 });
    const text = res.result.content[0].text;
    assert.match(text, /ok: saved STRIPE_SECRET_KEY \(ends in …C0PY\) to \.env\.local/);
    assert.match(text, /Next: .*confirm in chat that STRIPE_SECRET_KEY ending in …C0PY was received/);
    assert.ok(!r.out.stdout.includes(STRIPE));
    assert.equal(read(p.dir, '.env.local'), `STRIPE_SECRET_KEY=${STRIPE}\n`);
  } finally {
    r.child.stdin.end();
  }
});

test('an agent-supplied format never skips the confirm page', async () => {
  const p = project('');
  const r = start(['mcp', '--root', p.dir], { cwd: p.dir, env: p.env });
  const lines = () => r.out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const send = (m) => r.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  const value = 'acme_sk_' + 'g'.repeat(30) + '7'; // a key needs a digit to count as one
  try {
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    await waitFor(() => lines().find((m) => m.id === 1));
    send({ id: 2, method: 'tools/call', params: { name: 'request_secret', arguments: { name: 'ACME_API_KEY', destinations: ['.env'], expected_pattern: '.*' } } });
    await waitFor(() => r.out.stderr.includes('copy ACME_API_KEY now'));
    fs.writeFileSync(p.clip, value);
    const url = await waitForPageUrl(r.out);
    assert.match(r.out.stderr, /to confirm the copied value/);
    assert.equal(read(p.dir, '.env'), null, 'saved before confirming');
    assert.equal((await post(url, 'confirm', { name: 'ACME_API_KEY', accept: true })).status, 200);
    const res = await waitFor(() => lines().find((m) => m.id === 2), { timeoutMs: 15000 });
    assert.match(res.result.content[0].text, /ok: saved ACME_API_KEY/);
    assert.equal(read(p.dir, '.env'), `ACME_API_KEY=${value}\n`);
    assert.ok(!r.out.stdout.includes(value));
  } finally {
    r.child.stdin.end();
  }
});

test('a known key that misses the agent-supplied prefix still goes to the confirm page', async () => {
  const p = project('');
  const r = start(['mcp', '--root', p.dir], { cwd: p.dir, env: p.env });
  const lines = () => r.out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const send = (m) => r.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  try {
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    await waitFor(() => lines().find((m) => m.id === 1));
    // STRIPE is sk_test_…, a built-in strong match for this name, but the agent asked for a live key.
    send({ id: 2, method: 'tools/call', params: { name: 'request_secret', arguments: { name: 'STRIPE_SECRET_KEY', destinations: ['.env'], expected_prefixes: ['sk_live_'] } } });
    await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'));
    fs.writeFileSync(p.clip, STRIPE);
    const url = await waitForPageUrl(r.out);
    const page = await fetch(url).then((res) => res.text());
    assert.match(page, /the agent said to expect sk_live_…/);
    assert.equal(read(p.dir, '.env'), null, 'saved before confirming');
    await post(url, 'confirm', { name: 'STRIPE_SECRET_KEY', accept: false });
    await waitFor(() => r.out.stderr.includes('did not confirm'));
    assert.equal(read(p.dir, '.env'), null);
    assert.ok(!r.out.stdout.includes(STRIPE));
  } finally {
    r.child.stdin.end();
  }
});

// Uses the real system clipboard, so it only runs when asked; it restores the
// previous clipboard text afterwards.
test('real Windows clipboard', { skip: !(process.platform === 'win32' && process.env.KEEPKEYS_TEST_REAL_CLIPBOARD) && 'set KEEPKEYS_TEST_REAL_CLIPBOARD=1 on Windows' }, async () => {
  const ps = (script, input) => spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', input });
  const saved = ps('Get-Clipboard -Raw').stdout;
  try {
    ps("Set-Clipboard -Value 'not a key at all'");
    const dir = tmpProject();
    const r = start(['add', 'STRIPE_SECRET_KEY', '--to', '.env'], { cwd: dir });
    r.child.stdin.end();
    await waitFor(() => r.out.stderr.includes('copy STRIPE_SECRET_KEY now'), { timeoutMs: 15000 });
    ps(`Set-Clipboard -Value '${STRIPE}'`);
    assert.equal(await r.exited, 0, r.out.stderr);
    assert.equal(read(dir, '.env'), `STRIPE_SECRET_KEY=${STRIPE}\n`);
    assert.notEqual(ps('Get-Clipboard -Raw').stdout.trim(), STRIPE, 'clipboard was not cleared');
  } finally {
    if (saved && saved.trim()) ps('Set-Clipboard -Value ([Console]::In.ReadToEnd())', saved.replace(/\r?\n$/, ''));
  }
});

test('notification commands quote their text', async () => {
  const { notifyCommand } = await import('../src/notify.js');
  const [, macArgs] = notifyCommand('Got it', 'say "hi"', 'darwin');
  assert.equal(macArgs[1], String.raw`display notification "say \"hi\"" with title "Got it"`);
  assert.deepEqual(notifyCommand('T', 'B', 'linux'), ['notify-send', ['--app-name=keepkeys', 'T', 'B']]);
  const [cmd, winArgs] = notifyCommand("it's", 'x', 'win32');
  assert.equal(cmd, 'powershell.exe');
  assert.match(Buffer.from(winArgs.at(-1), 'base64').toString('utf16le'), /'it''s'/);
});
