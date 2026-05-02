# Discord + Claude on a VPS

A guide to running a Discord bot powered by Claude AI on a Ubuntu VPS.

## Prerequisites

- Ubuntu VPS with SSH access
- Python 3.10+
- A Discord account with a bot application
- An Anthropic API key

## Step 1: Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** → click **Add Bot**
4. Under **Token**, click **Reset Token** and copy it
5. Under **Privileged Gateway Intents**, enable **Message Content Intent**
6. Go to **OAuth2 → URL Generator**, select `bot` scope and `Send Messages` + `Read Message History` permissions
7. Open the generated URL and invite the bot to your server

## Step 2: Get an Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. Copy and save it securely

## Step 3: Set Up the VPS

SSH into your VPS and run:

```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-venv
mkdir discord-claude-bot && cd discord-claude-bot
python3 -m venv venv
source venv/bin/activate
pip install discord.py anthropic
```

## Step 4: Create the Bot Script

Create `bot.py`:

```python
import discord
import anthropic
import os

DISCORD_TOKEN = os.environ["DISCORD_TOKEN"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

@client.event
async def on_ready():
    print(f"Logged in as {client.user}")

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    if client.user.mentioned_in(message):
        prompt = message.content.replace(f"<@{client.user.id}>", "").strip()
        response = claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        await message.channel.send(response.content[0].text)

client.run(DISCORD_TOKEN)
```

## Step 5: Set Environment Variables

```bash
export DISCORD_TOKEN="your-discord-bot-token"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## Step 6: Run the Bot

```bash
python3 bot.py
```

To keep it running after you disconnect:

```bash
nohup python3 bot.py &> bot.log &
```

Or use `screen`:

```bash
screen -S discord-bot
python3 bot.py
# Press Ctrl+A then D to detach
```

## Usage

Mention the bot in any channel it has access to:

```
@YourBot What is the capital of France?
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot offline | Check token is correct and bot is invited |
| No response to mentions | Enable Message Content Intent in Dev Portal |
| API errors | Verify `ANTHROPIC_API_KEY` is set and valid |
| Bot stops after SSH disconnect | Use `nohup` or `screen` as shown above |
