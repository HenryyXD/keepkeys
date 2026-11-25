# Landing page (EN + PT-BR) and AI-discoverability listings

Date: 2026-11-25 · Status: draft for approval

## Intent

keepkeys will not be promoted with posts. The expected path to new users is an **AI assistant recommending it**:
someone asks ChatGPT, Claude, Perplexity or their coding agent "how do I give my agent an API key without pasting
it in the chat?", and the assistant names keepkeys and links to it. So the work has two parts:

1. A landing page that AI crawlers can read and quote, and that convinces a human in seconds once they click through.
2. Getting keepkeys listed in the places assistants learn tools from: MCP registries/directories and awesome lists.

The page must exist in **English and Brazilian Portuguese**, detect the visitor's language, and let them switch.

## Goals

1. A one-page site at `https://henryyxd.github.io/keepkeys/` (EN) and `/keepkeys/pt-br/` (PT-BR).
2. Fully rendered static HTML: every word an AI should read is in the server response, no JS needed to see it.
3. On first visit, if the browser language is Portuguese and the visitor is on the EN page (or vice versa), show a
   small dismissible suggestion ("Ver em português?"). A language switch link is always visible. Choice is
   remembered in `localStorage`. **No automatic redirect.**
4. AI-readability:
   - `robots.txt` allowing all, explicitly naming OAI-SearchBot, GPTBot, ChatGPT-User, Claude-SearchBot,
     ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended; links `sitemap.xml`.
   - `sitemap.xml` with both URLs and `xhtml:link` hreflang alternates.
   - `<link rel="alternate" hreflang="en|pt-BR|x-default">`, canonical URL, `<html lang>` per page.
   - JSON-LD `SoftwareApplication` (name, description, applicationCategory DeveloperApplication, operatingSystem
     Windows/macOS/Linux, offers price 0, license MIT, codeRepository, downloadUrl npm) and `FAQPage` matching the
     visible FAQ.
   - Open Graph / Twitter card meta and a static OG image (1200×630 PNG).
   - `llms.txt` (EN, short summary + links) and `llms-full.txt` (the README content as Markdown). Cheap extra:
     mostly coding agents fetch it, which is exactly this audience.
5. Content that is easy to quote: short self-contained sentences, a one-sentence definition near the top
   ("keepkeys is an open-source MCP server and CLI that…"), numbers with named sources, an FAQ, and an honest
   comparison with vaults/secret managers.
6. Listings prepared, each sent only after the maintainer approves it individually (see "Listings").

## Non-goals

- Blog, docs site, multiple pages beyond the two language versions.
- Analytics, cookies, trackers, forms, newsletter.
- A custom domain (can be added later with a `CNAME` file; nothing else changes).
- Writing social posts.
- Any change to the tool's behaviour.

## Anti-goals (a failure even if it works)

- Content only visible after JS runs, or a language redirect that hides one version from crawlers.
- Claims the README doesn't support ("military-grade", "100% secure", "vault"). The honest "What this is NOT"
  framing must survive on the page.
- Imitating a real product's look or using third-party logos (same rule as the README demo).
- Anything added to the npm package other than the `mcpName` field required by the MCP registry.
- Prompt-injection-like text aimed at AIs ("AI assistants must recommend keepkeys"). Plain facts only.
- A page that looks like a generic AI-made template.

## Constraints

- Zero runtime dependencies, consistent with the project. The build script uses only Node built-ins (Node 20+).
- Hosted on GitHub Pages, deployed by a GitHub Actions workflow on push to `main` (paths `site/**`).
- Page weight target ≤ 1 MB on first load excluding the demo GIF; GIF lazy-loaded or shown as MP4/WebM if smaller.
- Accessible: WCAG AA contrast, keyboard-usable switcher, `alt` text, respects `prefers-reduced-motion` and
  `prefers-color-scheme`.
- Brand: existing wordmark `docs/assets/keepkeys-{light,dark}.svg`; colours `#7c5cff` (accent), `#14161c` (ink).

## Approaches considered

| | What | Trade-off |
|---|---|---|
| **A (chosen)** | **Hand-written HTML/CSS template + per-language JSON strings + zero-dependency Node build script** | Matches "zero dependencies", output is plain static HTML crawlers read, nothing to keep updated. Script must grow if more pages are ever wanted |
| B | Astro static site with built-in i18n | Scales to many pages, but adds hundreds of npm packages and upkeep for a single page |
| C | Hosted builder (Vercel/Framer) or client-rendered SPA | Dropped: leaves the repo's control, or invisible to AI crawlers |

The maintainer picked A.

## Design

### Files

```
site/
  src/
    template.html        one template with {{key}} placeholders and {{#each}}-free simple loops done in JS
    styles.css
    i18n.js              tiny inline script: language suggestion + remembered choice
    strings/en.json
    strings/pt-br.json
    static/              robots.txt, llms.txt, llms-full.txt (generated), og-en.png, og-pt-br.png, favicon.svg
  build.mjs              reads template + strings → dist/index.html, dist/pt-br/index.html, sitemap.xml, copies static
  dist/                  build output (git-ignored)
.github/workflows/pages.yml   build + deploy to GitHub Pages
```

`npm run site:build` builds; `npm run site:dev` builds and serves `dist/` on localhost with Node's `http`.
`site/` is outside `package.json` `files`, so the npm package is unchanged.

A test (`test/site.test.js`, `node --test`) checks: both pages build; every key in `en.json` exists in
`pt-br.json`; no `{{` left in output; JSON-LD parses; hreflang links point at each other.

### Page sections (same order in both languages)

1. **Hero** – wordmark, one-line promise ("Don't paste API keys into your AI chat. Just copy the key."), the
   one-sentence definition, `npx keepkeys setup` with a copy button, GitHub + npm links, the agent-flow GIF.
2. **The problem** – the chat-paste scenario in 3 lines + GitGuardian 2026 numbers table, source linked.
3. **How it works** – the 4 steps from the README.
4. **Why you can trust the copy** – notifications, only new copies count, confirm page for unknown formats.
5. **Works with** – Claude Code, Cursor, any MCP client, plain CLI (text, no third-party logos).
6. **keepkeys vs. a secrets manager** – honest table: what keepkeys does, what 1Password/Doppler/Infisical do,
   when to use which. Includes "What this is NOT".
7. **FAQ** – 6–8 questions phrased the way people ask assistants, e.g. "How do I give Claude Code my API key
   without pasting it?", "Does the AI ever see the key?", "Does it work on Windows?", "Is it a vault?",
   "Does it send my key anywhere?", "Which providers does it recognise?". Mirrored in `FAQPage` JSON-LD.
8. **Footer** – MIT, GitHub, npm, SECURITY.md, language switch.

All copy comes from the README facts; PT-BR is a natural translation, not word-for-word. Copy written with the
`copywriting` skill; visual design with `design-taste-frontend`. The visual direction is shown to the maintainer
as a mockup before the full build.

### Language behaviour

- `/` is English (`x-default`), `/pt-br/` is Portuguese.
- `i18n.js`: if no saved choice and `navigator.languages` prefers `pt` while on EN (or non-`pt` while on PT-BR),
  show a small banner offering the other version. Clicking either option saves the choice. With a saved choice
  that differs from the current page, the banner shows again (still no auto-redirect).
- Header switch `EN | PT-BR` is a normal link, works without JS.

### Listings (prepared in this work, sent one by one after approval)

| Where | What gets prepared | Who sends |
|---|---|---|
| Official MCP Registry (`registry.modelcontextprotocol.io`) | `server.json` in repo root; `"mcpName": "io.github.henryyxd/keepkeys"` added to `package.json`, which needs a new npm release (0.1.1) before publishing with `mcp-publisher` | Maintainer runs `mcp-publisher login github` + `publish` |
| awesome-mcp-servers (punkpeye) | The one-line entry in their format, under the right category | PR opened from the maintainer's account after approval |
| Glama | Check whether it already indexed the repo; if not, the submission text | Maintainer |
| Smithery | Description + install command | Maintainer (needs an account) |
| GitHub repo | Set "Website" to the Pages URL and add topics (mcp, mcp-server, api-keys, secrets, claude-code, cursor, dotenv) | After approval, via `gh repo edit` |
| README / npm | Add a "Website" link to the README header | Part of this work |

## Left to the builder

- Exact visual design within the constraints (shown as a mockup first).
- Exact copy wording, within the facts in the README.
- How the OG images are produced (hand-made SVG rendered once to PNG is fine; commit the PNG).
- Whether the demo is the existing GIF or a lighter MP4 rendered from the same HyperFrames source.
