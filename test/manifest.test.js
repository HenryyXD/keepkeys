import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvExample, loadManifest, defaultDestination } from '../src/manifest.js';
import { tmpProject, write } from './helpers.js';

test('parses descriptions and directives from .env.example', () => {
  const keys = parseEnvExample(`# App settings
PORT=3000

# Stripe secret key for the API
# where: https://dashboard.stripe.com/apikeys
# to: .env.local, server/.dev.vars
STRIPE_SECRET_KEY=

# optional
# Analytics
export POSTHOG_KEY=phc_xxx
`);
  assert.deepEqual(keys, [
    {
      name: 'STRIPE_SECRET_KEY',
      description: 'Stripe secret key for the API',
      where: 'https://dashboard.stripe.com/apikeys',
      to: ['.env.local', 'server/.dev.vars'],
      optional: false,
    },
    { name: 'POSTHOG_KEY', description: 'Analytics', where: null, to: null, optional: true },
  ]);
});

test('a blank line ends a comment block', () => {
  const [k] = parseEnvExample('# header comment\n\nA=\n');
  assert.equal(k.description, null);
});

test('keepkeys.json wins over .env.example and fills defaults', () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'IGNORED=\n');
  write(dir, 'keepkeys.json', JSON.stringify({
    defaults: { to: ['.env'] },
    keys: {
      OPENROUTER_API_KEY: { description: 'LLM calls' },
      STRIPE_SECRET_KEY: { to: ['server/.dev.vars'], where: 'https://example.com' },
    },
  }));
  const m = loadManifest(dir);
  assert.equal(m.source, 'keepkeys.json');
  assert.deepEqual(m.keys.map((k) => [k.name, k.to, k.where]), [
    ['OPENROUTER_API_KEY', ['.env'], 'https://openrouter.ai/settings/keys'],
    ['STRIPE_SECRET_KEY', ['server/.dev.vars'], 'https://example.com'],
  ]);
});

test('default destination prefers an existing .env.local, then .env; a .env.example points at .env', () => {
  const dir = tmpProject();
  write(dir, '.env.example', 'A=\n');
  assert.deepEqual(loadManifest(dir).keys[0].to, ['.env']);
  write(dir, '.env', '');
  assert.deepEqual(loadManifest(dir).keys[0].to, ['.env']);
  write(dir, '.env.local', '');
  assert.deepEqual(loadManifest(dir).keys[0].to, ['.env.local']);
});

test('.dev.vars.example defaults to .dev.vars', () => {
  const dir = tmpProject();
  write(dir, '.dev.vars.example', 'API_KEY=\n');
  assert.deepEqual(loadManifest(dir).keys[0].to, ['.dev.vars']);
});

test('no manifest gives an empty list', () => {
  assert.deepEqual(loadManifest(tmpProject()), { source: null, problems: [], keys: [] });
});

test('settings with real example values are not treated as secrets', () => {
  const keys = parseEnvExample(`PORT=3000
NODE_ENV=development
APP_URL="http://localhost:3000"
OPENAI_API_KEY=sk-proj-your-key-here
STRIPE_SECRET_KEY=sk_test_51xxxxxxxx
JWT_SECRET=dev-only-secret
DATABASE_URL=<your database url>
SENTRY_DSN=

# secret
WEBHOOK_SIGNING=abc123
`);
  assert.deepEqual(keys.map((k) => k.name), ['OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'JWT_SECRET', 'DATABASE_URL', 'SENTRY_DSN', 'WEBHOOK_SIGNING']);
});

test('"optional" must be the whole comment, not the start of a description', () => {
  const [a, b] = parseEnvExample('# Optional: product analytics\nPOSTHOG_KEY=\n\n# optional\nSENTRY_DSN=\n');
  assert.equal(a.optional, false);
  assert.equal(a.description, 'Optional: product analytics');
  assert.equal(b.optional, true);
});

test('invalid names in keepkeys.json are skipped and reported', () => {
  const dir = tmpProject();
  write(dir, 'keepkeys.json', JSON.stringify({ keys: { GOOD_KEY: {}, '(': {}, '.*': {} } }));
  const m = loadManifest(dir);
  assert.deepEqual(m.keys.map((k) => k.name), ['GOOD_KEY']);
  assert.equal(m.problems.length, 2);
  assert.match(m.problems[0], /invalid variable name "\("/);
});

test('invalid keepkeys.json is a clear error', () => {
  const dir = tmpProject();
  write(dir, 'keepkeys.json', '{ nope');
  assert.throws(() => loadManifest(dir), /keepkeys\.json is not valid JSON/);
});

test('without a manifest or env file the default is still .env.local', () => {
  const dir = tmpProject();
  assert.equal(defaultDestination(dir), '.env.local');
});
