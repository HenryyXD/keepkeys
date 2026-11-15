# The flow, step by step

This is the story the README tells. `demo.tape` renders the terminal version with [VHS](https://github.com/charmbracelet/vhs):

```bash
vhs docs/demo.tape
```

## 1. The agent needs a key

> **You:** Add Stripe checkout to the API.
>
> **Agent:** Done. The server needs `STRIPE_SECRET_KEY`. Copy it from https://dashboard.stripe.com/apikeys and I'll pick it up from your clipboard, so it never goes through this chat.
> *(calls `request_secret("STRIPE_SECRET_KEY", [".env.local", "server/.dev.vars"], "https://dashboard.stripe.com/apikeys")`)*

A notification appears: **keepkeys: copy STRIPE_SECRET_KEY**.

## 2. You copy

You click the copy icon next to the secret key in the Stripe dashboard. That's all.

- A notification confirms: **Got it ✓ STRIPE_SECRET_KEY …4242, saved to .env.local, server/.dev.vars**.
- If you copied something else by mistake: **That copy didn't look like a Stripe key for STRIPE_SECRET_KEY. Copy the key again.**

## 3. Done

> **Agent:** Received, your key ends in …4242. It's in `.env.local` and `server/.dev.vars`, both in `.gitignore`. Running the checkout test now…

The key went from Stripe's dashboard to your disk, and the clipboard was cleared. It never entered the conversation.

## Variations

- **Prefer pasting?** Ask the agent to use the browser method. A page opens on `127.0.0.1`; press Ctrl+V there.
- **In your own terminal:** `npx keepkeys add STRIPE_SECRET_KEY` shows a hidden prompt. One Ctrl+V submits it.
