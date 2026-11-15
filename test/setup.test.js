import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { serverCommand } from '../src/setup.js';
import { tmpProject, write, read, run } from './helpers.js';

test('a checkout runs the local file; an installed copy runs npx', () => {
  const local = serverCommand({ pkgDir: path.resolve('.') });
  assert.equal(local.command, 'node');
  assert.match(local.args[0], /keepkeys\.js$/);
  const inst = path.join(path.resolve('.'), 'node_modules', 'keepkeys');
  assert.deepEqual(serverCommand({ pkgDir: inst, platform: 'linux' }), { command: 'npx', args: ['-y', 'keepkeys', 'mcp'] });
  assert.deepEqual(serverCommand({ pkgDir: inst, platform: 'win32' }), { command: 'cmd', args: ['/c', 'npx', '-y', 'keepkeys', 'mcp'] });
});

test('setup cursor merges into an existing mcp.json and can remove itself', () => {
  const home = tmpProject({ git: false });
  write(home, '.cursor/mcp.json', JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  const env = { KEEPKEYS_HOME: home };
  assert.equal(run(['setup', 'cursor'], { env }).code, 0);
  let cfg = JSON.parse(read(home, '.cursor/mcp.json'));
  assert.deepEqual(Object.keys(cfg.mcpServers), ['other', 'keepkeys']);
  assert.deepEqual(cfg.mcpServers.keepkeys.args.slice(-2), ['--root', '${workspaceFolder}']);
  assert.equal(run(['setup', 'cursor', '--remove'], { env }).code, 0);
  cfg = JSON.parse(read(home, '.cursor/mcp.json'));
  assert.deepEqual(Object.keys(cfg.mcpServers), ['other']);
});

test('setup refuses to overwrite a broken config', () => {
  const home = tmpProject({ git: false });
  write(home, '.cursor/mcp.json', '{ broken');
  const r = run(['setup', 'cursor'], { env: { KEEPKEYS_HOME: home } });
  assert.equal(r.code, 1);
  assert.equal(read(home, '.cursor/mcp.json'), '{ broken');
});

test('setup --project writes .mcp.json and .cursor/mcp.json, --rules adds agent rules', () => {
  const dir = tmpProject();
  write(dir, 'CLAUDE.md', '# Project\n');
  const r = run(['setup', 'all', '--project', '--rules'], { cwd: dir, env: { KEEPKEYS_HOME: dir } });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(JSON.parse(read(dir, '.mcp.json')).mcpServers.keepkeys);
  assert.ok(JSON.parse(read(dir, '.cursor/mcp.json')).mcpServers.keepkeys);
  assert.match(read(dir, 'CLAUDE.md'), /^# Project\n\n<!-- keepkeys -->/);
  run(['setup', 'all', '--project', '--rules'], { cwd: dir, env: { KEEPKEYS_HOME: dir } });
  assert.equal(read(dir, 'CLAUDE.md').match(/<!-- keepkeys -->/g).length, 1);
});

test('setup --print shows both configurations', () => {
  const r = run(['setup', '--print']);
  assert.match(r.stdout, /claude mcp add --scope user keepkeys --/);
  assert.match(r.stdout, /"mcpServers"/);
});

test('setup claude without the claude command explains what to run', () => {
  const home = tmpProject({ git: false });
  const r = run(['setup', 'claude'], { env: { KEEPKEYS_HOME: home } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /claude mcp add --scope user keepkeys/);
});
