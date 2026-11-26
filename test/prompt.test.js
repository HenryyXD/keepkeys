import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readHidden } from '../src/prompt.js';

function fakeTty() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  let shown = '';
  output.on('data', (d) => (shown += d));
  return { input, output, shown: () => shown };
}

test('a bracketed paste submits on its own and is never echoed', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  t.input.write('\x1b[200~sk_live_SECRET1234\r\n\x1b[201~');
  assert.equal(await p, 'sk_live_SECRET1234');
  assert.ok(!t.shown().includes('SECRET'));
  assert.ok(t.shown().includes('•'));
});

test('line breaks inside a paste are kept (PEM keys), trailing ones are not', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  t.input.write('\x1b[200~-----BEGIN KEY-----\r\nabc123\r\n-----END KEY-----\r\n\x1b[201~');
  assert.equal(await p, '-----BEGIN KEY-----\nabc123\n-----END KEY-----');
});

test('paste markers split across chunks still work', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  t.input.write('\x1b[20');
  t.input.write('0~abcdefghij\x1b');
  t.input.write('[201~');
  assert.equal(await p, 'abcdefghij');
});

test('a paste burst without markers submits after a pause (Windows consoles)', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  t.input.write('sk-or-v1-0123456789abcdef');
  assert.equal(await p, 'sk-or-v1-0123456789abcdef');
});

test('a fast run of single characters also counts as a paste', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  for (const ch of 'gsk_0123456789') t.input.write(ch);
  assert.equal(await p, 'gsk_0123456789');
});

test('typing by hand waits for Enter and supports backspace', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const ch of 'abcdefghijx') {
    t.input.write(ch);
    await sleep(30);
  }
  t.input.write('\x7f');
  await sleep(400); // longer than the paste quiet period: must not submit
  t.input.write('k\r');
  assert.equal(await p, 'abcdefghijk');
});

test('Ctrl+V from a console without paste support reads the clipboard', async () => {
  const t = fakeTty();
  const p = readHidden('> ', { ...t, onCtrlV: () => 'from-clipboard-123\r\n' });
  t.input.write('\x16');
  assert.equal(await p, 'from-clipboard-123');
});

test('Ctrl+C cancels', async () => {
  const t = fakeTty();
  const p = readHidden('> ', t);
  t.input.write('\x03');
  await assert.rejects(p, /cancelled/);
});

const pause = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const typeSlowly = async (t, text) => {
  for (const ch of text) {
    t.input.write(ch);
    await pause();
  }
};

test('confirm: a paste is never echoed or taken as an answer, whole or one character at a time', async () => {
  const { confirm } = await import('../src/prompt.js');
  const t = fakeTty();
  let settled = false;
  const p = confirm('Save anyway?', t).finally(() => (settled = true));
  t.input.write('\x1b[200~sk-ant-NEXTKEY-0123456789\r\x1b[201~');
  // A console without bracketed paste delivers a paste one character per read, fast.
  for (const ch of 'sk-proj-abcdefXy12\r') t.input.write(ch);
  await pause(60);
  assert.equal(settled, false, 'a "y" inside a pasted key answered the question');
  await typeSlowly(t, 'y\r');
  assert.equal(await p, true);
  assert.ok(!t.shown().includes('NEXTKEY') && !t.shown().includes('abcdef'), 'pasted text was echoed');
  assert.match(t.shown(), /ignored a paste/);
});

test('confirm: y needs Enter (so the Enter is not left for the next prompt); Enter alone is no', async () => {
  const { confirm } = await import('../src/prompt.js');
  const t = fakeTty();
  let settled = false;
  const p = confirm('Save anyway?', t).finally(() => (settled = true));
  t.input.write('y');
  await pause(60);
  assert.equal(settled, false);
  await typeSlowly(t, '\r');
  assert.equal(await p, true);

  const t2 = fakeTty();
  const p2 = confirm('Save anyway?', t2);
  t2.input.write('\r');
  assert.equal(await p2, false);
});

test('confirm: Ctrl+C is an interrupt that stops the whole run', async () => {
  const { confirm } = await import('../src/prompt.js');
  const t = fakeTty();
  const p = confirm('Save anyway?', t);
  t.input.write('\x03');
  await assert.rejects(p, (e) => e.interrupted === true);
});

test('confirm: after a stray paste, y and Enter typed next still answer yes', async () => {
  const { confirm } = await import('../src/prompt.js');
  const t = fakeTty();
  const p = confirm('Save anyway?', t);
  t.input.write('\x1b[200~abcd efgh ijkl mnop\x1b[201~');
  await pause(60);
  await typeSlowly(t, 'y\r');
  assert.equal(await p, true);

  const t2 = fakeTty();
  const p2 = confirm('Save anyway?', t2);
  for (const ch of 'sk-proj-abcdef0123') t2.input.write(ch); // a fast burst, no Enter
  await pause(350);
  await typeSlowly(t2, 'y\r');
  assert.equal(await p2, true);
  assert.ok(!t2.shown().includes('abcdef'));
});
