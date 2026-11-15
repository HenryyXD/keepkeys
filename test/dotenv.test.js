import test from 'node:test';
import assert from 'node:assert/strict';
import { upsert, hasValue, formatValue } from '../src/dotenv.js';

test('appends to an empty file', () => {
  assert.equal(upsert('', 'A', 'x1').text, 'A=x1\n');
});

test('replaces an existing value in place and keeps everything else', () => {
  const before = '# comment\nA=old\n\nB=keep # note\n';
  const { text, replaced } = upsert(before, 'A', 'new');
  assert.equal(replaced, true);
  assert.equal(text, '# comment\nA=new\n\nB=keep # note\n');
});

test('keeps an export prefix', () => {
  assert.equal(upsert('export A=1\n', 'A', '2').text, 'export A=2\n');
});

test('does not touch similarly named keys', () => {
  assert.equal(upsert('AB=1\nA_B=2\n', 'A', '3').text, 'AB=1\nA_B=2\nA=3\n');
});

test('removes later duplicates', () => {
  assert.equal(upsert('A=1\nB=2\nA=3\n', 'A', '9').text, 'A=9\nB=2\n');
});

test('preserves CRLF line endings', () => {
  assert.equal(upsert('X=1\r\nA=old\r\n', 'A', 'n').text, 'X=1\r\nA=n\r\n');
});

test('preserves a BOM and still finds the key', () => {
  const { text, replaced } = upsert('﻿A=old\n', 'A', 'n');
  assert.equal(replaced, true);
  assert.equal(text, '﻿A=n\n');
});

test('replaces a multi-line quoted value completely', () => {
  const before = 'A="line1\nline2\nline3"\nB=2\n';
  assert.equal(upsert(before, 'A', 'x').text, 'A=x\nB=2\n');
});

test('adds a newline before appending when the file lacks one', () => {
  assert.equal(upsert('X=1', 'A', '2').text, 'X=1\nA=2\n');
});

test('quotes values that need it', () => {
  assert.equal(formatValue('sk_live_abc-123'), 'sk_live_abc-123');
  assert.equal(formatValue('has space'), "'has space'");
  assert.equal(formatValue('a#b'), "'a#b'");
  assert.equal(formatValue(`it's "x"`), `"it's \\"x\\""`);
  assert.equal(formatValue('a\nb'), '"a\\nb"');
});

test('exportAll writes export lines (for direnv .envrc)', () => {
  assert.equal(upsert('', 'A', 'x1', { exportAll: true }).text, 'export A=x1\n');
  assert.equal(upsert('A=old\n', 'A', 'x2', { exportAll: true }).text, 'export A=x2\n');
});

test('hasValue sees only non-empty assignments', () => {
  assert.equal(hasValue('A=1\n', 'A'), true);
  assert.equal(hasValue('A=\n', 'A'), false);
  assert.equal(hasValue('A=""\n', 'A'), false);
  assert.equal(hasValue('A= # todo\n', 'A'), false);
  assert.equal(hasValue('# A=1\n', 'A'), false);
  assert.equal(hasValue('export A=1\n', 'A'), true);
  assert.equal(hasValue('AB=1\n', 'A'), false);
});
