import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../src/fsutil.js';
import { tmpProject } from './helpers.js';

const posix = process.platform !== 'win32';
const root = posix && process.getuid() === 0;

test('a rewrite keeps the mode, whatever the umask', { skip: !posix }, () => {
  const dir = tmpProject({ git: false });
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'A=1\n');
  fs.chmodSync(f, 0o660);
  const old = process.umask(0o077);
  try {
    atomicWrite(f, 'A=2\n');
  } finally {
    process.umask(old);
  }
  assert.equal(fs.statSync(f).mode & 0o777, 0o660);
  assert.equal(fs.readFileSync(f, 'utf8'), 'A=2\n');
});

test('new files are private (0600)', { skip: !posix }, () => {
  const dir = tmpProject({ git: false });
  atomicWrite(path.join(dir, '.env'), 'A=1\n');
  assert.equal(fs.statSync(path.join(dir, '.env')).mode & 0o777, 0o600);
});

test('under sudo, the project user keeps their .env, and new files go to the directory owner', { skip: !root && 'needs root' }, () => {
  const dir = tmpProject({ git: false });
  fs.chownSync(dir, 4321, 4321);
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'A=1\n');
  fs.chownSync(f, 4321, 4321);
  fs.chmodSync(f, 0o640);
  atomicWrite(f, 'A=2\n');
  let st = fs.statSync(f);
  assert.deepEqual([st.uid, st.gid, st.mode & 0o777], [4321, 4321, 0o640]);

  const g = path.join(dir, '.env.local');
  atomicWrite(g, 'B=1\n');
  st = fs.statSync(g);
  assert.deepEqual([st.uid, st.gid, st.mode & 0o777], [4321, 4321, 0o600]);
});

test('a file someone else owns in a shared directory is rewritten in place, keeping its owner', { skip: !root && 'needs root' }, () => {
  const dir = tmpProject({ git: false });
  fs.chmodSync(dir, 0o777);
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'A=1\n');
  fs.chownSync(f, 4321, 4321);
  fs.chmodSync(f, 0o666);
  // Run as a third user, who may write the file but not chown it.
  const script = `import('${new URL('../src/fsutil.js', import.meta.url).href}').then((m) => m.atomicWrite(${JSON.stringify(f)}, 'A=2\\n'))`;
  const r = spawnSync(process.execPath, ['-e', script], { uid: 5555, gid: 5555, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const st = fs.statSync(f);
  assert.equal(st.uid, 4321);
  assert.equal(fs.readFileSync(f, 'utf8'), 'A=2\n');
});
