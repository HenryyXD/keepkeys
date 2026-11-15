import test from 'node:test';
import assert from 'node:assert/strict';
import { identify, inspect, lastFour, suggestWhere, normalizeExpectation } from '../src/detect.js';

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
  assert.match(r.warnings.join(), /expected sk_live_… or sk_test_…/);
  assert.doesNotMatch(r.warnings.join(), /wrong/i);
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

test('sk-ant keys of every variant are Anthropic keys with no parameters', () => {
  for (const prefix of ['sk-ant-usr-', 'sk-ant-oat01-', 'sk-ant-api03-']) {
    const value = prefix + 'a'.repeat(40);
    assert.deepEqual(inspect('ANTHROPIC_API_KEY', value).warnings, [], prefix);
    assert.equal(identify(value)?.id, 'anthropic', prefix);
  }
});

test('an agent-supplied prefix that matches gives no warning', () => {
  const expect = normalizeExpectation({ prefixes: ['acme_sk_'] });
  assert.deepEqual(inspect('ACME_KEY', 'acme_sk_' + 'b'.repeat(30), { expect }).warnings, []);
});

test('an agent-supplied prefix that does not match explains what was checked', () => {
  const expect = normalizeExpectation({ prefixes: ['acme_sk_'] });
  const { warnings } = inspect('ACME_KEY', 'other_' + 'c'.repeat(30), { expect });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /didn't recognise the format \(expected acme_sk_…\)/);
  assert.doesNotMatch(warnings[0], /wrong/i);
});

test('agent-supplied prefixes replace the built-in list', () => {
  const expect = normalizeExpectation({ prefixes: ['org-'] });
  assert.deepEqual(inspect('OPENAI_API_KEY', 'org-' + 'd'.repeat(30), { expect }).warnings, []);
});

test('expected_pattern is used when given', () => {
  const expect = normalizeExpectation({ pattern: '^re_[A-Za-z0-9]{20,}$' });
  assert.deepEqual(inspect('RESEND_KEY', 're_' + 'e'.repeat(24), { expect }).warnings, []);
  const { warnings } = inspect('RESEND_KEY', 're_short1', { expect });
  assert.match(warnings.join(), /didn't recognise the format/);
});

test('an unknown variable name with no parameters gives no format warning', () => {
  assert.deepEqual(inspect('MY_SERVICE_TOKEN', 'svc_7f3k9d2m5x8q1w4e').warnings, []);
});

test('normalizeExpectation rejects bad input', () => {
  assert.throws(() => normalizeExpectation({ pattern: '(' }), /expected_pattern/);
  assert.throws(() => normalizeExpectation({ pattern: 'a'.repeat(201) }), /expected_pattern/);
  assert.throws(() => normalizeExpectation({ prefixes: [''] }), /expected_prefixes/);
  assert.throws(() => normalizeExpectation({ prefixes: ['a'.repeat(65)] }), /expected_prefixes/);
  assert.throws(() => normalizeExpectation({ prefixes: Array.from({ length: 11 }, (_, i) => 'p' + i) }), /expected_prefixes/);
  assert.equal(normalizeExpectation({}), null);
  assert.equal(normalizeExpectation({ prefixes: [] }), null);
});

test('the cross-provider warning still shows when the agent passes a format', () => {
  const expect = normalizeExpectation({ prefixes: ['sk-'] });
  const { warnings } = inspect('OPENAI_API_KEY', 'sk-ant-api03-' + 'a'.repeat(40), { expect });
  assert.match(warnings.join(), /looks like an OpenAI variable, but the value looks like an Anthropic/);
});

test('a catastrophic expected_pattern cannot stall inspect', () => {
  const expect = normalizeExpectation({ pattern: '^(a+)+$' });
  const t0 = Date.now();
  const { warnings } = inspect('ACME_KEY', 'a'.repeat(40) + '!', { expect });
  assert.ok(Date.now() - t0 < 2000, 'inspect must return quickly');
  assert.match(warnings.join(), /didn't recognise the format/);
});
