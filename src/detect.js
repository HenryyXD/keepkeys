// Recognises secrets by their provider prefix and checks that the value fits
// the variable name. Kept free of I/O so a future paste-detection hook can
// reuse it.

export const PROVIDERS = [
  // Anthropic: the whole sk-ant- family (api03, admin01, usr, oat01, …), not a fixed sub-prefix.
  { id: 'anthropic', label: 'Anthropic', value: /^sk-ant-[a-z]+\d*-/, name: /ANTHROPIC|CLAUDE/, shown: 'sk-ant-…', where: 'https://console.anthropic.com/settings/keys' },
  { id: 'openrouter', label: 'OpenRouter', value: /^sk-or-v1-/, name: /OPENROUTER/, shown: 'sk-or-v1-…', where: 'https://openrouter.ai/settings/keys' },
  { id: 'openai', label: 'OpenAI', value: /^sk-(proj|svcacct|admin)-|^sk-[A-Za-z0-9]{32,}$/, name: /OPENAI/, shown: 'sk-proj-… or sk-…', where: 'https://platform.openai.com/api-keys' },
  { id: 'stripe-secret', label: 'Stripe secret key', value: /^sk_(live|test)_/, name: /STRIPE/, shown: 'sk_live_… or sk_test_…', where: 'https://dashboard.stripe.com/apikeys' },
  { id: 'stripe-restricted', label: 'Stripe restricted key', value: /^rk_(live|test)_/, name: /STRIPE/, shown: 'rk_live_… or rk_test_…', where: 'https://dashboard.stripe.com/apikeys' },
  { id: 'stripe-publishable', label: 'Stripe publishable key', value: /^pk_(live|test)_/, name: /STRIPE/, shown: 'pk_live_… or pk_test_…', where: 'https://dashboard.stripe.com/apikeys' },
  { id: 'stripe-webhook', label: 'Stripe webhook secret', value: /^whsec_/, name: /STRIPE|WEBHOOK/, shown: 'whsec_…', where: 'https://dashboard.stripe.com/webhooks' },
  { id: 'github', label: 'GitHub token', value: /^(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_)/, name: /GITHUB|^GH_/, shown: 'ghp_… or github_pat_…', where: 'https://github.com/settings/tokens' },
  { id: 'gitlab', label: 'GitLab token', value: /^glpat-/, name: /GITLAB/, shown: 'glpat-…', where: 'https://gitlab.com/-/user_settings/personal_access_tokens' },
  { id: 'aws', label: 'AWS access key ID', value: /^(AKIA|ASIA)[A-Z0-9]{16}$/, name: /AWS_ACCESS_KEY/, shown: 'AKIA…', where: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
  { id: 'google', label: 'Google API key', value: /^AIza[0-9A-Za-z_-]{35}$/, name: /GOOGLE|GEMINI|FIREBASE/, shown: 'AIza…', where: 'https://aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq', value: /^gsk_/, name: /GROQ/, shown: 'gsk_…', where: 'https://console.groq.com/keys' },
  { id: 'xai', label: 'xAI', value: /^xai-/, name: /XAI|GROK/, shown: 'xai-…', where: 'https://console.x.ai' },
  { id: 'perplexity', label: 'Perplexity', value: /^pplx-/, name: /PERPLEXITY|PPLX/, shown: 'pplx-…', where: 'https://www.perplexity.ai/settings/api' },
  { id: 'huggingface', label: 'Hugging Face', value: /^hf_/, name: /^HF_|HUGGING/, shown: 'hf_…', where: 'https://huggingface.co/settings/tokens' },
  // Slack: also xoxe- / xoxe.xoxp- (rotating and refresh tokens).
  // Slack: also xoxe- / xoxe.xoxp- (rotating and refresh tokens).
  { id: 'slack', label: 'Slack token', value: /^xox[abeprs]-|^xoxe\./, name: /SLACK/, shown: 'xoxb-… or xoxp-…', where: 'https://api.slack.com/apps' },
  { id: 'sendgrid', label: 'SendGrid', value: /^SG\.[A-Za-z0-9_-]{16,}\./, name: /SENDGRID/, shown: 'SG.…', where: 'https://app.sendgrid.com/settings/api_keys' },
  { id: 'resend', label: 'Resend', value: /^re_[A-Za-z0-9_]{16,}/, name: /RESEND/, shown: 're_…', where: 'https://resend.com/api-keys' },
  { id: 'npm', label: 'npm token', value: /^npm_[A-Za-z0-9]{36}$/, name: /NPM/, shown: 'npm_…', where: 'https://www.npmjs.com/settings/~/tokens' },
];

export function identify(value) {
  return PROVIDERS.find((p) => p.value.test(value)) ?? null;
}

// Names that mention a provider but hold something other than its API key:
// IDs, URLs, OAuth client secrets (GOCSPX-…, hex), credential file paths…
const NOT_AN_API_KEY =
  /(_ID|_IDS|_URL|_URI|_HOST|_PORT|_REGION|_DOMAIN|_PROJECT|_ACCOUNT|_ORG|_EMAIL|_USER|_USERNAME|_NAME|_PATH|_FILE|_MODEL)$|CLIENT_SECRET|CLIENT_ID|OAUTH|CREDENTIALS/;

export function providersForName(name) {
  const upper = name.toUpperCase();
  if (NOT_AN_API_KEY.test(upper)) return [];
  return PROVIDERS.filter((p) => p.name.test(upper));
}

/**
 * Turns the format hints an agent passed (expected_prefixes / expected_pattern)
 * into something inspect() can check. Returns null when there are none.
 * Hints only shape warnings; they never make a copy "strong".
 */
export function normalizeExpectation({ prefixes, pattern } = {}) {
  const list = Array.isArray(prefixes) ? prefixes : prefixes == null ? [] : null;
  if (list === null) throw new Error('expected_prefixes must be an array of strings');
  if (list.length > 10) throw new Error('expected_prefixes: at most 10 prefixes');
  for (const p of list) {
    if (typeof p !== 'string' || !p.length || p.length > 64) throw new Error('expected_prefixes: each prefix must be 1 to 64 characters');
  }
  let re = null;
  if (pattern != null && pattern !== '') {
    if (typeof pattern !== 'string' || pattern.length > 200) throw new Error('expected_pattern: must be a regex string of at most 200 characters');
    try {
      re = new RegExp(pattern);
    } catch {
      throw new Error('expected_pattern: not a valid regular expression');
    }
  }
  if (!list.length && !re) return null;
  const shown = [...list.map((p) => `${p}…`), ...(re ? [`/${pattern}/`] : [])].join(' or ');
  return { prefixes: list, pattern: re, shown };
}

const matchesExpectation = (expect, value) =>
  expect.prefixes.some((p) => value.startsWith(p)) || (expect.pattern ? expect.pattern.test(value) : false);

const article = (word) => (/^[AEIOU]/i.test(word) ? 'an' : 'a');
export const aKey = (label) => (label ? `${article(label)} ${label} key` : 'a key');

export function suggestWhere(name) {
  return providersForName(name)[0]?.where ?? null;
}

export function lastFour(value) {
  return value.length > 8 ? `…${value.slice(-4)}` : '…';
}

const looksLikePath = (v) => /^[A-Za-z]:[\\/]|^\.{0,2}\/|^~\//.test(v) || (/[\\/]/.test(v) && /\.[A-Za-z0-9]{1,5}$/.test(v));
const looksLikeEmail = (v) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(v);

/**
 * Decides whether copied text could be the key we are waiting for, so that
 * copying a sentence, URL, file path or email while keepkeys watches is ignored.
 * `strong` means the value also has the provider prefix the name expects
 * (e.g. sk-or-v1- for OPENROUTER_API_KEY). Anything else that passes `ok` is
 * only saved after the person confirms it.
 */
export function clipboardMatch(name, raw, { expect } = {}) {
  const { value } = inspect(name, raw ?? '');
  const ok =
    value.length >= 12 &&
    value.length <= 4096 &&
    !/\s/.test(value) &&
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) &&
    !looksLikePath(value) &&
    !looksLikeEmail(value) &&
    /[0-9]/.test(value) &&
    /[A-Za-z]/.test(value);
  const expected = providersForName(name);
  const provider = identify(value);
  const strong = ok && expected.length > 0 && expected.includes(provider);
  // formatOk is for messages only; `strong` ignores the agent's hints on purpose.
  const formatOk = expect ? matchesExpectation(expect, value) : null;
  return { ok, strong, formatOk, value, provider, expected };
}

/**
 * Cleans up common paste accidents and checks the value against the name.
 * Returns { value, provider, fixes, warnings }. `fixes` describe changes that
 * were applied; `warnings` describe things the person should confirm.
 */
export function inspect(name, raw, { expect } = {}) {
  const fixes = [];
  const warnings = [];
  let value = raw;

  const trimmed = value.trim();
  if (trimmed !== value) {
    value = trimmed;
    fixes.push('removed surrounding whitespace');
  }
  const assign = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/s.exec(value);
  if (assign && assign[1].toUpperCase() === name.toUpperCase()) {
    value = assign[2].trim();
    fixes.push(`you pasted "${assign[1]}=…"; kept only the value`);
  }
  const quoted = /^(["'`])(.*)\1$/s.exec(value);
  if (quoted) {
    value = quoted[2];
    fixes.push('removed surrounding quotes');
  }

  if (!value) {
    return { value, provider: null, fixes, warnings: ['the value is empty'] };
  }
  if (/\s/.test(value)) warnings.push('the value contains spaces or line breaks; keys normally have none');
  if (value.length < 12) warnings.push(`the value is very short (${value.length} characters)`);

  const provider = identify(value);
  const expected = providersForName(name);
  const upper = name.toUpperCase();

  const unrecognised = (shown) => `didn't recognise the format (expected ${shown}); check that this is the right key for ${name}`;

  if (expect) {
    if (!matchesExpectation(expect, value)) warnings.push(unrecognised(expect.shown));
  } else if (provider && expected.length && !expected.includes(provider)) {
    warnings.push(
      `${name} looks like ${article(expected[0].label)} ${expected[0].label} variable, but the value looks like ${article(provider.label)} ${provider.label}`,
    );
  } else if (!provider && expected.length) {
    warnings.push(unrecognised(expected[0].shown));
  }
  if (provider?.id === 'stripe-publishable' && /SECRET/.test(upper)) {
    warnings.push('this is a publishable key (pk_…), but the variable expects a secret key (sk_… or rk_…)');
  }
  if ((provider?.id === 'stripe-secret' || provider?.id === 'stripe-restricted') && /PUBLISHABLE|PUBLIC/.test(upper)) {
    warnings.push('this is a secret key, but the variable looks public; it may end up in browser code');
  }
  if (/^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/.test(upper) && provider && !/publishable/.test(provider.id)) {
    warnings.push(`${name} is exposed to browser code by its prefix; ${article(provider.label)} ${provider.label} should stay on the server`);
  }
  return { value, provider, fixes, warnings };
}
