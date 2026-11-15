// A one-time page on 127.0.0.1 where the person pastes secrets. Used by the
// MCP server and by the CLI when it has no terminal to prompt in (for
// example when an agent runs it). The page never sends a value back out.
import http from 'node:http';
import crypto from 'node:crypto';

const MAX_BODY = 64 * 1024;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function safeLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {}
  return null;
}

function renderPage(items, { token, nonce, title }) {
  const cards = items
    .map((it, i) => {
      const link = safeLink(it.where);
      if (it.confirm) {
        const warnings = it.confirm.warnings?.length
          ? `<div class="warn"><div>Check this:</div><ul>${it.confirm.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
          : '';
        return `
    <section class="card" data-name="${esc(it.name)}" data-mode="confirm">
      <div class="head"><code class="name">${esc(it.name)}</code><span class="state" aria-live="polite"></span></div>
      <p class="dest">keepkeys picked up a value from your clipboard: it ends in <strong>${esc(it.confirm.ending)}</strong> (${Number(it.confirm.chars) || 0} characters).</p>
      ${warnings}
      <p class="dest">Save it to <strong>${esc(it.destinations.join(', '))}</strong>?</p>
      <div class="actions"><button type="button" class="yes primary" autofocus>Save</button><button type="button" class="no">Not this one</button></div>
    </section>`;
      }
      return `
    <section class="card" data-name="${esc(it.name)}">
      <div class="head"><code class="name">${esc(it.name)}</code><span class="state" aria-live="polite"></span></div>
      ${it.description ? `<p class="desc">${esc(it.description)}</p>` : ''}
      ${link ? `<p class="where">Get it here: <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)}</a></p>` : it.where ? `<p class="where">Get it here: ${esc(it.where)}</p>` : ''}
      <p class="dest">Will be saved to <strong>${esc(it.destinations.join(', '))}</strong></p>
      <form autocomplete="off">
        <input type="password" name="v" placeholder="Paste here (Ctrl+V / ⌘V)" spellcheck="false" autocapitalize="off" autocomplete="off" ${i === 0 ? 'autofocus' : ''} aria-label="Value for ${esc(it.name)}">
        <button type="submit">Save</button>
        <button type="button" class="skip">Skip</button>
      </form>
      <div class="warn" hidden></div>
    </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --fg:#14171c; --muted:#5b6472; --line:#dde1e7; --accent:#1f6feb; --ok:#1a7f37; --warn:#9a6700; --warnbg:#fff8c5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --card:#161b22; --fg:#e6edf3; --muted:#9198a1; --line:#30363d; --accent:#4493f8; --ok:#3fb950; --warn:#d29922; --warnbg:#2b2111; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:640px; margin:0 auto; padding:32px 16px 48px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .lead { color:var(--muted); margin:0 0 24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
  .head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .name { font-size:15px; font-weight:600; word-break:break-all; }
  .state { font-size:14px; color:var(--muted); }
  .state.ok { color:var(--ok); }
  .desc, .where, .dest { margin:6px 0; color:var(--muted); font-size:14px; word-break:break-word; }
  a { color:var(--accent); }
  form { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
  input { flex:1 1 240px; min-width:0; font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg); }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  button { font:inherit; padding:8px 14px; border-radius:6px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer; }
  button[type=submit], button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
  .done .actions { display:none; }
  .warn { margin-top:12px; padding:10px 12px; border-radius:6px; background:var(--warnbg); color:var(--fg); font-size:14px; }
  .warn ul { margin:4px 0 8px; padding-left:20px; }
  .done form, .done .warn { display:none; }
  footer { color:var(--muted); font-size:13px; margin-top:24px; }
  #all-done { display:none; font-weight:600; color:var(--ok); }
</style>
</head>
<body>
<main>
  ${
    items.every((it) => it.confirm)
      ? `<h1>Save this key?</h1>
  <p class="lead">keepkeys couldn't tell for sure that what you copied is the right key, so it asks first. Nothing is saved until you click Save. The agent only learns the last 4 characters.</p>`
      : `<h1>Paste your key</h1>
  <p class="lead">Your coding agent asked for ${items.length === 1 ? 'a secret' : 'some secrets'}. Paste below: the value goes straight into the file on this computer. The agent only learns the last 4 characters.</p>`
  }
  ${cards}
  <p id="all-done">All done. You can close this tab.</p>
  <footer>keepkeys · this page only works on this computer (127.0.0.1) and stops after use.</footer>
</main>
<script nonce="${nonce}">
(() => {
  const base = ${JSON.stringify(`/${token}`)};
  const send = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const cards = [...document.querySelectorAll('.card')];
  const checkAll = () => {
    if (cards.every(c => c.classList.contains('done'))) {
      document.getElementById('all-done').style.display = 'block';
      send('/finish', {}).catch(() => {});
    } else {
      const next = cards.find(c => !c.classList.contains('done'));
      const field = next && next.querySelector('input, button.yes');
      field && field.focus();
    }
  };
  for (const card of cards) {
    const name = card.dataset.name;
    const state = card.querySelector('.state');
    if (card.dataset.mode === 'confirm') {
      const answer = async (accept) => {
        try {
          await send('/confirm', { name, accept });
          card.classList.add('done');
          state.className = accept ? 'state ok' : 'state';
          state.textContent = accept ? 'Saved' : 'Discarded. Copy the right key and keepkeys will ask again.';
        } catch (e) {
          state.textContent = 'This page has expired. Ask the agent again.';
        }
        checkAll();
      };
      card.querySelector('.yes').addEventListener('click', () => answer(true));
      card.querySelector('.no').addEventListener('click', () => answer(false));
      continue;
    }
    const input = card.querySelector('input');
    const form = card.querySelector('form');
    const warn = card.querySelector('.warn');
    let busy = false;
    // A password field drops line breaks, so a paste is taken from the
    // clipboard event itself: multi-line keys (PEM, JSON) arrive intact.
    let pasted = null;
    const submit = async (force) => {
      const value = pasted !== null ? pasted : input.value;
      if (busy || !value) return;
      busy = true; state.textContent = 'Saving…';
      try {
        const r = await send('/submit', { name, value, force: !!force });
        if (r.ok) {
          input.value = '';
          pasted = null;
          card.classList.add('done');
          state.className = 'state ok';
          state.textContent = 'Saved · ends in ' + r.ending;
          checkAll();
        } else if (r.warnings) {
          state.textContent = 'Check this';
          warn.hidden = false;
          warn.textContent = '';
          const p = document.createElement('div'); p.textContent = 'Before saving:'; warn.append(p);
          const ul = document.createElement('ul');
          for (const w of r.warnings) { const li = document.createElement('li'); li.textContent = w; ul.append(li); }
          warn.append(ul);
          const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Save anyway';
          b.onclick = () => submit(true);
          const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Paste again';
          again.onclick = () => { input.value = ''; pasted = null; warn.hidden = true; state.textContent = ''; input.focus(); };
          warn.append(b, ' ', again);
        } else {
          state.textContent = r.error || 'Could not save';
        }
      } catch (e) {
        state.textContent = 'This page has expired. Ask the agent again.';
      } finally { busy = false; }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(false); });
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData && e.clipboardData.getData('text');
      if (text) {
        e.preventDefault();
        pasted = text;
        input.value = '•'.repeat(Math.min(text.length, 40));
      }
      setTimeout(() => submit(false), 0);
    });
    input.addEventListener('input', () => { pasted = null; warn.hidden = true; });
    card.querySelector('.skip').addEventListener('click', async () => {
      await send('/skip', { name }).catch(() => {});
      card.classList.add('done'); state.textContent = 'Skipped'; checkAll();
    });
  }
})();
</script>
</body>
</html>`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('bad json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Starts the page. `items`: [{ name, description, where, destinations: [labels] }].
 * An item with `confirm: { ending, chars, warnings }` asks the person to
 * approve a value keepkeys already has, instead of asking them to paste one.
 * `onSubmit(name, value, force)` must resolve to { ok: true, ending } or
 * { ok: false, warnings } or { ok: false, error }.
 * Returns { url, done, close }. `done` resolves to { reason: 'finished' |
 * 'timeout' | 'closed', results: { [name]: 'saved' | 'skipped' | 'confirmed' | 'declined' } }.
 */
export async function startPage(items, onSubmit = async () => ({ ok: false }), { timeoutMs = 10 * 60 * 1000, title = 'keepkeys' } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  const results = {};
  const names = new Set(items.map((i) => i.name));
  const confirmNames = new Set(items.filter((i) => i.confirm).map((i) => i.name));
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let port;

  const server = http.createServer(async (req, res) => {
    const reply = (status, body, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        ...extra,
      });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    // Only this exact origin may talk to us: blocks DNS rebinding and other
    // local web pages.
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { error: 'forbidden' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === 'GET' && url.pathname === `/${token}`) {
      const nonce = crypto.randomBytes(16).toString('base64');
      return reply(200, renderPage(items, { token, nonce, title }), 'text/html; charset=utf-8', {
        'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
        'x-frame-options': 'DENY',
      });
    }
    if (req.method !== 'POST' || !url.pathname.startsWith(`/${token}/`)) return reply(404, { error: 'not found' });
    if (req.headers.origin !== `http://127.0.0.1:${port}`) return reply(403, { error: 'forbidden' });
    if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) return reply(415, { error: 'json only' });

    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return reply(err.status ?? 400, { error: err.message });
    }
    const action = url.pathname.slice(token.length + 2);
    if (action === 'finish') {
      reply(200, { ok: true });
      return finish('finished');
    }
    if (!names.has(body.name)) return reply(400, { error: 'unknown name' });
    if (action === 'skip') {
      results[body.name] ??= 'skipped';
      reply(200, { ok: true });
      return maybeFinish();
    }
    if (action === 'confirm') {
      if (!confirmNames.has(body.name)) return reply(400, { error: 'nothing to confirm' });
      results[body.name] ??= body.accept === true ? 'confirmed' : 'declined';
      reply(200, { ok: true });
      return maybeFinish();
    }
    if (action === 'submit') {
      if (confirmNames.has(body.name)) return reply(400, { error: 'confirm only' });
      if (typeof body.value !== 'string' || !body.value) return reply(400, { error: 'empty value' });
      try {
        const r = await onSubmit(body.name, body.value, Boolean(body.force));
        if (r.ok) results[body.name] = 'saved';
        reply(200, r);
        return maybeFinish();
      } catch (err) {
        return reply(200, { ok: false, error: err.message });
      }
    }
    return reply(404, { error: 'not found' });
  });

  let timer;
  let finished = false;
  function finish(reason) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    // Give the browser a moment to receive the last response.
    setTimeout(() => server.close(), 200).unref();
    server.closeIdleConnections?.();
    resolveDone({ reason, results: { ...results } });
  }
  function maybeFinish() {
    if ([...names].every((n) => results[n])) finish('finished');
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
  timer = setTimeout(() => finish('timeout'), timeoutMs);
  timer.unref?.();

  return { url: `http://127.0.0.1:${port}/${token}`, done, close: () => finish('closed') };
}
