# Changelog

## 0.1.0 (unreleased)

First version.

Servers, SSH and sudo:
- On a server or over SSH, an agent's `keepkeys` / `keepkeys add` (no terminal) prints the one command the person runs in their own terminal, and exits with code 4, instead of waiting for a clipboard or a page nobody can reach. MCP `request_secret` and `request_missing_secrets` return that command at once. `KEEPKEYS_HEADLESS=1/0` overrides the guess.
- `--clipboard` fails at once with an explanation when there is no clipboard to read (it used to wait 5 minutes in silence).
- `--browser` no longer claims to have opened a page on a machine without a display; over SSH it prints the `ssh -L` tunnel to use. The page accepts `localhost` and any local port, so tunnels work.
- Rewriting an env file keeps its owner and mode, also under `sudo`; new files created by root go to the directory's owner. Permission errors name the owner instead of a temp file.
- Fixed: on X11 with `xclip`, keepkeys hung after saving until something else was copied.
- The terminal's "Save anyway? [y/N]" takes one key press without echo; a paste there is discarded instead of shown on screen.
- IDs, user names and passwords are not held to API-key rules (a 9-digit chat ID or a Gmail app password with spaces no longer needs a confirmation).
- The default destination fits any project: an existing `.env.local` or `.env`; else `.env.local` for frameworks that use it (Next.js, Vite, Astro, SvelteKit, CRA, Vue CLI, read from `package.json`); else `.env`, which docker compose, python-dotenv, Rails, Laravel, Go and `node --env-file` all read. It used to be `.env.local` everywhere.
- Runs on Node 18.19+ (the `nodejs` package in Ubuntu 24.04 and Debian 12).

- `keepkeys`, `add`, `list`: hidden terminal prompt (one Ctrl+V submits), `--stdin`, and a local browser page (`--browser`).
- `request_secret` takes optional `expected_prefixes` / `expected_pattern`; the built-in Anthropic check accepts the whole `sk-ant-` family; format warnings say what was checked instead of calling the key wrong. Agent-supplied formats are labelled as the agent's on the confirm page and limited to visible ASCII without spaces.
- Clipboard mode, the default when there is no terminal: the person just copies the key.
  - Only a copy made after the request counts; copying the same text again is noticed (Windows and macOS change counters).
  - Values without the expected provider prefix, or with warnings, are confirmed on a local page whose address the agent never sees.
  - Copies that don't look like a key are ignored (sentences, URLs, paths, emails).
  - The clipboard is cleared afterwards, and desktop notifications confirm each step.
- MCP: honours `notifications/cancelled`, lets a new request replace a waiting one, and exits when the client disconnects. No progress notifications (Claude Code dropped the connection on them).
- Provider expectations skip IDs, URLs and OAuth client secrets (`GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `STRIPE_PRICE_ID`).
- `.env.example` entries with real example values (`PORT=3000`) are treated as settings, not secrets; `# secret` overrides. Invalid names in `keepkeys.json` are skipped and reported.
- `.envrc` gets `export NAME=value`. Multi-line pastes (PEM keys) keep their line breaks.
- Manifest from `.env.example` (`# where:`, `# to:`, `# optional`) or `keepkeys.json`.
- Destinations: env files (line-preserving, `.gitignore` handling) and `env:user`.
- Provider prefix checks, paste clean-up, optional `--check`.
- MCP server: `request_secret` (`method`: clipboard or browser; results include the next step for the agent), `request_missing_secrets`, `secrets_status`.
- `setup` for Claude Code and Cursor, `--project`, `--rules`, `--remove`, `--print`.
- README: new header and agent-flow demo GIF.
