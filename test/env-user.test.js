import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { upsertRc, rcHas, rcFileFor, shellQuote, envUserDestination, windowsHasUserEnv, windowsSetUserEnv } from '../src/destinations/env-user.js';
import { tmpProject, read } from './helpers.js';

test('shell quoting survives single quotes', () => {
  assert.equal(shellQuote(`a'b`), `'a'\\''b'`);
});

test('rc upsert appends once and then replaces', () => {
  let { text } = upsertRc('# my rc\nalias ll=ls\n', 'API_KEY', 'v1');
  assert.equal(text, "# my rc\nalias ll=ls\nexport API_KEY='v1'  # keepkeys\n");
  ({ text } = upsertRc(text, 'API_KEY', 'v2'));
  assert.equal(text, "# my rc\nalias ll=ls\nexport API_KEY='v2'  # keepkeys\n");
  assert.equal(rcHas(text, 'API_KEY'), true);
  assert.equal(rcHas(text, 'API'), false);
});

test('rc upsert replaces a hand-written export and drops duplicates', () => {
  const { text } = upsertRc('export K=old\nexport K=older\n', 'K', 'new');
  assert.equal(text, "export K='new'  # keepkeys\n");
});

test('fish uses set -gx', () => {
  const { text } = upsertRc('', 'K', 'v', { fish: true });
  assert.equal(text, "set -gx K 'v'  # keepkeys\n");
  assert.equal(rcHas(text, 'K', { fish: true }), true);
});

test('picks the rc file from the shell', () => {
  const home = '/home/u';
  assert.equal(rcFileFor({ shell: '/bin/zsh', platform: 'linux', home }).file, path.join(home, '.zshrc'));
  assert.equal(rcFileFor({ shell: '/bin/bash', platform: 'linux', home }).file, path.join(home, '.bashrc'));
  assert.equal(rcFileFor({ shell: '/bin/bash', platform: 'darwin', home }).file, path.join(home, '.bash_profile'));
  assert.equal(rcFileFor({ shell: '/usr/bin/fish', platform: 'linux', home }).fish, true);
  assert.equal(rcFileFor({ shell: '', platform: 'linux', home }).file, path.join(home, '.profile'));
});

test('env:user writes the rc file on macOS/Linux', { skip: process.platform === 'win32' && 'Unix only' }, () => {
  const dir = tmpProject({ git: false });
  const rc = path.join(dir, '.zshrc');
  process.env.KEEPKEYS_RC_FILE = rc;
  try {
    const d = envUserDestination();
    assert.equal(d.has('KK_TEST'), false);
    d.write('KK_TEST', "it's-secret");
    d.write('KK_TEST', "it's-secret");
    assert.equal(d.has('KK_TEST'), true);
    assert.equal(read(dir, '.zshrc'), "export KK_TEST='it'\\''s-secret'  # keepkeys\n");
  } finally {
    delete process.env.KEEPKEYS_RC_FILE;
  }
});

test('env:user sets a real Windows user variable', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const name = `KEEPKEYS_TEST_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const long = 'x'.repeat(3000); // longer than setx's 1024-character limit
  try {
    const d = envUserDestination();
    assert.equal(d.has(name), false);
    d.write(name, long);
    assert.equal(windowsHasUserEnv(name), true);
  } finally {
    windowsSetUserEnv(name, null);
  }
  assert.equal(windowsHasUserEnv(name), false);
});

test('fish quoting escapes only backslash and single quote', async () => {
  const { fishQuote } = await import('../src/destinations/env-user.js');
  assert.equal(fishQuote('abc'), "'abc'");
  assert.equal(fishQuote("it's"), "'it\\'s'");
  assert.equal(fishQuote('a\\'), "'a\\\\'");
});
