import test from 'node:test';
import assert from 'node:assert/strict';
import { identify, inspect, lastFour, suggestWhere } from '../src/detect.js';

const cases = {
  anthropic: 'sk-ant-api03-' + 'a'.repeat(40),
  openrouter: 'sk-or-v1-' + 'b'.repeat(64),
  openai: 'sk-proj-' + 'c'.repeat(40),
  'stripe-secret': 'sk_live_' + 'd'.repeat(24),
  'stripe-publishable': 'pk_test_' + 'e'.repeat(24),
  github: 'ghp_' + 'f'.repeat(36),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  google: 'AIza' + 'g'.repeat(35),
};

for (const [id, value] of Object.entries(cases)) {
  test(`identifies ${id}`, () => assert.equal(identify(value)?.id, id));
}

test('unknown values are not identified', () => {
  assert.equal(identify('just-some-random-token-value'), null);
});

test('a matching name and value has no warnings', () => {
  const r = inspect('ANTHROPIC_API_KEY', cases.anthropic);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.provider.id, 'anthropic');
});

test('warns when the value belongs to another provider', () => {
  const r = inspect('OPENAI_API_KEY', cases.anthropic);
  assert.match(r.warnings.join(), /looks like an OpenAI variable, but the value looks like an Anthropic/);
});

test('warns when the expected prefix is missing', () => {
  const r = inspect('STRIPE_SECRET_KEY', 'not-a-stripe-key-123456');
  assert.match(r.warnings.join(), /known Stripe/);
});

test('warns about a publishable key in a secret variable', () => {
  const r = inspect('STRIPE_SECRET_KEY', cases['stripe-publishable']);
  assert.match(r.warnings.join(), /publishable key/);
});

test('warns about a secret in a browser-exposed variable', () => {
  const r = inspect('NEXT_PUBLIC_OPENAI_KEY', cases.openai);
  assert.match(r.warnings.join(), /browser code/);
});

test('fixes whitespace, NAME= and quotes from a sloppy paste', () => {
  const r = inspect('STRIPE_SECRET_KEY', `  STRIPE_SECRET_KEY="${cases['stripe-secret']}"\n`);
  assert.equal(r.value, cases['stripe-secret']);
  assert.equal(r.fixes.length, 3);
  assert.deepEqual(r.warnings, []);
});

test('flags empty, short and spaced values', () => {
  assert.match(inspect('X', '   ').warnings.join(), /empty/);
  assert.match(inspect('X', 'abc').warnings.join(), /short/);
  assert.match(inspect('X', 'abc def ghi jkl').warnings.join(), /spaces/);
});

test('lastFour hides short values entirely', () => {
  assert.equal(lastFour('sk_live_abcdef1234'), '…1234');
  assert.equal(lastFour('short'), '…');
});

test('suggests where to get well-known keys', () => {
  assert.match(suggestWhere('OPENROUTER_API_KEY'), /openrouter\.ai/);
  assert.equal(suggestWhere('MY_THING'), null);
});
