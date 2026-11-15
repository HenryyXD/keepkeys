// Optional live validation (--check): one cheap, read-only request per
// provider. The key always travels in a header, never in the URL.

const CHECKS = {
  anthropic: (k) => ['https://api.anthropic.com/v1/models', { 'x-api-key': k, 'anthropic-version': '2023-06-01' }],
  openai: (k) => ['https://api.openai.com/v1/models', { authorization: `Bearer ${k}` }],
  openrouter: (k) => ['https://openrouter.ai/api/v1/key', { authorization: `Bearer ${k}` }],
  'stripe-secret': (k) => ['https://api.stripe.com/v1/balance', { authorization: `Bearer ${k}` }],
  'stripe-restricted': (k) => ['https://api.stripe.com/v1/balance', { authorization: `Bearer ${k}` }],
  github: (k) => ['https://api.github.com/user', { authorization: `Bearer ${k}`, 'user-agent': 'keepkeys' }],
  groq: (k) => ['https://api.groq.com/openai/v1/models', { authorization: `Bearer ${k}` }],
  google: (k) => ['https://generativelanguage.googleapis.com/v1beta/models', { 'x-goog-api-key': k }],
  huggingface: (k) => ['https://huggingface.co/api/whoami-v2', { authorization: `Bearer ${k}` }],
};

export function canCheck(provider) {
  return Boolean(provider && CHECKS[provider.id]);
}

/** Returns { ok: true | false | null, detail }. `null` means "could not tell". */
export async function checkKey(provider, value, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!canCheck(provider)) return { ok: null, detail: 'no live check for this provider' };
  const [url, headers] = CHECKS[provider.id](value);
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return { ok: true, detail: `${provider.label} accepted the key` };
    if (res.status === 401) return { ok: false, detail: `${provider.label} rejected the key (401)` };
    if (res.status === 403) return { ok: true, detail: `${provider.label} recognised the key, but it lacks permission for the check (403)` };
    return { ok: null, detail: `${provider.label} answered ${res.status}; could not confirm the key` };
  } catch (err) {
    return { ok: null, detail: `could not reach ${provider.label}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}` };
  }
}
