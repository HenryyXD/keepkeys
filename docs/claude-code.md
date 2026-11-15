# keepkeys in Claude Code

## Install

```bash
npx keepkeys setup claude
```

This runs `claude mcp add --scope user keepkeys -- npx -y keepkeys mcp`, using `cmd /c npx …` on native Windows. After that, every project gets the server. Start a new session to load it, then check with `/mcp`.

To share it with a team, commit a project-scoped config instead:

```bash
npx keepkeys setup claude --project     # writes .mcp.json
```

Claude Code asks each person to approve project servers the first time.

## What the agent gets

| Tool | What it does |
|---|---|
| `request_secret(name, destinations?, where_to_get?, description?, method?)` | Waits for the user to copy the key (`method: "clipboard"`, default) or opens the paste page (`"browser"`). Returns `ok: saved NAME (ends in …1234) to …` plus the next step for the agent. |
| `request_missing_secrets()` | One page for every key in `.env.example` / `keepkeys.json` that isn't set yet. |
| `secrets_status()` | Which keys are set in which file. Never returns values. |

The server also sends instructions telling the agent to use these tools instead of asking for secrets in chat, and not to read env files.

## The flow

1. The agent writes: *"Copy your STRIPE_SECRET_KEY from https://dashboard.stripe.com/apikeys; I'll pick it up from the clipboard."*
2. You click Copy. A notification shows **Got it ✓ STRIPE_SECRET_KEY …4242**.
3. The agent confirms: *"Received, ends in …4242."*

If nothing arrives within 5 minutes, the agent is told the copy didn't register. It should ask you to copy again or call `request_secret` with `method: "browser"`.

## Waiting for you

`request_secret` blocks until the key arrives or the wait ends (5 minutes for the clipboard, 10 for the browser page). While it waits it sends progress notifications. If your setup times out MCP calls sooner, raise the limit, e.g. `MCP_TOOL_TIMEOUT=600000 claude`.

## Troubleshooting

- **It keeps waiting after you copied.** Look at `keepkeys-mcp.log` in your temp folder (`%TEMP%` on Windows, `$TMPDIR` or `/tmp` elsewhere). For each clipboard change it records the length and whether it looked like the key, **never the text**. "looks like a key: false" means the copy wasn't the key, or had another provider's prefix.
- **New code isn't used.** Each session starts its own server, so start a new session after updating keepkeys.

## Without MCP

Claude Code's Bash tool has no terminal attached, so `npx keepkeys add NAME` notices that and waits for you to copy the key (or opens the browser page with `--browser`). Run it with a long timeout, e.g. 600000 ms. In the desktop app, the agent can also open a terminal tab with the command already filled in, and you just paste there.

## Rules file (optional)

```bash
npx keepkeys setup --rules
```

Adds a short section to `CLAUDE.md` (and `AGENTS.md` if present). Remove it with `--rules --remove`.

## Uninstall

```bash
npx keepkeys setup claude --remove
```
