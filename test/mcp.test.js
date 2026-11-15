import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { tmpProject, write, read, start, waitFor, waitForPageUrl, post } from './helpers.js';

function client(dir, args = ['mcp', '--root', dir]) {
  const p = start(args, { cwd: dir });
  let id = 0;
  const messages = () => p.out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const call = async (method, params) => {
    const myId = ++id;
    p.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`);
    return waitFor(() => messages().find((m) => m.id === myId), { timeoutMs: 15000 });
  };
  const init = async (capabilities = {}) => {
    const r = await call('initialize', { protocolVersion: '2025-06-18', capabilities, clientInfo: { name: 'test', version: '0' } });
    p.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    return r;
  };
  return { p, call, init, messages, close: () => p.child.stdin.end() };
}

test('initializes and lists tools', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    const init = await c.init();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'keepkeys');
    assert.match(init.result.instructions, /Never ask the user to paste a secret/);
    const tools = await c.call('tools/list', {});
    assert.deepEqual(tools.result.tools.map((t) => t.name), ['request_secret', 'request_missing_secrets', 'secrets_status']);
    const unknown = await c.call('nope/nope', {});
    assert.equal(unknown.error.code, -32601);
  } finally {
    c.close();
  }
});

test('request_secret (browser) stores the value and the agent only sees the ending', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    await c.init();
    const value = 'sk-ant-api03-' + 'k'.repeat(40) + 'END1';
    const pending = c.call('tools/call', {
      name: 'request_secret',
      arguments: { name: 'ANTHROPIC_API_KEY', destinations: ['.env.local', 'worker/.dev.vars'], where_to_get: 'https://console.anthropic.com', method: 'browser' },
    });
    const url = await waitForPageUrl(c.p.out);
    assert.equal((await post(url, 'submit', { name: 'ANTHROPIC_API_KEY', value })).body.ok, true);
    const res = await pending;
    assert.equal(res.result.isError, undefined);
    assert.match(res.result.content[0].text, /ok: saved ANTHROPIC_API_KEY \(ends in …END1\) to \.env\.local, worker\/\.dev\.vars/);
    assert.equal(read(dir, '.env.local'), `ANTHROPIC_API_KEY=${value}\n`);
    assert.equal(read(dir, 'worker/.dev.vars'), `ANTHROPIC_API_KEY=${value}\n`);
    assert.ok(!c.p.out.stdout.includes(value), 'value leaked to the agent');
  } finally {
    c.close();
  }
});

test('request_secret refuses paths outside the project and env:user by default', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    await c.init();
    for (const destinations of [['../.env'], ['src/app.js'], ['env:user']]) {
      const res = await c.call('tools/call', { name: 'request_secret', arguments: { name: 'X_KEY', destinations } });
      assert.equal(res.result.isError, true, destinations[0]);
    }
    const bad = await c.call('tools/call', { name: 'request_secret', arguments: { name: 'X; rm -rf /' } });
    assert.equal(bad.result.isError, true);
  } finally {
    c.close();
  }
});

test('a skipped request is reported as an error result', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    await c.init();
    const pending = c.call('tools/call', { name: 'request_secret', arguments: { name: 'X_KEY', method: 'browser' } });
    const url = await waitForPageUrl(c.p.out);
    await post(url, 'skip', { name: 'X_KEY' });
    const res = await pending;
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /skipped/);
  } finally {
    c.close();
  }
});

test('secrets_status and request_missing_secrets use the manifest', async () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'A_KEY=\nB_KEY=\n');
  write(dir, '.env.local', 'A_KEY=set-already-1234\n');
  const c = client(dir);
  try {
    await c.init();
    const status = await c.call('tools/call', { name: 'secrets_status', arguments: {} });
    assert.match(status.result.content[0].text, /A_KEY: \.env\.local: set\nB_KEY: \.env\.local: missing/);
    assert.ok(!status.result.content[0].text.includes('set-already-1234'));
    const pending = c.call('tools/call', { name: 'request_missing_secrets', arguments: {} });
    const url = await waitForPageUrl(c.p.out);
    await post(url, 'submit', { name: 'B_KEY', value: 'b'.repeat(24) });
    const res = await pending;
    assert.match(res.result.content[0].text, /ok: saved B_KEY/);
  } finally {
    c.close();
  }
});

test('uses the client root when no --root is given', async () => {
  const dir = tmpProject();
  const elsewhere = tmpProject();
  const c = client(elsewhere, ['mcp']);
  try {
    await c.init({ roots: {} });
    const pending = c.call('tools/call', { name: 'secrets_status', arguments: {} });
    // Answer the server's roots/list request with `dir`.
    const req = await waitFor(() => c.messages().find((m) => m.method === 'roots/list'));
    c.p.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { roots: [{ uri: pathToFileURL(dir).href }] } })}\n`);
    const res = await pending;
    assert.ok(res.result.content[0].text.includes(dir), res.result.content[0].text);
  } finally {
    c.close();
  }
});

test('an unexpanded ${workspaceFolder} root is ignored', async () => {
  const dir = tmpProject();
  const c = client(dir, ['mcp', '--root', '${workspaceFolder}']);
  try {
    await c.init();
    const res = await c.call('tools/call', { name: 'secrets_status', arguments: {} });
    assert.ok(res.result.content[0].text.includes(dir), res.result.content[0].text);
    assert.match(c.p.out.stderr, /not expanded by the client/);
  } finally {
    c.close();
  }
});

test('request_secret accepts expected_prefixes and expected_pattern', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    await c.init();
    const tools = await c.call('tools/list', {});
    const props = tools.result.tools.find((t) => t.name === 'request_secret').inputSchema.properties;
    assert.equal(props.expected_prefixes.type, 'array');
    assert.equal(props.expected_prefixes.items.type, 'string');
    assert.equal(props.expected_pattern.type, 'string');
    const value = 'acme_sk_' + 'f'.repeat(30) + 'END2';
    const pending = c.call('tools/call', {
      name: 'request_secret',
      arguments: { name: 'ACME_API_KEY', method: 'browser', expected_prefixes: ['acme_sk_'] },
    });
    const url = await waitForPageUrl(c.p.out);
    assert.equal((await post(url, 'submit', { name: 'ACME_API_KEY', value })).body.ok, true);
    const res = await pending;
    assert.equal(res.result.isError, undefined);
    assert.match(res.result.content[0].text, /ok: saved ACME_API_KEY \(ends in …END2\)/);
    assert.doesNotMatch(res.result.content[0].text, /notes:/);
    assert.ok(!c.p.out.stdout.includes(value), 'value leaked to the agent');
  } finally {
    c.close();
  }
});

test('request_secret rejects an invalid expected_pattern', async () => {
  const dir = tmpProject();
  const c = client(dir);
  try {
    await c.init();
    const res = await c.call('tools/call', { name: 'request_secret', arguments: { name: 'ACME_API_KEY', method: 'browser', expected_pattern: '(' } });
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /expected_pattern/);
  } finally {
    c.close();
  }
});
