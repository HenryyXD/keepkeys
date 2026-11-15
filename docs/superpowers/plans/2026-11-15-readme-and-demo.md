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
