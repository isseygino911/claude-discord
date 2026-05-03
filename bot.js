require('dotenv').config({ path: '/home/claude-project/claude-discord/.env' });
const { Client, GatewayIntentBits } = require('discord.js');
const { execFile } = require('child_process');
const https = require('https');

const { DISCORD_TOKEN, ALLOWED_USER_ID } = process.env;

if (!DISCORD_TOKEN || !ALLOWED_USER_ID) {
  console.error('Missing DISCORD_TOKEN or ALLOWED_USER_ID');
  process.exit(1);
}

console.log('ENV CHECK:', {
  discord: DISCORD_TOKEN ? 'SET' : 'MISSING',
  user: ALLOWED_USER_ID ? 'SET' : 'MISSING',
  claude: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'SET' : 'MISSING',
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const WORKDIR = '/home/claude-project';
const SYSTEM_PROMPT = `You are Claude, a coding assistant on a Ubuntu VPS. Be concise. When editing files, show only what changed.`;
const isAllowed = (userId) => userId === ALLOWED_USER_ID;

const fetchText = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

const sendChunked = async (channel, text) => {
  const clean = text.replace(/`{3}/g, '').trim();
  if (!clean) return;
  const max = 1900;
  for (let i = 0; i < clean.length; i += max) {
    await channel.send('```\n' + clean.slice(i, i + max) + '\n```');
  }
};

const askClaude = (userMessage, channel) => {
  const prompt = `${SYSTEM_PROMPT}\n\nHuman: ${userMessage}`;

  execFile('/bin/bash', ['-c', `/usr/bin/claude -p ${JSON.stringify(prompt)} < /dev/null`], {
    cwd: WORKDIR,
    env: { ...process.env },
    maxBuffer: 1024 * 1024 * 10,
  }, (err, stdout) => {
    if (err) { console.error('Claude error:', err); channel.send(`⚠️ Error: ${err.message}`); return; }
    const response = stdout.trim();
    if (!response) { channel.send('⚠️ No response.'); return; }
    sendChunked(channel, response);
  });
};

client.on('messageCreate', async (message) => {
  if (!isAllowed(message.author.id)) return;
  if (message.author.bot) return;

  const content = message.content.trim();
  console.log('Message from:', message.author.id, '→', content);

  if (content.startsWith('!') || content.startsWith('--')) return;

  let userMessage = content;
  if (message.attachments.size > 0) {
    const parts = content ? [content] : [];
    for (const attachment of message.attachments.values()) {
      try {
        const fileContent = await fetchText(attachment.url);
        parts.push(`\n--- ${attachment.name} ---\n${fileContent}`);
      } catch (e) {
        message.channel.send(`⚠️ Could not read ${attachment.name}`);
      }
    }
    userMessage = parts.join('\n');
  }

  if (!userMessage) return;
  message.channel.send('⏳ Thinking...');
  askClaude(userMessage, message.channel);
});

client.once('ready', () => console.log('Bot online as ' + client.user.tag));
client.login(DISCORD_TOKEN);