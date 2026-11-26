# Contributing

Thanks for helping. Bug reports, fixes and ideas from [BACKLOG.md](BACKLOG.md) are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- **Security problems go through private reporting**, not issues or PRs. See [SECURITY.md](SECURITY.md).

## Setup

```bash
git clone https://github.com/HenryyXD/keepkeys && cd keepkeys
npm test
npm link        # use your checkout as `keepkeys`
```

Node 18.19 or newer (CI runs 18, 20, 22 and 24). There are no runtime dependencies, and we'd like to keep it that way: a tool that handles secrets should be easy to audit.

## Rules for changes

- **Never let a secret value reach output.** Not in MCP tool results, log notifications, stdout/stderr, error messages or the diagnostic log. Only the last 4 characters may be shown. `test/mcp-safety.test.js` guards this; add a case if you touch an output path.
- Use fake keys in tests and examples (`'sk_live_' + 'd'.repeat(24)`), never real ones, even revoked ones.
- Add or update tests in `test/` for behaviour changes, and run `npm test` before opening the PR.
- Things the tests can't cover (real clipboard, notifications, agents) are listed in [docs/manual-testing.md](docs/manual-testing.md). Say in the PR which ones you checked and on which OS.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under the unreleased version for user-visible changes.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
