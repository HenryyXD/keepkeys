import path from 'node:path';
import { parseArgs } from 'node:util';
import { KeepKeysError, EXIT } from './errors.js';
import { loadManifest, defaultDestination } from './manifest.js';
import { resolveDestinations } from './destinations/index.js';
import { review, commit, summary } from './core.js';
import { readHidden, readStdin, confirm } from './prompt.js';
import { readClipboard, clipboardAvailable } from './clipboard.js';
import { isHeadless, isRemoteSession, handoffCommand } from './env.js';
import { mayShowConfirmUrl } from './open-browser.js';
import { collectViaPage, collectViaClipboard, confirmViaPage } from './handoff.js';
import { suggestWhere, clipboardMatch, lastFour } from './detect.js';
import { validateName } from './paths.js';
import { color, out, err, warn } from './ui.js';

import { VERSION } from './version.js';

const HELP = `keepkeys ${VERSION}: Keys Excluded from Every Prompt
Put API keys into your project's env files without pasting them into an AI chat.

Usage
  keepkeys                       show what the project needs and ask for each missing key
  keepkeys add NAME [options]    store one key
  keepkeys list [--json]         show which keys are set (never shows values)
  keepkeys setup [claude|cursor] register the MCP server with your agents
  keepkeys mcp                   run the MCP server (agents start this for you)

Options for add
  --to a,b          destinations: env files and/or env:user (default: from the manifest, else .env.local)
  --where URL       where to get the key, shown while asking
  --description T   what the key is for, shown while asking
  --clipboard       take the key from the clipboard: just copy it (default for an agent on a desktop)
  --browser         ask in a local browser page instead (over SSH: through an ssh -L tunnel)
  --stdin           read the key from standard input
  --timeout SEC     how long to wait for the key (clipboard: 300, browser: 600)
  --check           make one read-only call to the provider to confirm the key works
  --yes             store even if the key looks wrong

General
  --root DIR        project directory (default: current directory)
  --json            machine-readable output (list)
  -h, --help        show this help
  -v, --version     show the version

Where keepkeys asks
  In a terminal it asks with a hidden prompt (also over SSH). Without one (an
  agent's shell) it watches the clipboard on a desktop; on a server or over
  SSH it prints the one command the person should run in their terminal.

Examples
  npx keepkeys                   in your terminal: ask for every key .env.example lists
  npx keepkeys add STRIPE_SECRET_KEY --to .env.local,server/.dev.vars
  npx keepkeys add OPENROUTER_API_KEY --to env:user
  npx keepkeys setup`;

const OPTIONS = {
  to: { type: 'string' },
  where: { type: 'string' },
  description: { type: 'string' },
  clipboard: { type: 'boolean' },
  stdin: { type: 'boolean' },
  browser: { type: 'boolean' },
  check: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  root: { type: 'string' },
  json: { type: 'boolean' },
  'allow-env-user': { type: 'boolean' },
  'allow-any-file': { type: 'boolean' },
  timeout: { type: 'string' },
  project: { type: 'boolean' },
  print: { type: 'boolean' },
  remove: { type: 'boolean' },
  rules: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

function parse(argv) {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    throw new KeepKeysError(`${e.message}\nRun "keepkeys --help" for usage.`, EXIT.USAGE);
  }
}

const splitList = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function timeoutMs(values) {
  if (!values.timeout) return undefined;
  const s = Number(values.timeout);
  if (!Number.isFinite(s) || s <= 0) throw new KeepKeysError('--timeout must be a number of seconds', EXIT.USAGE);
  return s * 1000;
}

export async function main(argv) {
  const { values, positionals } = parse(argv);
  if (values.version) {
    out(VERSION);
    return EXIT.OK;
  }
  const [cmd = 'fill', ...rest] = positionals;
  if (values.help || cmd === 'help') {
    out(HELP);
    return EXIT.OK;
  }
  const root = path.resolve(values.root ?? process.cwd());

  switch (cmd) {
    case 'fill':
      return fill(root, values);
    case 'add':
      if (rest.length !== 1) throw new KeepKeysError('usage: keepkeys add NAME [--to file,...]', EXIT.USAGE);
      return add(root, rest[0], values);
    case 'list':
    case 'status':
      return list(root, values);
    case 'mcp': {
      const { runServer } = await import('./mcp/server.js');
      return runServer({ root: values.root ?? null, allowEnvUser: Boolean(values['allow-env-user']) });
    }
    case 'setup': {
      const { setup } = await import('./setup.js');
      return setup({ targets: rest, root, ...values });
    }
    default:
      throw new KeepKeysError(`unknown command "${cmd}"\nRun "keepkeys --help" for usage.`, EXIT.USAGE);
  }
}

// ---------------------------------------------------------------- status

function keyStatus(key, root, values) {
  let dests;
  try {
    dests = resolveDestinations(key.to, root, { allowAnyFile: values['allow-any-file'] });
  } catch (e) {
    return { ...key, status: 'error', error: e.message, destinations: [] };
  }
  const destinations = dests.map((d) => ({ label: d.label, present: d.has(key.name) }));
  const n = destinations.filter((d) => d.present).length;
  const status = n === destinations.length ? 'ok' : n === 0 ? 'missing' : 'partial';
  return { ...key, status, destinations, resolved: dests };
}

function printStatus(statuses) {
  const width = Math.max(...statuses.map((s) => s.name.length));
  for (const s of statuses) {
    const tag =
      s.status === 'ok' ? color.green('[ok]     ') :
      s.status === 'partial' ? color.yellow('[partial]') :
      s.status === 'error' ? color.red('[error]  ') :
      s.optional ? color.dim('[unset]  ') : color.red('[MISSING]');
    const where = s.status === 'error' ? s.error : s.destinations.map((d) => (d.present ? d.label : color.dim(d.label))).join(', ');
    out(`  ${tag} ${s.name.padEnd(width)}  ${where}`);
  }
}

function list(root, values) {
  const manifest = loadManifest(root);
  const statuses = manifest.keys.map((k) => keyStatus(k, root, values));
  if (values.json) {
    out(JSON.stringify({
      source: manifest.source,
      problems: manifest.problems,
      keys: statuses.map(({ resolved, ...s }) => s),
    }, null, 2));
    return EXIT.OK;
  }
  if (!manifest.source) {
    err('No manifest found. Add the key names to .env.example or keepkeys.json, or use "keepkeys add NAME".');
    return EXIT.OK;
  }
  err(color.dim(`From ${manifest.source}:`));
  for (const p of manifest.problems) warn(p);
  printStatus(statuses);
  return statuses.some((s) => s.status !== 'ok' && !s.optional) ? EXIT.ERROR : EXIT.OK;
}

// ---------------------------------------------------------------- add

function describe(name, dests, where, description) {
  err('');
  err(`${color.bold(name)}  → ${dests.map((d) => d.label).join(', ')}`);
  if (description) err(`  ${description}`);
  if (where) err(`  Get it here: ${where}`);
}

function readClipboardSafe() {
  try {
    return readClipboard();
  } catch {
    return null;
  }
}

async function obtain(values) {
  if (values.stdin) return readStdin();
  return readHidden('  Paste (hidden): ', { onCtrlV: readClipboardSafe });
}

// How to get the value: an explicit flag wins; a terminal gets the hidden
// prompt; without one (an agent's shell) keepkeys watches the clipboard on a
// desktop, or opens the browser page when the clipboard can't be read. On a
// server or over SSH nobody can copy or open a page here, so keepkeys prints
// the command for the person to run in their own terminal ('handoff').
function chooseMode(values) {
  if (values.stdin) return 'stdin';
  if (values.browser) return 'browser';
  // An agent's shell on a server or over SSH: nobody here can answer a
  // clipboard request (or confirm it), even when a clipboard is readable.
  if (!process.stdin.isTTY && isHeadless()) return 'handoff';
  if (values.clipboard) {
    if (!clipboardAvailable()) {
      throw new KeepKeysError(
        isHeadless()
          ? 'there is no clipboard to read on this machine (no display, or an SSH session). Run keepkeys in a terminal instead: it asks with a hidden prompt.'
          : 'could not read the clipboard: install wl-clipboard (Wayland), xclip or xsel, or leave out --clipboard to paste into a hidden prompt',
      );
    }
    return 'clipboard';
  }
  if (process.stdin.isTTY) return 'prompt';
  if (isHeadless()) return 'handoff';
  return clipboardAvailable() ? 'clipboard' : 'browser';
}

/**
 * Prints the one command the person should run in their own terminal, for an
 * agent (no terminal) on a server or over SSH. The command never contains a
 * secret. stdout gets the bare command so an agent can pass it on verbatim.
 */
// Flags the person's own run needs too.
const passOn = (values) => [...(values.check ? ['--check'] : []), ...(values['allow-any-file'] ? ['--allow-any-file'] : [])];

function handoff(root, args, names) {
  const cmd = handoffCommand(root, args);
  const what = names.length === 1 ? names[0] : `${names.length} keys (${names.join(', ')})`;
  err(`keepkeys: nobody can copy or open a page on this machine from here (${isRemoteSession() ? 'an SSH session' : 'no display'}).`);
  err(`keepkeys: to hand over ${what}, the person runs this in their own terminal on this machine (over SSH is fine).`);
  err('keepkeys: it asks with a hidden prompt; the value never appears on screen, in the shell history or here:');
  out(cmd);
  err(`keepkeys: afterwards, check with: ${handoffCommand(root, ['list'])}`);
  return EXIT.HANDOFF;
}

const logLine = (m) => err(`keepkeys: ${m}`);

// The confirm page's address is kept from stdout/stderr, which an agent
// reads, so the agent cannot approve a value itself (only the test suite can
// opt in to seeing it).
function announceConfirm(url, opened) {
  if (opened) err('keepkeys: please confirm the copied value in the browser page that just opened');
  else if (mayShowConfirmUrl()) err(`keepkeys: open ${url} to confirm the copied value`);
}

async function confirmInTerminal({ destinations, ending, chars, warnings }) {
  for (const w of warnings) warn(w);
  return confirm(`  Save the copied value ending ${ending} (${chars} characters) to ${destinations.map((d) => d.label).join(', ')}?`);
}

async function viaClipboard(request, values) {
  const tty = Boolean(process.stdin.isTTY);
  let useCurrent = false;
  if (tty) {
    // Someone running keepkeys in their own terminal may have copied the key
    // already: offer to use it, since they are there to answer.
    const m = clipboardMatch(request.name, readClipboardSafe());
    if (m.ok) useCurrent = await confirm(`  Use the key already in your clipboard (ends ${lastFour(m.value)})?`);
  }
  return collectViaClipboard(request, {
    check: values.check,
    timeoutMs: timeoutMs(values),
    useCurrent,
    confirm: tty ? confirmInTerminal : (details) => confirmViaPage(details, { announce: announceConfirm }),
    log: logLine,
  });
}

async function store(name, raw, dests, values, interactive) {
  const r = await review(name, raw, { check: values.check });
  if (!r.value) throw new KeepKeysError('nothing was pasted', EXIT.CANCELLED);
  for (const f of r.fixes) err(color.dim(`  · ${f}`));
  if (r.check?.ok) err(color.dim(`  · ${r.check.detail}`));
  else if (r.check && r.check.ok === null) warn(r.check.detail);
  if (r.warnings.length) {
    for (const w of r.warnings) warn(w);
    if (!values.yes) {
      if (!interactive) throw new KeepKeysError('not saved; check the warnings above, or pass --yes to save anyway');
      if (!(await confirm('  Save anyway?'))) throw new KeepKeysError('not saved', EXIT.CANCELLED);
    }
  }
  const result = commit(name, r.value, dests);
  for (const w of result.warnings) warn(w);
  out(summary(result));
  return r.value;
}

function resolveFor(root, name, values) {
  const manifest = loadManifest(root);
  const entry = manifest.keys.find((k) => k.name === name);
  const specs = values.to ? splitList(values.to) : entry?.to ?? [defaultDestination(root)];
  const dests = resolveDestinations(specs, root, { allowAnyFile: values['allow-any-file'] });
  return {
    dests,
    where: values.where ?? entry?.where ?? suggestWhere(name),
    description: values.description ?? entry?.description ?? null,
  };
}

async function add(root, name, values) {
  validateName(name);
  const { dests, where, description } = resolveFor(root, name, values);
  const request = { name, description, where, destinations: dests };
  const mode = chooseMode(values);
  if (mode === 'handoff') {
    const args = ['add', name];
    if (values.to) args.push('--to', values.to);
    return handoff(root, [...args, ...passOn(values)], [name]);
  }

  if (mode === 'browser') {
    const results = await collectViaPage([request], { check: values.check, timeoutMs: timeoutMs(values), announce: announcePage });
    return report(results);
  }
  describe(name, dests, where, description);
  if (mode === 'clipboard') return report([await viaClipboard(request, values)]);
  const raw = await obtain(values);
  await store(name, raw, dests, values, mode === 'prompt');
  return EXIT.OK;
}

function announcePage(url, opened) {
  if (opened) err(`keepkeys: opened a page in your browser to paste the key: ${url}`);
  else if (isHeadless()) {
    const { port, pathname } = new URL(url);
    err('keepkeys: the page runs on this machine. From your own computer, open a tunnel first:');
    err(`keepkeys:   ssh -N -L ${port}:127.0.0.1:${port} <this server>`);
    err(`keepkeys: then open http://localhost:${port}${pathname}`);
  } else err(`keepkeys: open this page to paste the key: ${url}`);
  err('keepkeys: waiting for you to paste…');
}

function report(results) {
  let code = EXIT.OK;
  for (const r of results) {
    if (r.status === 'saved') {
      for (const w of r.warnings) warn(w);
      out(r.summary);
    } else {
      const why = r.error ?? r.hint;
      out(`${r.status}: ${r.name} was not saved${why ? `; ${why}` : ''}`);
      if (r.status === 'error') code = EXIT.ERROR;
      else if (r.status !== 'skipped') code = EXIT.CANCELLED;
    }
  }
  return code;
}

// ---------------------------------------------------------------- fill

async function fill(root, values) {
  const manifest = loadManifest(root);
  if (!manifest.source) {
    err('No manifest found here.');
    err('List the key names in .env.example (or keepkeys.json), or store one directly:');
    err('  keepkeys add NAME --to .env.local');
    return EXIT.USAGE;
  }
  const statuses = manifest.keys.map((k) => keyStatus(k, root, values));
  err(color.dim(`From ${manifest.source}:`));
  for (const p of manifest.problems) warn(p);
  printStatus(statuses);
  const todo = statuses.filter((s) => s.status === 'missing' || s.status === 'partial');
  if (!todo.length) {
    err(color.green('Everything is set.'));
    return EXIT.OK;
  }

  // Several keys at once without a terminal: one page for all of them, unless
  // --clipboard asks to copy them one by one. On a server or over SSH: the
  // command for the person's own terminal.
  const tty = Boolean(process.stdin.isTTY);
  const mode = values.browser ? 'browser' : !tty && isHeadless() ? 'handoff' : values.clipboard ? 'clipboard' : tty ? 'prompt' : 'browser';
  if (mode === 'handoff') return handoff(root, passOn(values), todo.map((s) => s.name));
  if (mode === 'clipboard' && !clipboardAvailable()) chooseMode({ clipboard: true });
  if (mode === 'browser') {
    const results = await collectViaPage(
      todo.map((s) => ({ name: s.name, description: s.description, where: s.where, destinations: s.resolved })),
      { check: values.check, timeoutMs: timeoutMs(values), announce: announcePage },
    );
    return report(results);
  }
  if (mode === 'clipboard') {
    const results = [];
    for (const s of todo) {
      describe(s.name, s.resolved, s.where, s.description);
      results.push(await viaClipboard({ name: s.name, where: s.where, destinations: s.resolved }, values));
    }
    return report(results);
  }

  err(color.dim('\nPress Enter on an empty line to skip a key, Ctrl+C to stop.'));
  for (const s of todo) {
    describe(s.name, s.resolved, s.where, s.description);
    const raw = await obtain(values);
    if (!raw.trim()) {
      err(color.dim('  · skipped'));
      continue;
    }
    try {
      await store(s.name, raw, s.resolved, values, true);
    } catch (e) {
      if (e.exitCode !== EXIT.CANCELLED || e.interrupted) throw e;
      err(color.dim(`  · ${e.message}`));
    }
  }
  return EXIT.OK;
}
