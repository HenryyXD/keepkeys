import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpProject, write, read, run, start, waitForPageUrl, post } from './helpers.js';

const KEY = 'sk_test_' + 'Q'.repeat(20) + 'z9Y8';

test('add --stdin writes every destination and never prints the value', () => {
  const dir = tmpProject();
  const r = run(['add', 'STRIPE_SECRET_KEY', '--to', '.env.local,server/.dev.vars', '--stdin'], { cwd: dir, input: `${KEY}\n` });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(dir, '.env.local'), `STRIPE_SECRET_KEY=${KEY}\n`);
  assert.equal(read(dir, 'server/.dev.vars'), `STRIPE_SECRET_KEY=${KEY}\n`);
  assert.match(read(dir, '.gitignore'), /^\/\.env\.local$/m);
  assert.match(r.stdout, /ends in …z9Y8/);
  assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY));
});

test('add replaces an existing value', () => {
  const dir = tmpProject();
  write(dir, '.env', 'A=1\nSTRIPE_SECRET_KEY=old\nB=2\n');
  const r = run(['add', 'STRIPE_SECRET_KEY', '--to', '.env', '--stdin'], { cwd: dir, input: KEY });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(dir, '.env'), `A=1\nSTRIPE_SECRET_KEY=${KEY}\nB=2\n`);
});

test('add uses the manifest destinations', () => {
  const dir = tmpProject();
  write(dir, '.env.example', '# to: api/.dev.vars\nSTRIPE_SECRET_KEY=\n');
  const r = run(['add', 'STRIPE_SECRET_KEY', '--stdin'], { cwd: dir, input: KEY });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(dir, 'api/.dev.vars'), `STRIPE_SECRET_KEY=${KEY}\n`);
});

test('a suspicious value is refused without --yes when not interactive', () => {
  const dir = tmpProject();
  let r = run(['add', 'STRIPE_SECRET_KEY', '--to', '.env', '--stdin'], { cwd: dir, input: 'pk_test_' + 'x'.repeat(20) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /publishable key/);
  assert.equal(read(dir, '.env'), null);
  r = run(['add', 'STRIPE_SECRET_KEY', '--to', '.env', '--stdin', '--yes'], { cwd: dir, input: 'pk_test_' + 'x'.repeat(20) });
  assert.equal(r.code, 0);
});

test('refuses destinations outside the project and bad names', () => {
  const dir = tmpProject();
  assert.equal(run(['add', 'A', '--to', '../.env', '--stdin'], { cwd: dir, input: 'x'.repeat(20) }).code, 2);
  assert.equal(run(['add', 'A', '--to', 'package.json', '--stdin'], { cwd: dir, input: 'x'.repeat(20) }).code, 2);
  assert.equal(run(['add', 'BAD-NAME', '--stdin'], { cwd: dir, input: 'x'.repeat(20) }).code, 2);
});

test('warns loudly when the destination is already committed', () => {
  const dir = tmpProject();
  write(dir, '.env', 'A=1\n');
  run(['add', 'A', '--to', '.env', '--stdin'], { cwd: dir, input: 'x'.repeat(20) }); // creates .gitignore entry
  // Simulate a file committed before keepkeys ignored it.
  spawnSync('git', ['add', '-f', '.env'], { cwd: dir });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'], { cwd: dir });
  const r = run(['add', 'A', '--to', '.env', '--stdin'], { cwd: dir, input: 'y'.repeat(20) });
  assert.match(r.stderr, /already committed to git/);
});

test('list --json reports status without values', () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'A=\n# optional\nB=\n');
  write(dir, '.env.local', `A=${KEY}\n`);
  const r = run(['list', '--json'], { cwd: dir });
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data.keys.map((k) => [k.name, k.status]), [['A', 'ok'], ['B', 'missing']]);
  assert.ok(!r.stdout.includes(KEY));
});

test('list exits non-zero when a required key is missing', () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'A=\n');
  assert.equal(run(['list'], { cwd: dir }).code, 1);
  write(dir, '.env.local', 'A=1234567890123\n');
  assert.equal(run(['list'], { cwd: dir }).code, 0);
});

test('--browser opens the paste page and saves what is pasted', async () => {
  const dir = tmpProject();
  const p = start(['add', 'OPENROUTER_API_KEY', '--to', '.env.local', '--browser'], { cwd: dir });
  p.child.stdin.end(); // no TTY, nothing on stdin: like an agent's shell
  const url = await waitForPageUrl(p.out);
  const value = 'sk-or-v1-' + 'a'.repeat(60) + 'WXYZ';
  const res = await post(url, 'submit', { name: 'OPENROUTER_API_KEY', value });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ending, '…WXYZ');
  assert.equal(await p.exited, 0);
  assert.equal(read(dir, '.env.local'), `OPENROUTER_API_KEY=${value}\n`);
  assert.match(p.out.stdout, /ok: saved OPENROUTER_API_KEY \(ends in …WXYZ\)/);
  assert.ok(!p.out.stdout.includes(value) && !p.out.stderr.includes(value));
});

test('the page asks before saving a suspicious value', async () => {
  const dir = tmpProject();
  const p = start(['add', 'OPENAI_API_KEY', '--to', '.env', '--browser'], { cwd: dir });
  p.child.stdin.end();
  const url = await waitForPageUrl(p.out);
  const value = 'sk-ant-api03-' + 'b'.repeat(40);
  let res = await post(url, 'submit', { name: 'OPENAI_API_KEY', value });
  assert.equal(res.body.ok, false);
  assert.match(res.body.warnings.join(), /Anthropic/);
  assert.equal(read(dir, '.env'), null);
  res = await post(url, 'submit', { name: 'OPENAI_API_KEY', value, force: true });
  assert.equal(res.body.ok, true);
  assert.equal(await p.exited, 0);
});

test('skipping on the page exits cleanly without writing', async () => {
  const dir = tmpProject();
  const p = start(['add', 'A_KEY', '--to', '.env', '--browser'], { cwd: dir });
  p.child.stdin.end();
  const url = await waitForPageUrl(p.out);
  await post(url, 'skip', { name: 'A_KEY' });
  assert.equal(await p.exited, 0);
  assert.match(p.out.stdout, /skipped/);
  assert.equal(read(dir, '.env'), null);
});

test('fill without a terminal asks for every missing key on one page', async () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'A_KEY=\nB_KEY=\nC_KEY=\n');
  write(dir, '.env.local', 'B_KEY=already-set-123\n'); // an existing .env.local is used
  const p = start([], { cwd: dir });
  p.child.stdin.end();
  const url = await waitForPageUrl(p.out);
  assert.equal((await post(url, 'submit', { name: 'B_KEY', value: 'x'.repeat(20) })).status, 400); // not requested
  await post(url, 'submit', { name: 'A_KEY', value: 'a'.repeat(20) });
  await post(url, 'skip', { name: 'C_KEY' });
  assert.equal(await p.exited, 0);
  assert.equal(read(dir, '.env.local'), `B_KEY=already-set-123\nA_KEY=${'a'.repeat(20)}\n`);
});

test('--help and unknown commands', () => {
  assert.match(run(['--help']).stdout, /Keys Excluded from Every Prompt/);
  assert.equal(run(['frobnicate']).code, 2);
  assert.equal(run(['add', 'A', '--bogus']).code, 2);
});

test('.envrc gets export lines so direnv passes the key on', () => {
  const dir = tmpProject();
  const r = run(['add', 'API_TOKEN', '--to', '.envrc', '--stdin'], { cwd: dir, input: 'tok_0123456789abcdef' });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(dir, '.envrc'), 'export API_TOKEN=tok_0123456789abcdef\n');
});

// ---------------------------------------------------------------- headless (server, SSH)

test('headless, no terminal: add prints one command for the person and does not wait', () => {
  const dir = tmpProject();
  const r = run(['add', 'TELEGRAM_BOT_TOKEN', '--to', '.env'], { cwd: dir, env: { KEEPKEYS_HEADLESS: '1', KEEPKEYS_SELF: 'keepkeys' } });
  assert.equal(r.code, 4, r.stderr);
  assert.equal(r.stdout.trim(), `keepkeys --root ${dir} add TELEGRAM_BOT_TOKEN --to .env`);
  assert.match(r.stderr, /their own terminal/);
  assert.doesNotMatch(r.stderr, /opened a page/);
  assert.equal(read(dir, '.env'), null);
});

test('headless, no terminal: fill prints one command that asks for every missing key', () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nIMAP_USER=\nIMAP_PASSWORD=\nCLAUDE_CODE_OAUTH_TOKEN=\nPORT=8080\n');
  const r = run([], { cwd: dir, env: { KEEPKEYS_HEADLESS: '1', KEEPKEYS_SELF: 'keepkeys' } });
  assert.equal(r.code, 4, r.stderr);
  assert.equal(r.stdout.trim().split('\n').at(-1), `keepkeys --root ${dir}`, 'the command is the last line');
  assert.match(r.stdout, /\[MISSING\] IMAP_PASSWORD +\.env\n/, 'a .env.example defaults to .env');
  assert.match(r.stderr, /5 keys \(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, IMAP_USER, IMAP_PASSWORD, CLAUDE_CODE_OAUTH_TOKEN\)/);
});

test('--clipboard fails at once when there is no clipboard, instead of waiting in silence', { skip: process.platform !== 'linux' }, () => {
  const dir = tmpProject();
  const r = run(['add', 'TELEGRAM_BOT_TOKEN', '--to', '.env', '--clipboard'], { cwd: dir, env: { KEEPKEYS_HEADLESS: '1', PATH: '' } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no clipboard to read on this machine/);
});
