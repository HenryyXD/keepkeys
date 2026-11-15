import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureIgnored } from '../src/gitignore.js';
import { tmpProject, write, read } from './helpers.js';

test('adds the file to .gitignore once', () => {
  const dir = tmpProject();
  const f = path.join(dir, 'server', '.dev.vars');
  assert.equal(ensureIgnored(f, dir).added, true);
  assert.equal(ensureIgnored(f, dir).added, false);
  assert.equal(read(dir, '.gitignore'), '# keepkeys: files that hold secret values\n/server/.dev.vars\n');
});

test('respects existing patterns', () => {
  const dir = tmpProject();
  write(dir, '.gitignore', 'node_modules\n.env*\n');
  assert.equal(ensureIgnored(path.join(dir, '.env.local'), dir).added, false);
  assert.equal(read(dir, '.gitignore'), 'node_modules\n.env*\n');
});

test('appends to a file without a trailing newline, keeping CRLF', () => {
  const dir = tmpProject();
  write(dir, '.gitignore', 'node_modules\r\ndist');
  ensureIgnored(path.join(dir, '.env'), dir);
  assert.equal(read(dir, '.gitignore'), 'node_modules\r\ndist\r\n\r\n# keepkeys: files that hold secret values\r\n/.env\r\n');
});

test('uses the repository root from a subdirectory project', () => {
  const repo = tmpProject();
  const app = path.join(repo, 'apps', 'web');
  ensureIgnored(path.join(app, '.env.local'), app);
  assert.match(read(repo, '.gitignore'), /^\/apps\/web\/\.env\.local$/m);
});

test('reports a file that is already committed', () => {
  const dir = tmpProject();
  write(dir, '.env', 'A=1\n');
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir });
  git('add', '.env');
  git('commit', '-qm', 'oops');
  const r = ensureIgnored(path.join(dir, '.env'), dir);
  assert.equal(r.tracked, true);
});

test('works outside a git repository', () => {
  const dir = tmpProject({ git: false });
  assert.equal(ensureIgnored(path.join(dir, '.env'), dir).added, true);
  assert.equal(ensureIgnored(path.join(dir, '.env'), dir).added, false);
});
