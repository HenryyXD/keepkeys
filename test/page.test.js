import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startPage } from '../src/page.js';

const items = [{ name: 'A_KEY', description: '<b>desc</b>', where: 'javascript:alert(1)', destinations: ['.env'] }];

function raw(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function withPage(fn, onSubmit = async () => ({ ok: true, ending: '…1234' })) {
  const page = await startPage(items, onSubmit, { timeoutMs: 5000 });
  try {
    await fn(page, new URL(page.url));
  } finally {
    page.close();
  }
}

test('serves the page with a strict CSP and escapes content', () =>
  withPage(async (page) => {
    const r = await raw(page.url);
    assert.equal(r.status, 200);
    assert.match(r.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.ok(r.body.includes('&lt;b&gt;desc&lt;/b&gt;'));
    assert.ok(!r.body.includes('href="javascript:'));
  }));

test('rejects a wrong token, host, origin or content type', () =>
  withPage(async (page, u) => {
    const json = { 'content-type': 'application/json', origin: u.origin };
    const body = JSON.stringify({ name: 'A_KEY', value: 'v'.repeat(20) });
    assert.equal((await raw(`${u.origin}/wrongtoken`)).status, 404);
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: { ...json, host: 'evil.example' }, body })).status, 403);
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: { ...json, origin: 'http://evil.example' }, body })).status, 403);
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: { origin: u.origin, 'content-type': 'text/plain' }, body })).status, 415);
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'OTHER', value: 'x' }) })).status, 400);
  }));

test('resolves when every item is answered', async () => {
  let got;
  const page = await startPage(items, async (name, value) => {
    got = [name, value];
    return { ok: true, ending: '…' };
  });
  const u = new URL(page.url);
  await raw(`${page.url}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: u.origin },
    body: JSON.stringify({ name: 'A_KEY', value: 'secret-value-123' }),
  });
  const done = await page.done;
  assert.deepEqual(got, ['A_KEY', 'secret-value-123']);
  assert.deepEqual(done, { reason: 'finished', results: { A_KEY: 'saved' } });
});

test('times out', async () => {
  const page = await startPage(items, async () => ({ ok: true }), { timeoutMs: 50 });
  assert.equal((await page.done).reason, 'timeout');
});

test('works through an SSH tunnel on another local port, still only for loopback host names', () =>
  withPage(async (page, u) => {
    const body = JSON.stringify({ name: 'A_KEY', value: 'v'.repeat(20) });
    const viaTunnel = { host: 'localhost:8765', origin: 'http://localhost:8765', 'content-type': 'application/json' };
    assert.equal((await raw(page.url, { headers: { host: 'localhost:8765' } })).status, 200);
    assert.equal((await raw(page.url, { headers: { host: 'evil.example:8765' } })).status, 403, 'DNS rebinding');
    assert.equal((await raw(page.url, { headers: { host: '127.0.0.1.evil.example:80' } })).status, 403);
    // The Origin must be the same tunnel address the page was loaded from.
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: { ...viaTunnel, origin: u.origin }, body })).status, 403);
    assert.equal((await raw(`${page.url}/submit`, { method: 'POST', headers: viaTunnel, body })).status, 200);
  }));
