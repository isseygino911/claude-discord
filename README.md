# Discord + Claude on a VPS

A Discord bot that routes messages to Claude Code CLI on a Ubuntu VPS.

## Prerequisites

- Ubuntu VPS with SSH access
- Node.js 18+
- Claude Code CLI installed and authenticated (`claude`)
- A Discord account with a bot application

## Step 1: Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** → click **Add Bot**
4. Under **Token**, click **Reset Token** and copy it
5. Under **Privileged Gateway Intents**, enable **Message Content Intent**
6. Go to **OAuth2 → URL Generator**, select `bot` scope and `Send Messages` + `Read Message History` permissions
7. Open the generated URL and invite the bot to your server

## Step 2: Set Up the VPS

SSH into your VPS and install Node.js if needed:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Clone the repo and install dependencies:

```bash
git clone https://github.com/isseygino911/claude-discord.git
cd claude-discord
npm install
```

## Step 3: Configure Environment Variables

Create a `.env` file in the project directory:

```
DISCORD_TOKEN=your-discord-bot-token
ALLOWED_USER_ID=your-discord-user-id
CLAUDE_CODE_OAUTH_TOKEN=your-claude-oauth-token
```

- `DISCORD_TOKEN` — from the Discord Developer Portal (Step 1)
- `ALLOWED_USER_ID` — your Discord user ID (only you can send messages to the bot)
- `CLAUDE_CODE_OAUTH_TOKEN` — your Claude Code OAuth token

## Step 4: Run the Bot

```bash
node bot.js
```

## Step 5: Keep It Running (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

## Usage

Send any message in the channel — the bot passes it to Claude Code CLI and replies.

Built-in commands:
- `!new` — start a fresh conversation (clears history)
- `!status` — show how many exchanges are in the current session

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot offline | Check `DISCORD_TOKEN` is correct and bot is invited |
| No response | Enable Message Content Intent in Dev Portal |
| Claude not found | Ensure `claude` CLI is installed at `/usr/bin/claude` and authenticated |
| Bot stops after SSH disconnect | Use PM2 as shown above |
