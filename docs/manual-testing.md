# Manual test checklist

Things automated tests can't cover: real agents, the real clipboard, notifications, your browser.
Use a throwaway project (e.g. `mkdir kk-play && cd kk-play && git init`) and **fake keys**. A fake key only needs the right prefix, e.g. `sk-or-v1-` followed by 64 characters, or `sk_test_` followed by 24.

If something misbehaves, `~/.keepkeys/mcp.log` shows what the MCP server saw (lengths and yes/no only, never values).

## A. Agent flow in Claude Code (the main one)

Start a **new** Claude Code session in the play project.

| # | Do | Expected |
|---|---|---|
| A1 | "Add OpenRouter to this project; the key goes in OPENROUTER_API_KEY." | The agent says *copy your OPENROUTER_API_KEY from openrouter.ai/settings/keys…* and calls `request_secret`. It does **not** ask you to paste in chat. |
| A2 | Watch the corner of the screen | Notification **"keepkeys: copy OPENROUTER_API_KEY"**. |
| A3 | Copy a fake `sk-or-v1-…` key | Within ~1 s: notification **"Got it ✓ OPENROUTER_API_KEY …xxxx"**. The agent says "received, ends in …xxxx". |
| A4 | Check the project | `.env.local` has the line; `.gitignore` has `/.env.local`; the clipboard is empty (Ctrl+V pastes nothing). |
| A5 | Repeat, but first copy a sentence, then the key | After the sentence: **"not a key"** notification and nothing saved. After the key: saved. |
| A6 | Repeat, copy nothing, wait 5 min | Notification **"nothing received"**. The agent says the copy didn't register and offers to retry or use the browser. |
| A7 | Have the key copied **before** asking the agent | **Not** taken. The "copy" notification appears; copy the same key again and it's saved. |
| A7b | Ask for a key keepkeys doesn't know, e.g. "store MY_SERVICE_TOKEN", and copy something like `svc_7f3k9d2m5x8q1w4e` | A browser page asks **"Save this key? …ends in …1w4e"**. Nothing is saved until you click Save; "Not this one" discards it and keepkeys keeps waiting. |
| A7c | Ask for `STRIPE_SECRET_KEY`, copy a `pk_test_51…` key | The confirm page appears with the "publishable key" warning. |
| A7d | While a request is waiting, press Esc in Claude Code to cancel it, then copy a key | Nothing is saved. |
| A8 | "Use the browser method instead" | A page opens on 127.0.0.1. Ctrl+V in the field saves it; the page says "Saved · ends in …". |
| A9 | Ask the agent "is the OpenRouter key set?" | It calls `secrets_status`, not a read of `.env.local`. |

## B. Agent flow in Cursor

Restart Cursor, check **Settings → MCP → keepkeys** is on, then repeat A1–A4 in Cursor's agent.
Also check that `.env.local` lands **in the project you have open**. The setup passes `--root ${workspaceFolder}`; if Cursor doesn't expand it, keepkeys falls back to the workspace roots.

## C. CLI in your own terminal

| # | Do | Expected |
|---|---|---|
| C1 | `keepkeys add STRIPE_SECRET_KEY --to .env.local,server/.dev.vars` then Ctrl+V a fake `sk_test_…` | Dots appear and it submits **without Enter**. Both files are written; the output shows only `…xxxx`. |
| C2 | Same, but paste a `pk_test_…` key | Warning "publishable key…", then the question "Save anyway? [y/N]". |
| C3 | Type a value by hand | Nothing submits until you press Enter; Backspace works. |
| C4 | `keepkeys add MY_TOKEN --clipboard` with a token-like value already copied | Asks "Use the key in your clipboard (ends …xxxx)?". |
| C5 | Put the example `.env.example` in the project (from `examples/`), then run `keepkeys` | A status table with `[MISSING]`, then a prompt for each missing key; Enter on an empty line skips. |
| C6 | `keepkeys list` / `keepkeys list --json` | Status only, never values. Exit code 1 while a required key is missing. |
| C7 | `keepkeys add X --to ../.env` and `--to package.json` | Refused. |
| C8 | `keepkeys add GITHUB_TOKEN --to env:user` | Windows: `[Environment]::GetEnvironmentVariable('GITHUB_TOKEN','User')` in a **new** terminal shows it. Remove it afterwards in System Properties → Environment Variables. |
| C9 | `keepkeys add OPENAI_API_KEY --check` with a fake key | Warning that the provider rejected the key (401), and you're asked whether to save anyway. |

## D. Setup

| # | Do | Expected |
|---|---|---|
| D1 | `keepkeys setup --print` | Shows both configs, pointing at your checkout. |
| D2 | `keepkeys setup --rules` in a project with a CLAUDE.md | Adds one keepkeys block; running it again doesn't duplicate it. |
| D3 | `keepkeys setup claude cursor --remove`, then `keepkeys setup` | Removed cleanly, then re-added; your other Cursor servers stay untouched. |

## What is known not to work yet

- Platform destinations (`wrangler:`, `vercel:`, `gh:`) report "planned".
- Only Windows was tested by hand.
