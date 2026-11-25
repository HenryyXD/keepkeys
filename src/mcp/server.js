// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0), written
// without the SDK to keep keepkeys dependency-free. stdout carries protocol
// messages only; everything human-readable goes to stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadManifest, defaultDestination } from '../manifest.js';
import { resolveDestinations } from '../destinations/index.js';
import { collectViaPage, collectViaClipboard, confirmViaPage } from '../handoff.js';
import { clipboardAvailable } from '../clipboard.js';
import { suggestWhere, normalizeExpectation } from '../detect.js';
import { validateName } from '../paths.js';
import { isHeadless, isRemoteSession, handoffCommand } from '../env.js';
import { mayShowConfirmUrl } from '../open-browser.js';

import { VERSION } from '../version.js';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `keepkeys stores API keys and other secrets in the project's env files without the value ever passing through this conversation.
- When the project needs a secret, call request_secret. Never ask the user to paste a secret into the chat, and never echo, log or read back secret values.
- If the user pastes a secret into the chat anyway, tell them to rotate it, then use request_secret to store the new one.
- Do not read env files (.env, .env.*, .dev.vars) to check values; call secrets_status instead.
- By default keepkeys takes the key from the clipboard. Before calling request_secret, tell the user in one line: "When the keepkeys notification appears, copy your <NAME> from <where to get it> (copy it again if you already did); I'll pick it up from the clipboard." Only a copy made after the request starts counts.
- If keepkeys can't tell for sure that the copy is the right key (unknown format, different prefix), a browser page asks the user to confirm before anything is saved. You can't confirm for them.
- You only get a confirmation with the last 4 characters. After it, tell the user it was received (ending …xxxx) so they know the copy worked. On a timeout, the copy did not register: ask them to copy again, or call request_secret with method "browser" so they can paste into a page.
- If you know the key's format, pass expected_prefixes (e.g. ["sk-ant-"] for Anthropic, ["sk_live_", "sk_test_"] for Stripe) or expected_pattern. Without them keepkeys guesses from the variable name and only warns when unsure; a format warning is not proof the key is wrong.
- On a server or over SSH (no display) nobody can copy a key or open a page on this machine. Then request_secret and request_missing_secrets return at once with a command instead: give the user that exact command to run in their own terminal (an SSH session to this machine is fine; the key is typed into a hidden prompt), wait until they say it is done, then call secrets_status. Never ask them to paste the key into the chat instead.
- Ask for one secret at a time: a new request replaces one that is still waiting.
- To double-check later, call secrets_status.`;

const TOOLS = [
  {
    name: 'request_secret',
    title: 'Ask the user for a secret',
    description:
      'Get a secret (API key, token, password) from the user without it passing through this chat, and write it to the given env files. ' +
      'method "clipboard" (default): the user copies the key (e.g. clicks Copy in the provider dashboard) after the request starts and keepkeys picks it up; tell the user what to copy BEFORE calling. Unrecognised values are confirmed by the user in a browser page first. ' +
      'method "browser": a page opens on their computer for them to paste into. ' +
      'On a server or over SSH (no display) it returns at once with a command for the user to run in their own terminal; pass that on verbatim, then call secrets_status. ' +
      'If you know the key\'s format, pass expected_prefixes (e.g. ["sk-ant-"] for Anthropic, ["sk_live_", "sk_test_"] for Stripe) or expected_pattern; they only sharpen the warning shown to the user and never skip their confirmation. ' +
      'You never see the value: the result only says where it was saved and its last 4 characters. ' +
      'Blocks until the key arrives or the wait ends (clipboard 5 min, browser 10 min).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Environment variable name, e.g. STRIPE_SECRET_KEY' },
        destinations: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Files relative to the project root, e.g. [".env.local", "server/.dev.vars"]. Only env files are allowed. ' +
            'Defaults to the project manifest (.env.example / keepkeys.json), else .env.local.',
        },
        where_to_get: { type: 'string', description: 'URL or short instructions for where the user can create or copy this key' },
        description: { type: 'string', description: 'One sentence on what the key is for' },
        expected_prefixes: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description:
            'Optional. Prefixes a valid key starts with, if you know them, e.g. ["sk-ant-"] for Anthropic or ["sk_live_", "sk_test_", "rk_live_", "rk_test_"] for Stripe. Used instead of the built-in prefix guess for this variable name (a value that clearly belongs to another known provider is still flagged). Visible ASCII only, no spaces. Only used to warn the user; it never skips their confirmation.',
        },
        expected_pattern: {
          type: 'string',
          description: 'Optional. A JavaScript regex a valid key matches, e.g. "^re_[A-Za-z0-9_]{20,}$" for Resend. Visible ASCII only, no spaces (use \\s). Use instead of or together with expected_prefixes.',
        },
        method: {
          type: 'string',
          enum: ['clipboard', 'browser'],
          description: 'clipboard (default): the user just copies the key. browser: the user pastes it into a local page. Use browser after a clipboard timeout.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'request_missing_secrets',
    title: 'Ask for every missing secret',
    description:
      "Ask the user, on one local page, for every key listed in the project's manifest (.env.example or keepkeys.json) that is not set yet. " +
      'Returns which were saved; never returns values.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'secrets_status',
    title: 'Which secrets are set',
    description: "List the keys from the project's manifest and whether each destination has a value. Never returns values.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

class ToolError extends Error {}

export function runServer({ root = null, allowEnvUser = false, input = process.stdin, output = process.stdout, log = (s) => process.stderr.write(`keepkeys: ${s}\n`) } = {}) {
  let clientCaps = {};
  // The first clipboard save of a session is always confirmed on the local
  // page (name, ending and destination), even for a matching provider prefix:
  // any process can write to the clipboard, and the agent picks the destination.
  const trust = { confirmed: false };
  let rootsPromise = null;
  let nextId = 1;
  const pending = new Map();

  const send = (msg) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  const notify = (method, params) => send({ method, params });
  const request = (method, params, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
      const id = `kk-${nextId++}`;
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, (msg) => {
        clearTimeout(t);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      });
      send({ id, method, params });
    });

  // Cursor sometimes passes "${workspaceFolder}" through without expanding it.
  if (root && /\$\{[^}]*\}/.test(root)) {
    log(`ignoring --root ${root} (not expanded by the client)`);
    root = null;
  }

  // Project root: --root, else the client's first workspace root, else cwd.
  async function projectRoot() {
    if (root) return root;
    if (clientCaps.roots) {
      rootsPromise ??= request('roots/list', {})
        .then((r) => {
          const first = r?.roots?.find((x) => x.uri?.startsWith('file:'));
          return first ? fileURLToPath(first.uri) : null;
        })
        .catch(() => null);
      const fromClient = await rootsPromise;
      if (fromClient) return fromClient;
    }
    return process.cwd();
  }

  // A small diagnostic log (no secret values) so a stuck request can be
  // explained afterwards: ~/.keepkeys/mcp.log (a private 0700 folder, not a
  // predictable path in a shared temp dir). The file is 0600 and starts over
  // past 256 KB.
  const diagFile = process.env.KEEPKEYS_DIAG_LOG ?? path.join(os.homedir(), '.keepkeys', 'mcp.log');
  function diag(text) {
    try {
      fs.mkdirSync(path.dirname(diagFile), { recursive: true, mode: 0o700 });
      if (fs.statSync(diagFile, { throwIfNoEntry: false })?.size > 256 * 1024) fs.writeFileSync(diagFile, '');
      fs.appendFileSync(diagFile, `${new Date().toISOString()} [${process.pid}] ${text}\n`, { mode: 0o600 });
      if (process.platform !== 'win32') fs.chmodSync(diagFile, 0o600);
    } catch {}
  }

  function info(text) {
    log(text);
    notify('notifications/message', { level: 'info', logger: 'keepkeys', data: text });
  }

  // The page address goes to the log only, never to the agent: anyone who has it
  // can fill the page in. Over SSH the agent is only told that a port must be
  // forwarded; the user finds the address in the terminal/log.
  const announce = (url, opened) => {
    log(opened ? `opened ${url} in the browser for the user to paste into` : `open ${url} to paste the key`);
    if (!opened && isHeadless()) {
      const { port } = new URL(url);
      info(`the paste page runs on this machine (no browser here): ask the user to forward port ${port} (ssh -N -L ${port}:127.0.0.1:${port} <this server>) and open the address keepkeys shows in its terminal output`);
    }
  };

  function describeResults(results, base) {
    const lines = results.map((r) => {
      const next = r.hint ? `\nNext: ${r.hint}.` : '';
      if (r.status === 'saved') return r.summary + (r.warnings.length ? ` (notes: ${r.warnings.join('; ')})` : '') + next;
      if (r.status === 'skipped') return `skipped: the user chose not to provide ${r.name}`;
      if (r.status === 'timeout') return `timeout: ${r.name} was not provided within the time limit${next}`;
      if (r.status === 'error') return `error: ${r.name} was not saved: ${r.error}`;
      return `cancelled: ${r.name} was not provided${r.hint ? ` (${r.hint})` : ''}`;
    });
    if (results.some((r) => r.status === 'saved')) {
      lines.push(`Project: ${base}. The value is on disk; do not read the file to look at it.`);
    }
    return lines.join('\n');
  }

  // Requests that wait for the user. Only one waits at a time: an agent that
  // retries (or asks for another key) replaces the older wait instead of
  // leaving several clipboard watchers running.
  const inflight = new Map(); // JSON-RPC id -> { controller, cancelledByClient }
  let waiting = null;
  function startWaiting(ctx) {
    if (waiting && waiting !== ctx.controller) waiting.abort(new Error('replaced by a newer keepkeys request'));
    waiting = ctx.controller;
    return ctx.controller.signal;
  }

  // No one can copy or open a page on this machine: hand the agent the one
  // command the person runs in their own terminal. It never holds a value.
  function handoffText(base, args, names) {
    const cmd = handoffCommand(base, args);
    const why = isRemoteSession() ? 'this is an SSH session' : 'this machine has no display';
    diag(`handoff for ${names.join(', ')}: ${why}`);
    return [
      `not saved yet: ${why}, so nobody can copy ${names.join(', ')} or open a page here.`,
      'Ask the user to run this command in their own terminal on this machine (an SSH session is fine). It asks with a hidden prompt; the value never shows on screen, in shell history or in this chat:',
      '',
      `    ${cmd}`,
      '',
      `Tell them, in one line: "Run this in your terminal and paste ${names.length === 1 ? 'the key' : 'each key'} when it asks (it stays hidden): ${cmd}".`,
      'When they say it is done, call secrets_status to confirm. Do not ask them to paste the key into the chat.',
    ].join('\n');
  }

  async function callTool(name, args, ctx = { controller: new AbortController() }) {
    const base = await projectRoot();
    if (name === 'secrets_status') {
      const manifest = loadManifest(base);
      if (!manifest.source) return `No manifest (.env.example or keepkeys.json) in ${base}.`;
      const rows = manifest.keys.map((k) => {
        try {
          const ds = resolveDestinations(k.to, base, { allowEnvUser });
          const parts = ds.map((d) => `${d.label}: ${d.has(k.name) ? 'set' : 'missing'}`);
          return `${k.name}${k.optional ? ' (optional)' : ''}: ${parts.join(', ')}`;
        } catch (e) {
          return `${k.name}: ${e.message}`;
        }
      });
      return `From ${manifest.source} in ${base}:\n${rows.join('\n')}`;
    }

    if (name === 'request_secret') {
      const keyName = String(args?.name ?? '');
      try {
        validateName(keyName);
      } catch (e) {
        throw new ToolError(e.message);
      }
      const entry = loadManifest(base).keys.find((k) => k.name === keyName);
      const specs = Array.isArray(args?.destinations) && args.destinations.length ? args.destinations : entry?.to ?? [defaultDestination(base)];
      let dests;
      try {
        dests = resolveDestinations(specs, base, { allowEnvUser });
      } catch (e) {
        throw new ToolError(e.message);
      }
      let expect;
      try {
        expect = normalizeExpectation({ prefixes: args?.expected_prefixes, pattern: args?.expected_pattern });
      } catch (e) {
        throw new ToolError(e.message);
      }
      const request = {
        name: keyName,
        expect,
        destinations: dests,
        where: args?.where_to_get || entry?.where || suggestWhere(keyName),
        description: args?.description || entry?.description || null,
      };
      let method = args?.method === 'browser' ? 'browser' : 'clipboard';
      if (method === 'clipboard' && isHeadless()) {
        const cli = ['add', keyName];
        if (Array.isArray(args?.destinations) && args.destinations.length) cli.push('--to', dests.map((d) => d.label).join(','));
        return handoffText(base, cli, [keyName]);
      }
      if (method === 'clipboard' && !clipboardAvailable()) {
        info('the clipboard cannot be read here; using the browser page instead');
        method = 'browser';
      }
      // No progress notifications while waiting: Claude Code treats them as a
      // protocol error and drops the connection.
      diag(`request_secret ${keyName} via ${method} in ${base}`);
      const signal = startWaiting(ctx);
      // The confirm page's address goes to stderr only, never to the agent
      // (info() would send it), so the agent cannot approve a value itself.
      const confirm = (details) =>
        confirmViaPage(details, {
          signal,
          announce: (url, opened) => (opened ? log('asked the user to confirm the copied value in the browser') : mayShowConfirmUrl() && log(`open ${url} to confirm the copied value`)),
        });
      const results =
        method === 'clipboard'
          ? [await collectViaClipboard(request, { log: info, debug: diag, confirm, signal, trust })]
          : await collectViaPage([request], { announce, signal });
      diag(`request_secret ${keyName}: ${results[0].status}`);
      const text = describeResults(results, base);
      if (results[0].status !== 'saved') throw new ToolError(text);
      return text;
    }

    if (name === 'request_missing_secrets') {
      const manifest = loadManifest(base);
      if (!manifest.source) throw new ToolError(`No manifest (.env.example or keepkeys.json) in ${base}; use request_secret instead.`);
      const todo = [];
      for (const k of manifest.keys) {
        const ds = resolveDestinations(k.to, base, { allowEnvUser });
        if (!ds.every((d) => d.has(k.name))) todo.push({ name: k.name, destinations: ds, where: k.where, description: k.description });
      }
      if (!todo.length) return 'Every key in the manifest is already set.';
      if (isHeadless()) return handoffText(base, [], todo.map((t) => t.name));
      const results = await collectViaPage(todo, { announce, signal: startWaiting(ctx) });
      return describeResults(results, base);
    }

    throw new ToolError(`unknown tool ${name}`);
  }

  async function handle(msg) {
    if (msg.id !== undefined && msg.method === undefined) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
      return;
    }
    const { id, method, params } = msg;
    const isRequest = id !== undefined && id !== null;
    try {
      let result;
      switch (method) {
        case 'initialize': {
          clientCaps = params?.capabilities ?? {};
          const v = PROTOCOL_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0];
          result = {
            protocolVersion: v,
            capabilities: { tools: { listChanged: false }, logging: {} },
            serverInfo: { name: 'keepkeys', title: 'keepkeys', version: VERSION },
            instructions: INSTRUCTIONS,
          };
          break;
        }
        case 'notifications/cancelled': {
          // The client gave up on a request: stop waiting (and never answer it).
          const call = inflight.get(params?.requestId);
          if (call) {
            call.cancelledByClient = true;
            call.controller.abort(new Error('cancelled by the client'));
            diag(`request ${params.requestId} cancelled by the client`);
          }
          return;
        }
        case 'notifications/initialized':
        case 'notifications/roots/list_changed':
          if (method === 'notifications/roots/list_changed') rootsPromise = null;
          return;
        case 'logging/setLevel':
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call': {
          const call = { controller: new AbortController(), cancelledByClient: false };
          if (isRequest) inflight.set(id, call);
          try {
            const text = await callTool(params?.name, params?.arguments ?? {}, call);
            result = { content: [{ type: 'text', text }] };
          } catch (e) {
            if (!(e instanceof ToolError) && !e.exitCode) throw e;
            result = { content: [{ type: 'text', text: e.message }], isError: true };
          } finally {
            inflight.delete(id);
            if (waiting === call.controller) waiting = null;
          }
          if (call.cancelledByClient) return;
          break;
        }
        default:
          if (!isRequest) return;
          return send({ id, error: { code: -32601, message: `method not found: ${method}` } });
      }
      if (isRequest) send({ id, result });
    } catch (e) {
      log(`error handling ${method}: ${e.stack ?? e}`);
      if (isRequest) send({ id, error: { code: -32603, message: e.message } });
    }
  }

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: 'parse error' } });
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
  });

  log(`MCP server ${VERSION} ready${root ? ` (project: ${path.resolve(root)})` : ''}`);
  diag(`server ${VERSION} started, cwd ${process.cwd()}${root ? `, root ${root}` : ''}`);
  return new Promise((resolve) =>
    rl.on('close', () => {
      // The client went away: stop every wait so no watcher, page or timer
      // keeps the process alive, then make sure it really exits.
      for (const call of inflight.values()) call.controller.abort(new Error('the client disconnected'));
      diag('client disconnected; exiting');
      if (input === process.stdin) setTimeout(() => process.exit(0), 300);
      resolve(0);
    }),
  );
}
