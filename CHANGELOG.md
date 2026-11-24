# Changelog

## 0.1.0 (unreleased)

First version.

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
- Security fixes from a pre-release audit:
  - `.envrc` values are single-quoted, so `$(…)`, backticks and `$VAR` stay literal when direnv sources the file.
  - On Windows, `powershell`, `reg`, `where`, `cmd` and `git` are run from absolute paths (System32, or PATH without the current directory), so a planted `git.exe` in a cloned repository can't run; a `claude` found inside the project is ignored.
  - Over MCP, the first clipboard save of a session is always confirmed on the local page, even when the provider prefix matches.
- Release workflow (`.github/workflows/release.yml`): npm trusted publishing with provenance.
