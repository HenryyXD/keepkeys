// `keepkeys setup`: registers the MCP server with Claude Code and/or Cursor,
// so an agent can install keepkeys for its user with one command.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { safeCommand, insideCwd } from './winbin.js';
import { fileURLToPath } from 'node:url';
import { KeepKeysError, EXIT } from './errors.js';
import { readText, atomicWrite } from './fsutil.js';
import { stripBom } from './dotenv.js';
import { out, err, color } from './ui.js';

const NAME = 'keepkeys';
const home = () => process.env.KEEPKEYS_HOME ?? os.homedir();

/**
 * How agents should start the server. A checkout (or `npm link`) runs the
 * local file with node; an installed copy runs through npx.
 */
export function serverCommand({ platform = process.platform, pkgDir = fileURLToPath(new URL('..', import.meta.url)) } = {}) {
  let real = pkgDir;
  try {
    real = fs.realpathSync(pkgDir);
  } catch {}
  const installed = real.split(path.sep).includes('node_modules') || /[\\/]_npx[\\/]/.test(real);
  if (!installed) return { command: 'node', args: [path.join(real, 'bin', 'keepkeys.js'), 'mcp'] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'npx', '-y', 'keepkeys', 'mcp'] };
  return { command: 'npx', args: ['-y', 'keepkeys', 'mcp'] };
}

// Cursor substitutes ${workspaceFolder}, so the server always knows the project.
const cursorEntry = (cmd) => ({ command: cmd.command, args: [...cmd.args, '--root', '${workspaceFolder}'] });

function readJsonFile(file) {
  const text = readText(file);
  if (text === null || !text.trim()) return {};
  try {
    return JSON.parse(stripBom(text));
  } catch (e) {
    throw new KeepKeysError(`${file} is not valid JSON (${e.message}); fix it or edit it by hand`);
  }
}

function mergeServer(file, entry, remove) {
  const data = readJsonFile(file);
  data.mcpServers ??= {};
  if (remove) {
    if (!data.mcpServers[NAME]) return 'not present';
    delete data.mcpServers[NAME];
  } else {
    data.mcpServers[NAME] = entry;
  }
  atomicWrite(file, `${JSON.stringify(data, null, 2)}\n`);
  return remove ? 'removed' : 'written';
}

function findClaude() {
  const override = process.env.KEEPKEYS_CLAUDE_BIN;
  if (override) return override === 'none' ? null : override;
  const r = spawnSync(safeCommand(process.platform === 'win32' ? 'where' : 'which') ?? 'which', ['claude'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const hits = r.stdout.split(/\r?\n/).filter(Boolean);
  if (process.platform === 'win32') return hits.find((h) => /\.(exe|cmd|bat)$/i.test(h) && !insideCwd(h)) ?? null;
  return hits[0] ?? null;
}

function runClaude(bin, args) {
  // .cmd shims cannot be spawned directly on Windows; go through cmd.exe.
  if (/\.(cmd|bat)$/i.test(bin)) {
    const quoted = [bin, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(' ');
    return spawnSync(safeCommand('cmd.exe'), ['/d', '/s', '/c', `"${quoted}"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true });
  }
  return spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
}

function detectTargets() {
  const found = [];
  if (findClaude() || fs.existsSync(path.join(home(), '.claude'))) found.push('claude');
  if (fs.existsSync(path.join(home(), '.cursor'))) found.push('cursor');
  return found;
}

const RULES = `<!-- keepkeys -->
## Secrets (keepkeys)
Never ask me to paste API keys, tokens or passwords into the chat.
When the project needs one, tell me which key to copy and from where, then call the keepkeys
\`request_secret\` MCP tool (or run \`npx keepkeys add NAME --to .env.local\`). I copy the key,
keepkeys picks it up from the clipboard, and you only get the last 4 characters: tell me it arrived.
If it times out, ask me to copy again or use the browser method. Don't read .env files to check
values; use \`secrets_status\` (or \`npx keepkeys list --json\`).
<!-- /keepkeys -->`;

function writeRules(root, remove) {
  const files = ['CLAUDE.md', 'AGENTS.md'].map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
  if (!files.length && !remove) files.push(path.join(root, 'AGENTS.md'));
  const block = /\r?\n?<!-- keepkeys -->[\s\S]*?<!-- \/keepkeys -->\r?\n?/;
  for (const f of files) {
    const text = readText(f) ?? '';
    let next = text.replace(block, '\n');
    if (!remove) next = `${next.replace(/\s*$/, '')}${next.trim() ? '\n\n' : ''}${RULES}\n`;
    if (next !== text) {
      fs.writeFileSync(f, next);
      err(`  ${remove ? 'removed rules from' : 'added rules to'} ${path.relative(root, f) || f}`);
    }
  }
}

export async function setup({ targets = [], root, project = false, print = false, remove = false, rules = false }) {
  const unknown = targets.filter((t) => !['claude', 'cursor', 'all'].includes(t));
  if (unknown.length) throw new KeepKeysError(`unknown target "${unknown[0]}" (use claude, cursor or all)`, EXIT.USAGE);
  let list = targets.includes('all') ? ['claude', 'cursor'] : [...new Set(targets)];
  if (!list.length) list = detectTargets();
  const cmd = serverCommand();

  if (print || !list.length) {
    if (!list.length && !print) err('Found neither Claude Code nor Cursor. Add keepkeys by hand:\n');
    out(color.bold('Claude Code'));
    out(`  claude mcp add --scope user ${NAME} -- ${[cmd.command, ...cmd.args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
    out(color.bold('\nCursor (~/.cursor/mcp.json or .cursor/mcp.json)'));
    out(JSON.stringify({ mcpServers: { [NAME]: cursorEntry(cmd) } }, null, 2).replace(/^/gm, '  '));
    return EXIT.OK;
  }

  let code = EXIT.OK;
  for (const target of list) {
    if (target === 'cursor') {
      const file = project ? path.join(root, '.cursor', 'mcp.json') : path.join(home(), '.cursor', 'mcp.json');
      const r = mergeServer(file, cursorEntry(cmd), remove);
      err(`Cursor: ${r} ${file}`);
      if (!remove) err(color.dim('  restart Cursor or toggle the server in Settings → MCP to load it'));
      continue;
    }
    // Claude Code
    if (project) {
      const file = path.join(root, '.mcp.json');
      err(`Claude Code: ${mergeServer(file, cmd, remove)} ${file}`);
      continue;
    }
    const bin = findClaude();
    if (!bin) {
      err('Claude Code: the "claude" command was not found. Run this once it is installed:');
      err(`  claude mcp add --scope user ${NAME} -- ${[cmd.command, ...cmd.args].join(' ')}`);
      code = EXIT.ERROR;
      continue;
    }
    runClaude(bin, ['mcp', 'remove', '--scope', 'user', NAME]);
    if (remove) {
      err('Claude Code: removed keepkeys (user scope)');
      continue;
    }
    const r = runClaude(bin, ['mcp', 'add', '--scope', 'user', NAME, '--', cmd.command, ...cmd.args]);
    if (r.status === 0) {
      err('Claude Code: added keepkeys (user scope); start a new session to load it');
    } else {
      err(`Claude Code: "claude mcp add" failed: ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
      code = EXIT.ERROR;
    }
  }
  if (rules) writeRules(root, remove);
  return code;
}
