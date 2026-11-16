import test from 'node:test';
import assert from 'node:assert/strict';
import { isHeadless, isRemoteSession, handoffCommand, selfCommand, shellWord } from '../src/env.js';

test('headless: no display on Linux, or any SSH session; KEEPKEYS_HEADLESS overrides', () => {
  assert.equal(isHeadless({}, 'linux'), true);
  assert.equal(isHeadless({ DISPLAY: ':0' }, 'linux'), false);
  assert.equal(isHeadless({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux'), false);
  assert.equal(isHeadless({}, 'darwin'), false);
  assert.equal(isHeadless({ SSH_CONNECTION: '1 2 3 4' }, 'darwin'), true, 'pbpaste over SSH reads the server, not the person');
  assert.equal(isHeadless({ DISPLAY: ':0', SSH_TTY: '/dev/pts/1' }, 'linux'), true);
  assert.equal(isHeadless({ KEEPKEYS_HEADLESS: '0' }, 'linux'), false);
  assert.equal(isHeadless({ DISPLAY: ':0', KEEPKEYS_HEADLESS: '1' }, 'linux'), true);
  assert.equal(isRemoteSession({ SSH_CLIENT: 'x' }), true);
});

test('the handoff command uses an absolute path (the person may be another user) and safe quoting', () => {
  const opts = { env: { KEEPKEYS_SELF: 'keepkeys' }, platform: 'linux' };
  assert.equal(handoffCommand('/home/henry/app', [], opts), 'keepkeys --root /home/henry/app');
  assert.equal(handoffCommand('/home/henry/my app', ['add', 'TELEGRAM_BOT_TOKEN', '--to', '.env'], opts), "keepkeys --root '/home/henry/my app' add TELEGRAM_BOT_TOKEN --to .env");
  assert.equal(handoffCommand("/srv/it's", [], opts), "keepkeys --root '/srv/it'\\''s'");
  assert.equal(handoffCommand('/srv/$(reboot)', [], opts), "keepkeys --root '/srv/$(reboot)'");
});

test('Windows: quotes that cmd.exe and PowerShell read the same way, never $, % or backticks', () => {
  const opts = { env: { KEEPKEYS_SELF: 'keepkeys' }, platform: 'win32' };
  assert.equal(handoffCommand('C:\\Users\\Ana\\My App', ['add', 'X', '--to', '.env,.dev.vars'], opts), 'keepkeys --root "C:\\Users\\Ana\\My App" add X --to ".env,.dev.vars"');
  for (const bad of ['C:\\x$(Start-Process calc)', 'C:\\100%PATH%', 'C:\\a`b', 'C:\\a"b']) {
    const cmd = handoffCommand(bad, [], opts);
    assert.ok(!cmd.startsWith('keepkeys --root'), cmd);
    assert.match(cmd, /run it inside/);
  }
});

test('selfCommand: npx, a standalone binary, or node plus the script path', () => {
  assert.equal(selfCommand({ env: { KEEPKEYS_SELF: 'kk' } }), 'kk');
  assert.equal(selfCommand({ env: { npm_command: 'exec' }, script: '/home/h/.npm/_npx/abc/node_modules/keepkeys/bin/keepkeys.js', version: '1.2.3' }), 'npx -y keepkeys@1.2.3');
  assert.notEqual(selfCommand({ env: { npm_command: 'exec', PATH: '' }, execPath: '/usr/bin/node', script: '/src/kk/bin/keepkeys.js', platform: 'linux' }), 'npx -y keepkeys@0.1.0', 'npm_command inherited from an unrelated npm exec');
  assert.equal(selfCommand({ env: { PATH: '' }, execPath: '/opt/keepkeys/keepkeys', platform: 'linux' }), '/opt/keepkeys/keepkeys');
  assert.equal(selfCommand({ env: { PATH: '' }, execPath: '/usr/bin/node', script: '/src/kk/bin/keepkeys.js', platform: 'linux' }), '/usr/bin/node /src/kk/bin/keepkeys.js');
  assert.equal(shellWord('a b', { platform: 'linux' }), "'a b'");
});
