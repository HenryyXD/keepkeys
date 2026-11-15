# README Makeover and Agent-Flow GIF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reproducible hero GIF of the agent → copy → saved flow, and a README top section in the style of large open-source projects.

**Architecture:** A HyperFrames composition (plain HTML + CSS + GSAP) in `docs/demo/agent-flow/` is rendered to MP4 by the pinned `hyperframes@0.9.53` CLI, then converted to a GIF by FFmpeg through one dependency-free Node script. A shared `tokens.css` feeds the composition and the wordmark colours. The README is restructured around the GIF without dropping content.

**Tech Stack:** HyperFrames 0.9.53 (CLI via `npx`), GSAP 3.15.0 (pinned CDN), FFmpeg, Node 22+ for rendering, GitHub-flavoured Markdown.

**Spec:** `docs/superpowers/specs/2026-11-15-readme-and-demo-design.md`

## Global Constraints

- Nothing new in the npm package: `package.json` `files` stays `bin`, `src`, `README.md`, `LICENSE`; `npm pack --dry-run` lists no `docs/` path.
- No runtime dependencies added; no devDependencies either (tools run through `npx`, pinned).
- No real brands or exact product UIs: provider is **Acme** (`dashboard.acme.dev`), key `ACME_API_KEY`, value always masked as `••••…4242`.
- GIF ≤ 4 MB target, 10 MB hard limit.
- README images use absolute `https://raw.githubusercontent.com/HenryyXD/keepkeys/main/...` URLs.
- No npm version/downloads badges until the package is published.
- "Safety rules" and "What this is NOT" keep their headings (anchors `#safety-rules`, `#what-this-is-not`) and content.
- All copy in English.
- Work on branch `readme-demo`; it lands through a PR (main is protected).
- Task 6 (Part 2) is independent of Tasks 1–5 and touches only `src/`, `test/`, `SECURITY.md`, `CHANGELOG.md`. Run it first, so Task 5's CHANGELOG edit goes on top.

## Review Focus

1. **GitHub dark theme:** the wordmark and the GIF's edges must look right on both GitHub light and dark backgrounds → Task 3 checks both `<picture>` sources render; GIF has its own full-bleed background.
2. **Narrow screens (GitHub mobile, ~400 px):** the GIF scales down; the key moments (notification text, "✓ Copied", the `.env.local` line) must stay legible at 900 px → Task 1 snapshot review at 900 px width.
3. **npm page (later):** relative image paths break there → Task 4 greps the README for `](docs/` and `src="docs/` image references and requires none for images.
4. **Loop and thumbnail:** the first frame is the thumbnail and the GIF loops forever → Task 1 checks frame 0 shows the windows; Task 2 checks the GIF loops (`loop=0`).
5. **Broken in-page links after the reshuffle:** `[What this is NOT](#what-this-is-not)` and other anchors → Task 4 lists every `](#…)` link and checks each matches a heading.

---

### Task 1: Tokens and the agent-flow composition

**Files:**
- Create: `docs/demo/agent-flow/tokens.css`
- Create: `docs/demo/agent-flow/index.html` (start from `docs/superpowers/specs/assets/2026-11-15-spike-index.html`)
- Create: `docs/demo/agent-flow/hyperframes.json`, `docs/demo/agent-flow/meta.json` (copy what `npx hyperframes@0.9.53 init x --example blank --skip-skills --non-interactive` generates; do not keep its `package.json`, `CLAUDE.md`, `AGENTS.md`)
- Modify: `.gitignore` — add `docs/demo/agent-flow/.hyperframes/` and `docs/demo/agent-flow/renders/`

**Interfaces:**
- Produces: a composition with root id `main`, 1920×1080, `data-duration` ≈ 9 s, renderable from `docs/demo/agent-flow/`. CSS custom properties in `tokens.css` (names below) used by Task 3.

- [ ] **Step 1: Write `tokens.css`** with the spike's values as custom properties on `:root`: `--desk-a #0b1020`, `--desk-b #1a1440`, `--win #0f1117`, `--win-2 #161923`, `--win-line #262a36`, `--page #fbfbfd`, `--page-line #e7e8ee`, `--ink #e8eaf0`, `--ink-dim #8a90a2`, `--ink-dark #14161c`, `--ink-dark-dim #6b7080`, `--accent #7c5cff`, `--ok #3ddc97`, `--radius-win 14px`, `--radius-ctl 8px`, `--shadow-win`, `--font-ui`, `--font-mono`, plus motion tokens `--ease-out: cubic-bezier(.22,1,.36,1)`, `--dur-fast 0.2s`, `--dur-base 0.35s`, `--dur-slow 0.9s`. In the composition, GSAP eases stay as GSAP names (`power3.inOut` etc.); the CSS motion tokens document the same family.

- [ ] **Step 2: Port the spike into `index.html`**, linking `tokens.css` and deleting the inline `:root` block. Apply the spec's changes:
  - every timing × 0.8 (typing per-char delay, offsets `r`, `n`, `c`, `k`, `g`, `b`, tween durations); `data-duration="9"` on root;
  - camera push scale `S = 1.15` (was 1.32), aimed so the agent window's right ~third stays on screen during the click;
  - final frame held ≥ 1.2 s before the end (toast slides out, then hold);
  - publishable-key row: use `color: var(--ink-dark-dim)` text at full opacity instead of `opacity: .55` (fixes the 3.6:1 contrast error);
  - windows visible at t = 0 (no entrance fade).

- [ ] **Step 3: Run the check**

Run (in `docs/demo/agent-flow/`): `npx --yes hyperframes@0.9.53 check`
Expected: the only error is `text_occluded … "⧉" inside div.c2` (intended). No contrast error. Craft warnings about type size and `line_unread` are acceptable.

- [ ] **Step 4: Look at the frames at README size**

Run: `npx --yes hyperframes@0.9.53 snapshot --at 0,2.4,4.2,5.3,7.6,8.9`
Open the contact sheet. Expected: frame 0 shows all three windows; at 4.2 s the cursor is on "Copy" and part of the agent window is visible; at 5.3 s the toast reads "Got it ✓ ACME_API_KEY …4242"; at 7.6 s the `.env.local` line is highlighted and the agent's last line is shown. Scale one frame to 900 px wide (`ffmpeg -i frame.png -vf scale=900:-1 small.png`) and confirm the notification title and the `.env.local` line are readable. If not, raise font sizes in the composition (not the camera) and repeat.

- [ ] **Step 5: Commit**

```bash
git add .gitignore docs/demo/agent-flow
git commit -m "Demo: agent-flow composition and design tokens"
```

### Task 2: One-command render to GIF

**Files:**
- Create: `docs/demo/render.mjs`
- Modify: `package.json` — add script `"demo:render": "node docs/demo/render.mjs"`
- Create (generated): `docs/agent-flow.gif`

**Interfaces:**
- Consumes: the composition from Task 1.
- Produces: `docs/agent-flow.gif`, used by Task 4.

- [ ] **Step 1: Write `docs/demo/render.mjs`** (Node built-ins only: `node:child_process`, `node:fs`, `node:path`, `node:os`). It:
  1. checks `ffmpeg -version` runs, else exits 1 with "FFmpeg is required: https://ffmpeg.org/download.html";
  2. runs `npx --yes hyperframes@0.9.53 render --fps 30 -o <tmp>/agent-flow.mp4` with `cwd` = `docs/demo/agent-flow` and env `DO_NOT_TRACK=1`, `HYPERFRAMES_SKIP_SKILLS=1` (use `shell: true` so `npx` resolves on Windows);
  3. converts with `ffmpeg -y -i <mp4> -vf "fps=20,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 docs/agent-flow.gif`;
  4. if the GIF is > 4 MB, retries once with `fps=15,scale=1000`; if still > 10 MB, exits 1;
  5. prints the final size and settings.

- [ ] **Step 2: Run it**

Run: `npm run demo:render`
Expected: exit 0, prints a size ≤ 4 MB (≤ 10 MB at worst), `docs/agent-flow.gif` exists.

- [ ] **Step 3: Verify loop and package contents**

Run: `ffprobe -v error -show_entries format_tags=loop -show_entries format=duration docs/agent-flow.gif` → duration ≈ 9 s.
Run: `npm pack --dry-run 2>&1 | grep -c "docs/"` → `0`.
Run: `npm test` → all pass (unchanged).

- [ ] **Step 4: Commit**

```bash
git add docs/demo/render.mjs package.json docs/agent-flow.gif
git commit -m "Demo: render script and agent-flow GIF"
```

### Task 3: Wordmark

**Files:**
- Create: `docs/assets/keepkeys-light.svg` (dark text, for GitHub light theme)
- Create: `docs/assets/keepkeys-dark.svg` (light text, for GitHub dark theme)

**Interfaces:**
- Produces: two SVGs used by Task 4 in a `<picture>`.

- [ ] **Step 1: Draw the wordmark**: a rounded-square key glyph filled with `--accent` (`#7c5cff`) and the word "keepkeys" in a bold geometric sans. Convert the text to paths or use a system font stack in the SVG (`font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"`), since GitHub serves SVGs as images without web fonts. viewBox about 640×140; transparent background. Light: text `#14161c`. Dark: text `#e8eaf0`.

- [ ] **Step 2: Check both on both backgrounds**: open each SVG in the browser on a white page and on `#0d1117` (GitHub dark). Expected: legible, no clipped glyphs.

- [ ] **Step 3: Commit**

```bash
git add docs/assets
git commit -m "Docs: keepkeys wordmark (light and dark)"
```

### Task 4: README restructure

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/agent-flow.gif` (Task 2), `docs/assets/keepkeys-{light,dark}.svg` (Task 3), existing `docs/demo.gif`.

- [ ] **Step 1: Replace the top of the README** (everything above `## The problem`) with:
  - centred `<picture>` wordmark (dark/light sources, absolute raw URLs, width 360) inside `<p align="center">`;
  - centred badges: CI (`https://github.com/HenryyXD/keepkeys/actions/workflows/ci.yml/badge.svg`, linked to the workflow), license MIT, node ≥ 20, "zero dependencies" (static shields.io badges);
  - centred one-line tagline in bold (builder writes it; it must say: copy the key instead of pasting it into the chat);
  - the hero GIF, centred, `width="900"`, alt text describing the flow;
  - the "Keys Excluded from Every Prompt" expansion as a small line under the tagline;
  - 3–4 highlights (keep the current three facts: zero dependencies, works with any agent, small and honest; optionally one on "the agent only sees …4242");
  - `## Quick start` with `npx keepkeys setup` and one sentence on what happens next.

- [ ] **Step 2: Tighten the body**: keep every section and fact. Wrap the option table, the manifest "What counts as a secret" rules and the Destinations details in `<details><summary>…</summary>` blocks. Move the terminal GIF (`docs/demo.gif`, absolute URL) into "Using it yourself" with the caption "The CLI in your own terminal".

- [ ] **Step 3: Check links**

Run: `grep -oE "\]\(#[a-z0-9-]+\)" README.md | sort -u` and compare each anchor with the headings (`grep -E "^#{2,3} " README.md`). Expected: every anchor matches a heading.
Run: `grep -nE "(src=\"|\]\()docs/[^)\"]*\.(gif|svg|png)" README.md` → no output (images use absolute URLs).
Run: `grep -c "img.shields.io/npm" README.md` → `0`.

- [ ] **Step 4: Preview**: render the README on GitHub after pushing the branch (Task 5) and view it in light and dark themes; fix anything off before opening the PR for review.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "README: centred header, badges, agent-flow GIF, quick start"
```

### Task 5: Docs clean-up and PR

**Files:**
- Modify: `docs/demo.md` — add "Regenerating the GIFs": `npm run demo:render` (needs Node 22+ and FFmpeg) for the agent flow, `vhs docs/demo.tape` for the terminal one.
- Modify: `BACKLOG.md` — remove "Re-record the demo GIF with the clipboard flow."
- Modify: `docs/manual-testing.md` — in "What is known not to work yet", remove the demo-GIF line and the "CI has never run on macOS/Linux" line (CI now runs on all three).
- Modify: `CHANGELOG.md` — under 0.1.0 (unreleased): "README: new header and agent-flow demo GIF."

- [ ] **Step 1: Make the four edits above.**
- [ ] **Step 2: Run** `npm test` → all pass; `npm pack --dry-run 2>&1 | grep -c "docs/"` → `0`.
- [ ] **Step 3: Commit, push, open the PR**

```bash
git add docs/demo.md BACKLOG.md docs/manual-testing.md CHANGELOG.md
git commit -m "Docs: how to regenerate the demos; drop stale notes"
git push -u origin readme-demo
gh pr create --title "README makeover and agent-flow demo GIF" --body-file <body>
```

Expected: PR open against `main`, all 10 CI checks green. Then do Task 4 Step 4 on the branch view.

---

## Part 2: Key format hints from the agent (fixes a false "wrong key" warning)

**Requirement (from the owner, 2026-11-15):** `request_secret` for `ANTHROPIC_API_KEY` warned "the value does not have a known Anthropic prefix" for a real key starting `sk-ant-usr-`, which the Anthropic API accepted. The built-in prefix list is too narrow, and the agent, which often knows the format, has no way to say it.

1. New optional `request_secret` parameters: `expected_prefixes` (array of strings) and `expected_pattern` (regex string). When given, they replace the built-in list for that request.
2. The built-in list is only a guess for when the agent says nothing, and must accept each provider's known variants. Anthropic: the whole `sk-ant-` family (`sk-ant-api…`, `sk-ant-usr…`, `sk-ant-oat…`), not an exact sub-prefix.
3. An unrecognised format is not a "wrong key" alarm. The message says what was checked and which expected prefix was used, e.g. `didn't recognise the format (expected sk-ant-…); check that this is the right key`.
4. The tool description and the server instructions explain the new parameters, with examples for two providers. `where_to_get` stays as it is.
5. Tests: agent prefix accepted; agent prefix rejected; `sk-ant-usr-…` accepted with no parameters; unknown variable name with no parameters gives no false alarm. No test reads or prints a real value.

Unchanged rules: the value never appears in the chat or a log; confirmations show only the last 4 characters.

**Decision (security, by the planner):** agent-supplied formats change **warnings and messages only**. They never let a clipboard copy skip the confirm page. Otherwise a prompt-injected agent could pass `expected_pattern: ".*"` and take whatever the person copies next without a click (see SECURITY.md, "Clipboard harvesting"). Only a built-in provider match is "strong" (saved without a click), as today.

### Task 6: Expected-format parameters and a broader built-in list

**Files:**
- Modify: `src/detect.js` (PROVIDERS entry `anthropic`; `inspect`; `clipboardMatch`; new `normalizeExpectation`)
- Modify: `src/core.js` (`review` passes `expect` through)
- Modify: `src/handoff.js` (`collectViaClipboard` and `collectViaPage` read `request.expect`)
- Modify: `src/mcp/server.js` (tool schema, `request` object, `INSTRUCTIONS`)
- Modify: `SECURITY.md` (one line under "Clipboard harvesting"), `CHANGELOG.md` (one line)
- Test: `test/detect.test.js`, `test/clipboard.test.js`, `test/mcp.test.js`

**Interfaces:**
- Produces:
  - `normalizeExpectation({ prefixes, pattern }) -> { prefixes: string[], pattern: RegExp|null, shown: string } | null` in `src/detect.js`. Returns `null` when both are empty. Throws `Error` with a clear message when `pattern` is not a valid regex or is longer than 200 chars, when a prefix is empty or longer than 64 chars, or when more than 10 prefixes are given. `shown` is the text for messages, e.g. `"sk-ant-…"`, `"sk_live_… or sk_test_…"`, or `"/^re_[A-Za-z0-9]+$/"`.
  - `inspect(name, raw, { expect } = {})` and `clipboardMatch(name, raw, { expect } = {})`: same return shapes as today. `clipboardMatch` adds `formatOk: boolean|null` (null when nothing was expected); `strong` is still computed from built-in providers only.
  - `review(name, raw, { check, fetchImpl, expect })`.
  - Request objects passed to `collectViaClipboard` / `collectViaPage` may carry `expect` (the normalized object).

- [ ] **Step 1: Write the failing detect tests** in `test/detect.test.js` (fake values only, built with `.repeat()`):
  - `sk-ant-usr keys are Anthropic keys with no parameters`: `inspect('ANTHROPIC_API_KEY', 'sk-ant-usr-' + 'a'.repeat(40)).warnings` deep-equals `[]` and `identify(...)?.id === 'anthropic'`; same for `sk-ant-oat01-` and `sk-ant-api03-`.
  - `an agent-supplied prefix that matches gives no warning`: `inspect('ACME_KEY', 'acme_sk_' + 'b'.repeat(30), { expect: normalizeExpectation({ prefixes: ['acme_sk_'] }) }).warnings` deep-equals `[]`.
  - `an agent-supplied prefix that does not match explains what was checked`: with `prefixes: ['acme_sk_']` and value `'other_' + 'c'.repeat(30)`, exactly one warning, matching `/didn't recognise the format \(expected acme_sk_…\)/` and not matching `/wrong/i`.
  - `agent-supplied prefixes replace the built-in list`: `inspect('OPENAI_API_KEY', 'org-' + 'd'.repeat(30), { expect: normalizeExpectation({ prefixes: ['org-'] }) }).warnings` deep-equals `[]` (the built-in list would have warned).
  - `expected_pattern is used when given`: `pattern: '^re_[A-Za-z0-9]{20,}$'` accepts `'re_' + 'e'.repeat(24)` with no warnings, and warns on `'re_short1'` with the "didn't recognise the format" text.
  - `an unknown variable name with no parameters gives no format warning`: `inspect('MY_SERVICE_TOKEN', 'svc_7f3k9d2m5x8q1w4e').warnings` deep-equals `[]`.
  - `normalizeExpectation rejects bad input`: throws for `{ pattern: '(' }`, for `{ prefixes: [''] }` and for 11 prefixes; returns `null` for `{}`.
  - Update the existing `warns when the expected prefix is missing` to assert the new wording (contains `expected sk-ant-…`, no "wrong").

- [ ] **Step 2: Run** `node --test test/detect.test.js` → the new tests FAIL (`normalizeExpectation` not exported, old wording).

- [ ] **Step 3: Implement in `src/detect.js`**:
  - `anthropic.value` becomes `/^sk-ant-[a-z]+\d*-/` (covers api03, admin01, usr, oat01). Review the other entries for the same mistake and widen only where a documented variant is missed, with a one-line comment per change.
  - Each PROVIDERS entry gets a `shown` string for messages (`'sk-ant-…'`, `'sk-or-v1-…'`, …).
  - `inspect`: when `expect` is given, check the value against `expect.prefixes` (startsWith) or `expect.pattern`. On a miss, push `` `didn't recognise the format (expected ${expect.shown}); check that this is the right key for ${name}` `` and skip the built-in "known prefix" check. Without `expect`, the built-in "no known prefix" warning uses the same wording with the first expected provider's `shown`. Keep the cross-provider warning and the Stripe/public-prefix warnings as they are.
  - `clipboardMatch`: compute `formatOk` from `expect` when given; `strong` stays `ok && a built-in expected provider matched`.

- [ ] **Step 4: Run** `node --test test/detect.test.js` → PASS.

- [ ] **Step 5: Write the failing flow tests**:
  - `test/mcp.test.js` → `request_secret accepts expected_prefixes and expected_pattern`: the `tools/list` schema for `request_secret` has `expected_prefixes` (array of string) and `expected_pattern` (string). Browser method with `expected_prefixes: ['acme_sk_']`; submitting `'acme_sk_' + 'f'.repeat(30) + 'END2'` gives a result matching `/ok: saved ACME_API_KEY \(ends in …END2\)/` with no `notes:`; stdout never contains the value.
  - same file → `request_secret rejects an invalid expected_pattern`: `expected_pattern: '('` gives `isError: true` and text mentioning `expected_pattern`.
  - `test/clipboard.test.js` → `an agent-supplied format never skips the confirm page`: MCP clipboard request for `ACME_API_KEY` with `expected_pattern: '.*'`; copying `'acme_sk_' + 'g'.repeat(30)` opens the confirm page (same assertion style as `an unrecognised key is saved only after the person confirms it`), and nothing is written before confirming.

- [ ] **Step 6: Run** `node --test test/mcp.test.js test/clipboard.test.js` → the new tests FAIL.

- [ ] **Step 7: Wire it through**:
  - `src/mcp/server.js` schema properties:
    - `expected_prefixes`: `{ type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Optional. Prefixes a valid key starts with, if you know them, e.g. ["sk-ant-"] for Anthropic or ["sk_live_", "sk_test_", "rk_live_", "rk_test_"] for Stripe. Replaces keepkeys\' built-in guess for this request. Only used to warn the user; it never skips their confirmation.' }`
    - `expected_pattern`: `{ type: 'string', description: 'Optional. A JavaScript regex a valid key matches, e.g. "^re_[A-Za-z0-9_]{20,}$" for Resend. Use instead of or together with expected_prefixes.' }`
    - In the handler, call `normalizeExpectation`; on a throw, raise a `ToolError` naming the bad parameter. Put the result on `request.expect`.
  - `INSTRUCTIONS` gets one bullet: "If you know the key's format, pass expected_prefixes (e.g. ["sk-ant-"] for Anthropic, ["sk_live_", "sk_test_"] for Stripe) or expected_pattern. Without them keepkeys guesses from the variable name and only warns when unsure; a format warning is not proof the key is wrong."
  - `src/handoff.js`: pass `{ expect: request.expect }` to `clipboardMatch` and to `review` (through `collectViaPage`).
  - `src/core.js`: `review` forwards `expect` to `inspect`.
  - `SECURITY.md`, under "Clipboard harvesting": "Formats the agent passes (`expected_prefixes`, `expected_pattern`) only shape warnings; they never let a copy be saved without the confirm page."
  - `CHANGELOG.md`: "`request_secret` takes optional `expected_prefixes` / `expected_pattern`; the built-in Anthropic check accepts the whole `sk-ant-` family; format warnings say what was checked instead of calling the key wrong."

- [ ] **Step 8: Run** `npm test` → all pass, 0 fail. Then `git grep -n "known .* prefix" src` → no output (old wording gone).

- [ ] **Step 9: Commit**

```bash
git add src test SECURITY.md CHANGELOG.md
git commit -m "request_secret: expected_prefixes/expected_pattern; accept the sk-ant- family"
```

**Review Focus for Part 2:** (1) a prompt-injected agent passing a catch-all pattern must not bypass the confirm page (covered by the clipboard test); (2) a bad regex must fail the call cleanly, not crash the server (covered); (3) slow regexes: the pattern is capped at 200 chars and values at 4096 chars, which is acceptable; (4) no test may contain a real key: all values are built with `.repeat()`.
