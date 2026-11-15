import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveFile, isSecretFileName, validateName } from '../src/paths.js';
import { resolveDestinations } from '../src/destinations/index.js';
import { tmpProject } from './helpers.js';

test('accepts env files inside the project', () => {
  const dir = tmpProject();
  assert.equal(resolveFile('.env.local', dir).rel, '.env.local');
  assert.equal(resolveFile('server/.dev.vars', dir).rel, 'server/.dev.vars');
  assert.equal(resolveFile(path.join(dir, 'config', 'prod.env'), dir).rel, 'config/prod.env');
});

test('refuses paths outside the project', () => {
  const dir = tmpProject();
  assert.throws(() => resolveFile('../.env', dir), /outside the project/);
  assert.throws(() => resolveFile(path.join(path.dirname(dir), '.env'), dir), /outside the project/);
});

test('refuses non-env files unless allowed', () => {
  const dir = tmpProject();
  assert.throws(() => resolveFile('src/index.js', dir), /only writes env files/);
  assert.throws(() => resolveFile('.env.example', dir), /only writes env files/);
  assert.equal(resolveFile('secrets.txt', dir, { allowAnyFile: true }).rel, 'secrets.txt');
});

test('refuses a symlinked directory that points outside', { skip: process.platform === 'win32' && 'symlinks need admin on Windows' }, () => {
  const dir = tmpProject();
  const outside = tmpProject();
  fs.symlinkSync(outside, path.join(dir, 'link'), 'dir');
  assert.throws(() => resolveFile('link/.env', dir), /outside the project/);
});

test('secret file names', () => {
  for (const ok of ['.env', '.env.local', '.env.production.local', 'prod.env', '.dev.vars', '.dev.vars.staging', '.envrc']) {
    assert.equal(isSecretFileName(ok), true, ok);
  }
  for (const bad of ['.env.example', '.env.sample', 'env', 'package.json', '.bashrc']) {
    assert.equal(isSecretFileName(bad), false, bad);
  }
});

test('validates variable names', () => {
  assert.equal(validateName('STRIPE_SECRET_KEY'), 'STRIPE_SECRET_KEY');
  for (const bad of ['', '1ABC', 'A-B', 'A B', 'A;rm', '../x']) assert.throws(() => validateName(bad), /invalid variable name/);
});

test('destination specs', () => {
  const dir = tmpProject();
  assert.equal(resolveDestinations(['env:user'], dir)[0].kind, 'env-user');
  assert.throws(() => resolveDestinations(['env:user'], dir, { allowEnvUser: false }), /--allow-env-user/);
  assert.throws(() => resolveDestinations(['wrangler:API_KEY'], dir), /planned/);
  assert.throws(() => resolveDestinations(['ftp:x'], dir), /unknown destination/);
  assert.throws(() => resolveDestinations([], dir), /no destination/);
  assert.equal(resolveDestinations(['.env', '.env'], dir).length, 1);
});
