# README makeover and agent-flow demo GIF

Date: 2026-11-15 · Status: draft for approval

## Intent

Someone lands on the repository (from a post, Reddit, a search) and has to understand **at once** what keepkeys is:
instead of pasting an API key into the AI chat, or creating the `.env` file by hand so the agent never sees the key,
**you just copy the key and the file is written for you.** A GIF showing that flow is the most important piece.
The README should look like the READMEs of large, well-run open-source projects.

## Goals

1. A new hero GIF that shows the agent flow: agent asks → notification → you click Copy in a provider dashboard →
   "Got it ✓ …4242" → the line appears in `.env.local` → the agent confirms.
2. A README top section in the style of large projects: centred header, badges, one-line tagline, the GIF,
   a short list of highlights, a one-command quick start. The details stay, lower down.
3. The GIF is reproducible from source with one command, like `docs/demo.tape` is today.

## Non-goals

- A website or docs site.
- A real screen recording.
- A full brand identity. A small token sheet and a wordmark are enough.
- Changing what the README *says* about the tool's behaviour or limits.

## Anti-goals (a failure even if it works)

- Imitating a real product's look: no Stripe/OpenAI dashboard, no exact Claude Code or Cursor UI, no real logos.
  The provider is the fictional **Acme**; the agent window is a generic terminal-style agent.
- A GIF so heavy the README loads slowly (target ≤ 4 MB, hard limit 10 MB, GitHub's cap).
- Adding anything to the published npm package. `package.json` `files` is `bin`, `src`, `README.md`, `LICENSE`;
  demo tooling must stay outside those.
- Losing the honest sections ("What this is NOT", "Safety rules").
- Badges that show "not found": no npm version/downloads badges until the package is published.

## Constraints

- GitHub Markdown only: no CSS or JS. HTML allowed: `<p align="center">`, `<img width>`, `<picture>` with
  `prefers-color-scheme` sources, `<details>`.
- The README is also the npm package page later; relative image links break there, so images use absolute
  `https://raw.githubusercontent.com/HenryyXD/keepkeys/main/...` URLs.
- Rendering needs Node 22+ and FFmpeg on the maintainer's machine only. CI does not render the GIF.

## Approaches considered

**For the GIF**

| | What | Trade-off |
|---|---|---|
| A | Real screen recording (ScreenToGif/OBS) | Authentic, but every re-record is manual, cluttered, shows third-party brands, heavy |
| **B (chosen)** | **Scripted HTML animation rendered to video** | Reproducible with one command, clean, on-theme, light. It is an illustration, not a recording |
| C | Extend the VHS tape | Cheapest, but VHS only records a terminal: no chat, no Copy click, no notification, which is the whole story |

**For the renderer (within B)**

| | What | Trade-off |
|---|---|---|
| **HyperFrames (chosen)** | Plain HTML + CSS + GSAP, rendered by a pinned CLI (`hyperframes@0.9.53`), Apache 2.0 | No build step, no project scaffolding, fits a zero-dependency repo; young project (April 2026) |
| Remotion | React components | Mature, but needs a React project and bundler; license is paid above 3 staff |

Chosen by the owner: B. Renderer: HyperFrames, recommended and accepted.

## Decisions already made

### The demo (validated by a throwaway spike the owner liked)

The spike's scene is the base. Story, ~9 s after speed-up:

1. Agent window (left, dark terminal style) shows the user typing `add payments to the API`.
2. Agent replies it needs `ACME_API_KEY`, to copy it from `dashboard.acme.dev`, picked up from the clipboard so it
   never touches the chat; a tool line `⎿ keepkeys request_secret ACME_API_KEY` with `waiting for a copy…`.
3. OS-style notification slides in top-right: **Copy ACME_API_KEY**.
4. Camera pushes toward the fictional Acme dashboard (right, light browser window). Cursor moves in a curve
   (separate easing on x and y) to **Copy**, clicks (press, ripple, label turns "✓ Copied").
5. Notification changes to **Got it ✓ ACME_API_KEY …4242 · Saved to .env.local · clipboard cleared**.
6. Camera pulls back. Tool line shows `✓ saved · ends in …4242`; a highlighted
   `ACME_API_KEY=••••••••••••4242` line appears in the `.env.local` editor panel (bottom-left);
   agent says "Got it, your key ends in …4242. Running the payment tests…".
7. Hold the final frame long enough to read, then loop.

Changes from the spike:

- **Everything 1.25× faster** (owner's request): all spike timings × 0.8.
- First frame already shows the windows (it is the thumbnail).
- Lighter camera push so the agent window stays partly visible while clicking.
- Text must stay readable when the GIF is shown ~900 px wide in the README.
- Typing is deterministic (per-character reveal, no `Math.random`).
- The value is never shown in full anywhere, only masked with the last 4 characters, matching keepkeys' real
  behaviour.

### Design tokens

A small `tokens.css` (colours light/dark, UI and mono fonts, radii, shadows, easing curves and durations), used by
the demo and by the wordmark/README images so they look like one family. Spike values are the starting point:
dark desk gradient (navy → indigo), accent `#7c5cff`, success `#3ddc97`, Inter + JetBrains Mono.

### README top section

```
            [keepkeys wordmark, light/dark]
   [CI] [license MIT] [node >=20] [zero dependencies]
   Paste-free API keys for AI coding agents.        ← exact tagline: builder's call, one line
          [hero GIF, full width]
   Highlights (3–4 bullets)
   Quick start: npx keepkeys setup
```

Then the existing content, tightened: "The problem" (keep the GitGuardian numbers), "How it works", Install,
Using it yourself, manifest, destinations, Safety rules, What this is NOT, Roadmap, Contributing, License.
Long reference parts (option table, manifest rules, destinations details) may move into `<details>` blocks.
Nothing factual is removed.

The existing terminal GIF (`docs/demo.gif`, VHS) moves down to "Using it yourself", where it shows the CLI flow.

## Where things go

- `docs/demo/agent-flow/` — the HyperFrames composition (`index.html`, `hyperframes.json`, `tokens.css`).
- `docs/demo/render.mjs` (or an npm script `demo:render`) — renders the MP4 with the pinned CLI, then converts it
  to `docs/agent-flow.gif` with FFmpeg (palettegen/paletteuse, ~1200 px wide, ~20 fps).
- `docs/assets/` — wordmark SVGs (light, dark).
- `docs/demo.md` — updated with how to regenerate both GIFs.
- `BACKLOG.md` — drop "Re-record the demo GIF". `docs/manual-testing.md` — drop the stale CI and GIF notes.
- This work lands on branch `readme-demo` through a PR (main is protected).

## Left to the builder

- Exact tagline and highlight wording (English, plain, honest).
- Exact colours, spacing and timings within the tokens, as long as the story and speed hold.
- The wordmark design (simple: name + a key glyph; SVG).
- Whether the render step is an `.mjs` script or npm scripts.
- Whether to vendor GSAP and fonts or load them from pinned CDN URLs (pinned CDN is fine).

## Reference

- The spike's composition is kept at
  [`assets/2026-11-15-spike-index.html`](assets/2026-11-15-spike-index.html). It renders with
  `npx hyperframes@0.9.53 render` from a folder created by `npx hyperframes@0.9.53 init <name> --example blank --skip-skills`.
  Start from it; it is throwaway quality (no tokens file, timings at 1×).
- `hyperframes check` on the spike flags the hidden "⧉" under "✓ Copied" (intended) and a 3.6:1 contrast on the
  dimmed publishable-key row; fix the contrast, ignore the first.
