// The two ways to collect a secret without a terminal prompt: watching the
// clipboard, or a local browser page. Shared by the MCP server and the CLI.
import { startPage } from './page.js';
import { openBrowser } from './open-browser.js';
import { review, commit, summary } from './core.js';
import { watchClipboard, clearClipboardIf } from './clipboard.js';
import { clipboardMatch, providersForName, aKey, lastFour } from './detect.js';
import { notify as desktopNotify } from './notify.js';

export const CLIPBOARD_TIMEOUT_MS = 5 * 60 * 1000;
const CONFIRM_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Asks the person, on a local page, whether to save a value keepkeys picked up
 * from the clipboard. The page address is never given to the agent (only
 * `announce` sees it), so the agent cannot approve on the person's behalf.
 * Resolves to true (save) or false (discard, ignore, timeout, cancel).
 */
export async function confirmViaPage({ name, destinations, ending, chars, warnings }, { signal, announce = () => {} } = {}) {
  const page = await startPage([{ name, destinations: destinations.map((d) => d.label), confirm: { ending, chars, warnings } }], undefined, {
    timeoutMs: CONFIRM_TIMEOUT_MS,
    title: `keepkeys · save ${name}?`,
  });
  const onAbort = () => page.close();
  signal?.addEventListener('abort', onAbort, { once: true });
  announce(page.url, openBrowser(page.url));
  const { results } = await page.done;
  signal?.removeEventListener('abort', onAbort);
  return results[name] === 'confirmed';
}

/**
 * Waits until the person copies the key, then stores it and clears the
 * clipboard.
 * - Only a copy made after the wait starts counts: whatever was already in
 *   the clipboard is ignored, so a request can't silently grab it. Copying the
 *   same text again does count (on Windows and macOS).
 * - A value with the provider prefix the name expects is saved at once.
 *   Anything else that could be a key (an unknown provider, a mismatch, a
 *   warning such as pk_ in a secret variable) is saved only after `confirm`.
 * - `useCurrent: true` (the CLI, after asking in the terminal) takes the
 *   current clipboard value as already confirmed.
 * - `signal` cancels the wait.
 * `log` gets progress messages and `debug` diagnostics; neither ever gets the value.
 * Resolves to { name, status: 'saved' | 'timeout' | 'cancelled' | 'error', … }.
 */
export function collectViaClipboard(
  request,
  {
    check = false,
    timeoutMs = CLIPBOARD_TIMEOUT_MS,
    useCurrent = false,
    confirm = (details) => confirmViaPage(details, { signal }),
    signal,
    log = () => {},
    debug = () => {},
    notify = desktopNotify,
  } = {},
) {
  const { name, destinations } = request;
  const kind = aKey(providersForName(name)[0]?.label);
  const minutes = Math.max(1, Math.round(timeoutMs / 60000));
  const where = request.where ? ` from ${request.where}` : '';
  let lastIgnoredNotice = 0;

  return new Promise((resolve) => {
    let settled = false;
    let busy = false;
    let queued = null; // the latest copy made while busy
    let stop = () => {};
    let timer = null;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      stop();
      resolve(result);
    };
    const onAbort = () => {
      debug(`request for ${name} cancelled`);
      done({ name, status: 'cancelled', hint: String(signal.reason?.message ?? signal.reason ?? 'the request was cancelled') });
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });

    timer = setTimeout(() => {
      notify('keepkeys: nothing received', `No ${name} was copied in ${minutes} min. Ask the agent to try again.`);
      done({
        name,
        status: 'timeout',
        hint:
          `nothing that looks like ${kind} was copied within ${minutes} min, so the copy probably did not register. ` +
          `Ask the user to copy ${name} again, or switch to the browser page to paste it.`,
      });
    }, timeoutMs);

    const take = async (raw, { strong, preconfirmed }) => {
      busy = true;
      try {
        const r = await review(name, raw, { check, expect: request.expect });
        if (settled) return;
        if (r.check?.ok === false) {
          log(`${r.check.detail}; copy the right key and keepkeys will try again`);
          notify('keepkeys: key rejected', `${r.check.detail}. Copy the right ${name}.`);
          return;
        }
        if (!preconfirmed && (!strong || r.warnings.length)) {
          debug(`asking the user to confirm a ${r.value.length}-char value for ${name}`);
          log(`asking the user to confirm the copied value for ${name} in the browser`);
          notify(`keepkeys: confirm ${name}`, `Is the value ending ${lastFour(r.value)} the right key? Answer in the browser page.`);
          const yes = await confirm({ name, destinations, ending: lastFour(r.value), chars: r.value.length, warnings: r.warnings });
          if (settled) return;
          if (!yes) {
            debug(`user did not confirm the value for ${name}`);
            log(`the user did not confirm that value; waiting for another copy of ${name}`);
            notify('keepkeys: not saved', `Copy the right ${name}${where}; keepkeys is still waiting.`);
            return;
          }
        }
        const result = commit(name, r.value, destinations);
        const cleared = clearClipboardIf(raw);
        const notes = [...r.fixes, ...r.warnings, ...result.warnings];
        if (cleared) notes.push('the clipboard was cleared');
        debug(`saved ${name} to ${result.saved.map((x) => x.label).join(', ')}`);
        notify(`Got it ✓ ${name} ${result.ending}`, `Saved to ${result.saved.map((x) => x.label).join(', ')}`);
        done({
          name,
          status: 'saved',
          summary: summary(result),
          warnings: notes,
          hint: `the user saw a "Got it" notification; confirm in chat that ${name} ending in ${result.ending} was received`,
        });
      } catch (err) {
        log(`could not save ${name}: ${err.message}`);
        done({ name, status: 'error', error: err.message });
      } finally {
        busy = false;
        if (!settled && queued !== null) {
          const next = queued;
          queued = null;
          onClip(next, false);
        }
      }
    };

    function onClip(text, initial) {
      if (settled) return;
      if (busy) {
        if (!initial) queued = text;
        return;
      }
      const m = clipboardMatch(name, text, { expect: request.expect });
      // Diagnostics only: lengths and yes/no, never the text itself.
      debug(`clipboard ${initial ? 'at start' : 'changed'}: ${text.length} chars, looks like a key: ${m.ok}, provider prefix matches: ${m.strong}`);
      if (initial) {
        if (useCurrent && m.ok) return void take(text, { strong: m.strong, preconfirmed: true });
        log(`copy ${name} now${where}; waiting up to ${minutes} min. Only a new copy counts, so copy it again if you already did.`);
        notify(`keepkeys: copy ${name}`, `Copy it${where} now (again if you already did). It is picked up automatically.`);
        return;
      }
      if (m.ok) return void take(text, { strong: m.strong, preconfirmed: false });
      if (text.trim()) {
        log(`ignored something copied that does not look like ${kind}`);
        // One notice per few seconds is enough when someone copies several things.
        if (Date.now() - lastIgnoredNotice > 5000) {
          lastIgnoredNotice = Date.now();
          notify('keepkeys: not a key', `That copy didn't look like ${kind} for ${name}. Copy the key again.`);
        }
      }
    }

    debug(`waiting for ${name} in the clipboard`);
    stop = watchClipboard(onClip, { log: (m) => (log(m), debug(m)) });
  });
}

/**
 * `requests`: [{ name, description, where, destinations }] where
 * `destinations` are already-resolved destination objects.
 * `announce(url, opened)` is called once the page is listening. `signal`
 * closes the page.
 * Resolves to [{ name, status: 'saved' | 'skipped' | 'timeout' | 'cancelled', summary?, warnings? }].
 */
export async function collectViaPage(requests, { check = false, timeoutMs, announce = () => {}, signal } = {}) {
  const byName = new Map(requests.map((r) => [r.name, r]));
  const saved = new Map();

  const onSubmit = async (name, raw, force) => {
    const req = byName.get(name);
    const r = await review(name, raw, { check, expect: req.expect });
    if (!r.value) return { ok: false, warnings: ['the value is empty'] };
    if (r.warnings.length && !force) return { ok: false, warnings: r.warnings };
    const result = commit(name, r.value, req.destinations);
    saved.set(name, { result, warnings: [...r.fixes, ...(force ? r.warnings : []), ...result.warnings] });
    return { ok: true, ending: result.ending };
  };

  const title = requests.length === 1 ? `keepkeys · ${requests[0].name}` : `keepkeys · ${requests.length} keys`;
  const page = await startPage(
    requests.map((r) => ({ name: r.name, description: r.description, where: r.where, destinations: r.destinations.map((d) => d.label) })),
    onSubmit,
    { timeoutMs, title },
  );
  const onAbort = () => page.close();
  if (signal?.aborted) onAbort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const opened = openBrowser(page.url);
  announce(page.url, opened);
  const { reason, results } = await page.done;
  signal?.removeEventListener('abort', onAbort);

  return requests.map(({ name }) => {
    const s = saved.get(name);
    if (s) return { name, status: 'saved', summary: summary(s.result), warnings: s.warnings };
    if (results[name] === 'skipped') return { name, status: 'skipped' };
    return { name, status: reason === 'timeout' ? 'timeout' : 'cancelled' };
  });
}
