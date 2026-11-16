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

test('the handoff command is short, quoted for the shell and uses ~ for the home directory', () => {
  const opts = { env: { npm_command: 'exec' }, platform: 'linux', home: '/home/henry' };
  assert.equal(handoffCommand('/home/henry/app', [], opts), 'npx -y keepkeys --root ~/app');
  assert.equal(
    handoffCommand('/home/henry/my app', ['add', 'TELEGRAM_BOT_TOKEN', '--to', '.env'], opts),
    "npx -y keepkeys --root ~/'my app' add TELEGRAM_BOT_TOKEN --to .env",
  );
  assert.equal(handoffCommand('/srv/it\'s', [], opts), "npx -y keepkeys --root '/srv/it'\\''s'");
  assert.equal(handoffCommand('C:\\Users\\Ana\\My App', [], { ...opts, platform: 'win32' }), 'npx -y keepkeys --root "C:\\Users\\Ana\\My App"');
});

test('selfCommand: npx, a standalone binary, or node plus the script path', () => {
  assert.equal(selfCommand({ env: { KEEPKEYS_SELF: 'kk' } }), 'kk');
  assert.equal(selfCommand({ env: { npm_command: 'exec' } }), 'npx -y keepkeys');
  assert.equal(selfCommand({ env: { PATH: '' }, execPath: '/opt/keepkeys/keepkeys', platform: 'linux' }), '/opt/keepkeys/keepkeys');
  assert.equal(selfCommand({ env: { PATH: '' }, execPath: '/usr/bin/node', script: '/src/kk/bin/keepkeys.js', platform: 'linux' }), '/usr/bin/node /src/kk/bin/keepkeys.js');
  assert.equal(shellWord('a b', { platform: 'linux' }), "'a b'");
});
