# Security

## Threat model

keepkeys protects against one specific risk: **a secret ending up in an AI agent's conversation** (transcripts, logs, provider-side storage, shared sessions) because the person pasted it into the chat.

In scope:

- The value never appears in MCP tool results, CLI stdout/stderr or the agent's shell output. Only the last 4 characters are shown.
- An agent (or a prompt injection it read) cannot use the MCP server to write outside the project, to a non-env file, or to the user environment unless `--allow-env-user` was given.
- Other websites open in the browser cannot read from or post to the local paste page. It uses a random one-time token in the path, checks `Host` and `Origin`, requires a JSON content type, sets a strict CSP and `frame-ancestors 'none'`, and listens on `127.0.0.1` only.
- Destination files are added to `.gitignore`, and keepkeys warns if one is already tracked by git.
- **Clipboard harvesting:** an agent that was tricked into calling `request_secret` can't take what is already on the clipboard. Only a copy made after the request counts.
  - A copied value that keepkeys can't match to the provider the name expects (an unknown provider, a different prefix, any warning) is saved only after the person clicks Save on a local confirm page.
  - The confirm page's address is never sent to the agent: not in tool results, not in MCP log notifications, not on the CLI's output. It appears on stderr only when no browser could be opened.
- A request the client cancels (`notifications/cancelled`) stops watching immediately and is never answered. A newer request replaces an older one, so at most one watcher runs. The server exits when the client disconnects.

Known limits:

- A copied value **with** the expected provider prefix is saved without a click. A malicious request for, say, `GITHUB_TOKEN` will take the next GitHub token the person copies within 5 minutes. The "keepkeys: copy …" notification at the start of every request is the person's cue that something is asking.
- An agent with a shell could, in principle, read the confirm page's address from the process list while the browser is being opened, or race the person to the page. This is considered theoretical.

Out of scope (see "What this is NOT" in the README):

- The secret is stored in plain text on disk.
- An agent with file access can read the env files.
- Malware or other users on the same machine.
- Clipboard history and clipboard sync.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") instead of opening a public issue. You should get an answer within a week.
