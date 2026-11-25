import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findOnPath, safeCommand, insideCwd } from '../src/winbin.js';

test('findOnPath ignores the working directory and relative PATH entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-winbin-'));
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-winbin-real-'));
  fs.writeFileSync(path.join(dir, 'tool.exe'), '');
  fs.writeFileSync(path.join(real, 'tool.exe'), '');
  const oldCwd = process.cwd();
  const oldPath = process.env.PATH;
  try {
    process.chdir(dir);
    process.env.PATH = [dir, '.', '', real].join(path.delimiter);
    assert.equal(path.resolve(findOnPath('tool')), path.resolve(real, 'tool.exe'));
    process.env.PATH = [dir, '.'].join(path.delimiter);
    assert.equal(findOnPath('tool'), null);
  } finally {
    process.chdir(oldCwd);
    process.env.PATH = oldPath;
  }
});

test('safeCommand leaves commands alone off Windows and uses System32 on Windows', () => {
  if (process.platform !== 'win32') return assert.equal(safeCommand('git'), 'git');
  const norm = (p) => p.split('\\').join('/');
  assert.ok(norm(safeCommand('powershell.exe')).toLowerCase().endsWith('/system32/windowspowershell/v1.0/powershell.exe'));
  assert.ok(norm(safeCommand('reg')).toLowerCase().endsWith('/system32/reg.exe'));
});

test('insideCwd', () => {
  assert.equal(insideCwd(path.join(process.cwd(), 'x', 'claude.cmd')), true);
  assert.equal(insideCwd(path.resolve(process.cwd(), '..', 'claude.cmd')), false);
});
