import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpProject, read, start, waitFor, waitForPageUrl, post } from './helpers.js';

const OPENROUTER = 'sk-or-v1-' + 'b'.repeat(60) + 'SAFE';

function server() {
  const dir = tmpProject();
  const clip = path.join(dir, '..', `${path.basename(dir)}.clipboard`);
  fs.writeFileSync(clip, '');
  const r = start(['mcp', '--root', dir], { cwd: dir, env: { KEEPKEYS_FAKE_CLIPBOARD: clip } });
  const lines = () => r.out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const send = (m) => r.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  const reply = (id) => waitFor(() => lines().find((m) => m.id === id), { timeoutMs: 15000 });
  send({ id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  return { dir, clip, r, lines, send, reply, copy: (text) => fs.writeFileSync(clip, text) };
}

const ask = (s, id, args) => s.send({ id, method: 'tools/call', params: { name: 'request_secret', arguments: args } });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

test('a request cancelled by the client stops watching and is never answered', async () => {
  const s = server();
  try {
    await s.reply(0);
    ask(s, 7, { name: 'OPENROUTER_API_KEY' });
    await waitFor(() => s.r.out.stderr.includes('copy OPENROUTER_API_KEY now'));
    s.send({ method: 'notifications/cancelled', params: { requestId: 7, reason: 'user pressed Esc' } });
    await sleep(500);
    s.copy(OPENROUTER);
    await sleep(1200);
    assert.equal(read(s.dir, '.env'), null, 'saved after cancellation');
    assert.equal(s.lines().find((m) => m.id === 7), undefined, 'answered a cancelled request');
  } finally {
    s.r.child.stdin.end();
  }
});

test('a new request replaces one that is still waiting', async () => {
  const s = server();
  try {
    await s.reply(0);
    ask(s, 1, { name: 'OPENROUTER_API_KEY' });
    await waitFor(() => s.r.out.stderr.includes('copy OPENROUTER_API_KEY now'));
    ask(s, 2, { name: 'OPENROUTER_API_KEY' });
    const first = await s.reply(1);
    assert.equal(first.result.isError, true);
    assert.match(first.result.content[0].text, /cancelled: .*replaced by a newer keepkeys request/);
    await sleep(600);
    s.copy(OPENROUTER);
    const second = await s.reply(2);
    assert.match(second.result.content[0].text, /ok: saved OPENROUTER_API_KEY \(ends in …SAFE\)/);
    // Only one watcher ran: the key was written once, by the second request.
    assert.equal(read(s.dir, '.env'), `OPENROUTER_API_KEY=${OPENROUTER}\n`);
  } finally {
    s.r.child.stdin.end();
  }
});

test('the server exits when the client disconnects, even while waiting', async () => {
  const s = server();
  await s.reply(0);
  ask(s, 1, { name: 'OPENROUTER_API_KEY' });
  await waitFor(() => s.r.out.stderr.includes('copy OPENROUTER_API_KEY now'));
  const t0 = Date.now();
  s.r.child.stdin.end();
  assert.equal(await s.r.exited, 0);
  assert.ok(Date.now() - t0 < 3000, 'took too long to exit');
});

test('the confirm page address never reaches the agent', async () => {
  const s = server();
  try {
    await s.reply(0);
    ask(s, 1, { name: 'MY_SERVICE_TOKEN' });
    await waitFor(() => s.r.out.stderr.includes('copy MY_SERVICE_TOKEN now'));
    s.copy('svc_7f3k9d2m5x8q1w4e');
    const url = await waitForPageUrl(s.r.out); // stderr only (no browser in tests)
    assert.ok(!s.r.out.stdout.includes(new URL(url).pathname), 'confirm URL sent to the agent');
    assert.equal(read(s.dir, '.env'), null);
    await post(url, 'confirm', { name: 'MY_SERVICE_TOKEN', accept: true });
    const res = await s.reply(1);
    assert.match(res.result.content[0].text, /ok: saved MY_SERVICE_TOKEN/);
    assert.ok(!s.r.out.stdout.includes('svc_7f3k9d2m5x8q1w4e'));
  } finally {
    s.r.child.stdin.end();
  }
});
