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
const MAX_EXCHANGES = 10;
const MAX_PROMPT_CHARS = 50000;
const SYSTEM_PROMPT = `You are Claude, a coding assistant on a Ubuntu VPS. Be concise. When editing files, show only what changed.`;

let history = [];
let summary = '';

const isAllowed = (userId) => userId === ALLOWED_USER_ID;

const fetchText = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

const toDiscord = (text) => text.replace(/`{3}/g, '').trim();

const sendChunked = async (channel, text) => {
  const clean = toDiscord(text);
  if (!clean) return;
  const max = 1900;
  for (let i = 0; i < clean.length; i += max) {
    await channel.send('```\n' + clean.slice(i, i + max) + '\n```');
  }
};

const summarizeHistory = (channel) => {
  const historyText = history.map(m =>
    `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.raw}`
  ).join('\n');

  execFile('/usr/bin/claude', ['-p', `Summarize this conversation in 2-3 sentences:\n\n${historyText}`], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  }, (err, stdout) => {
    if (!err && stdout.trim()) summary = summary ? `${summary} ${stdout.trim()}` : stdout.trim();
    history = [];
    if (channel) channel.send('📝 History summarized, context preserved.');
  });
};

const buildPrompt = (userMessage) => {
  let prompt = SYSTEM_PROMPT + '\n\n';
  if (summary) prompt += `Previous summary:\n${summary}\n\n`;
  if (history.length) {
    prompt += 'Recent messages:\n';
    history.forEach(m => prompt += `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.raw}\n`);
  }
  prompt += `Human: ${userMessage}`;
  if (prompt.length > MAX_PROMPT_CHARS) {
    history = history.slice(-4);
    return buildPrompt(userMessage);
  }
  return prompt;
};

const askClaude = (userMessage, channel) => {
 execFile('/usr/bin/claude', ['-p', buildPrompt(userMessage), '--allowedTools', 'Bash,Edit,Write,Read'], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  }, (err, stdout) => {
    if (err) { console.error('Claude error:', err); channel.send(`⚠️ Error: ${err.message}`); return; }
    const response = stdout.trim();
    if (!response) { channel.send('⚠️ No response.'); return; }
    history.push({ role: 'user', raw: userMessage });
    history.push({ role: 'assistant', raw: response });
    if (history.length >= MAX_EXCHANGES * 2) summarizeHistory(channel);
    sendChunked(channel, response);
  });
};

client.on('messageCreate', async (message) => {
  if (!isAllowed(message.author.id)) return;
  if (message.author.bot) return;

  const content = message.content.trim();
  console.log('Message from:', message.author.id, '→', content);

  if (content === '!new') { history = []; summary = ''; message.channel.send('🆕 New chat.'); return; }
  if (content === '!status') { message.channel.send(`🟢 ${Math.floor(history.length / 2)} exchanges | Summary: ${summary ? 'yes' : 'no'}`); return; }
  if (content.startsWith('!')) return;
  if (content.startsWith('--')) { message.channel.send('⚠️ That looks like a CLI flag, not a message.'); return; }


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
