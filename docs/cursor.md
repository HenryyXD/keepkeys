# keepkeys in Cursor

## Install

```bash
npx keepkeys setup cursor             # global: ~/.cursor/mcp.json
npx keepkeys setup cursor --project   # this project: .cursor/mcp.json
```

Or add it by hand:

```json
{
  "mcpServers": {
    "keepkeys": {
      "command": "npx",
      "args": ["-y", "keepkeys", "mcp", "--root", "${workspaceFolder}"]
    }
  }
}
```

On Windows, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "keepkeys", "mcp", "--root", "${workspaceFolder}"]`.

`--root ${workspaceFolder}` tells the server which project it is working in. Without it, keepkeys asks the client for its workspace roots and falls back to the current directory.

Then open **Settings → MCP** and make sure `keepkeys` is enabled, or restart Cursor.

## Using it

Ask for something that needs a key. The agent tells you which key to copy, you copy it, and a notification confirms **Got it ✓**. If you'd rather paste, ask it to use the browser method.

## Rules (optional)

```bash
npx keepkeys setup --rules
```

Adds a short section to `AGENTS.md`, which Cursor reads, telling the agent to use keepkeys instead of asking for keys in chat.

## Uninstall

```bash
npx keepkeys setup cursor --remove
```
