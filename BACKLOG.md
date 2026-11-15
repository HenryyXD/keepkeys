# Backlog

Ideas and known gaps that are deliberately **not** in 0.1. Most came from an
independent review of the first version. Roughly in order of value for effort.

## Security

- **`keepkeys setup --guard`**: install a Claude Code `PreToolUse` hook that blocks Read/Edit/Bash access to `.env*`, `.dev.vars` and `.envrc`.
  - Pro: makes "the agent never sees the key" true against a curious or prompt-injected agent, not just in chat.
  - Con: Claude Code only; shell tricks can get around it.
- **Remove the captured item from Windows clipboard history** (WinRT `Clipboard.DeleteItemFromHistory`, best effort).
  - Pro: closes the Win+V gap the README admits.
  - Con: WinRT from PowerShell is brittle.
- **Pin the version in `setup`** (`npx -y keepkeys@0.1.x`).
  - Pro: a compromised future npm release can't reach every agent session automatically.
  - Con: users drift to old versions; needs an update hint.
- **Flag `where` links whose domain isn't the provider's known domain**, on the page and in notifications. An agent or a cloned repo's `.env.example` could point at a phishing page.
- **Confirm *every* clipboard capture** (opt-in setting) for people who want a click even for well-known prefixes.
- **Diagnostic log opt-in** (`KEEPKEYS_DIAG_LOG`) instead of always-on. It is already private (0600) and capped at 256 KB, and holds only lengths, yes/no flags, key names and paths.

## Clipboard and UX

- **Open the provider's key page automatically** for known domains (`--open`).
  - Pro: one less step.
  - Con: unexpected browser tabs.
- **`keepkeys doctor`**: check clipboard read and clear, notifications, the MCP registration, env files already tracked by git, and print where the log is.
- **Cancel the wait when the paste page's tab is closed** (`pagehide` + `sendBeacon`); today the wait runs until its timeout.
- **Linux: notice a re-copy of identical text** (there is no change counter; `wl-paste --watch` could help on Wayland).
- **macOS: verify the `changeCount` path and notifications on real hardware**; they are covered only by CI with a fake clipboard.
- **Make `add` and `fill` choose modes the same way.** Without a terminal, `add` waits on the clipboard, while `fill` (several keys) opens one browser page.
- **Re-record the demo GIF** with the clipboard flow.

## Manifest

- Discover nested `.env.example` files in monorepos (`apps/*/.env.example`).
- `keepkeys.json` `$schema` for editor completion.

## Destinations

- Unix `env:user`: write to a separate `0600` file sourced from the shell rc, instead of putting secrets into `~/.zshrc` (dotfile repos are often public). Alternatively, drop `env:user` on Unix.
- Platform destinations: `wrangler secret put`, `vercel env add`, `gh secret set`. They are currently reported as "planned"; consider not advertising them until they exist.
- `--format docker` quoting for `docker run --env-file`.

## Bigger steps

- **Keychain mode**: `keepkeys run -- npm start` puts keys from the OS keychain into the environment at run time, so nothing is in plain text on disk. It is the only real answer to "the agent reads `.env`", but awkward with hot-reloading dev servers.
- **`UserPromptSubmit` hook** that spots a key-shaped string in a message before it is sent and suggests keepkeys.
