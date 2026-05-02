require('dotenv').config({ path: '/home/claude-project/claude-discord/.env' });
const { Client, GatewayIntentBits } = require('discord.js');
const { execFile } = require('child_process');

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
const MAX_PROMPT_CHARS = 50000; // Bug 5: stay well under OS ARG_MAX
const SYSTEM_PROMPT = `You are Claude, a coding assistant on a Ubuntu VPS. Be concise. When editing files, show only what changed.`;

let history = []; // stores { role, raw } — raw is unstripped
let summary = '';

const isAllowed = (userId) => userId === ALLOWED_USER_ID;

// Bug 2 fix: strip backticks only for Discord display, never for history
const toDiscord = (text) => text.replace(/`{3}/g, '').trim(); // only strip triple backticks

const sendChunked = async (channel, text) => {
  const clean = toDiscord(text);
  if (!clean) return;
  const max = 1900;
  for (let i = 0; i < clean.length; i += max) {
    await channel.send('```\n' + clean.slice(i, i + max) + '\n```');
  }
};

// Bug 1 fix: always pass channel to summarizeHistory
const summarizeHistory = (channel) => {
  const historyText = history.map(m =>
    `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.raw}`
  ).join('\n');

  const prompt = `Summarize this conversation in 2-3 sentences, keeping key technical decisions:\n\n${historyText}`;

  execFile('/usr/bin/claude', ['-p', prompt], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  }, (err, stdout) => {
    if (!err && stdout.trim()) {
      summary = summary ? `${summary} ${stdout.trim()}` : stdout.trim();
    }
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
  prompt += `Human: ${userMessage}\nAssistant:`;

  // Bug 5: truncate if prompt exceeds safe OS arg limit
  if (prompt.length > MAX_PROMPT_CHARS) {
    const overflow = prompt.length - MAX_PROMPT_CHARS;
    summary = `[Truncated ${overflow} chars] ${summary}`;
    history = history.slice(-4); // keep last 2 exchanges only
    return buildPrompt(userMessage); // rebuild with trimmed history
  }

  return prompt;
};

// Bug 3 fix: only push to history after confirmed success, before summarize check
const askClaude = (userMessage, channel) => {
  const prompt = buildPrompt(userMessage);

  execFile('/usr/bin/claude', ['-p', prompt], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  }, (err, stdout, stderr) => {
    if (err) {
      console.error('Claude error:', err);
      channel.send(`⚠️ Error: ${err.message}`);
      return; // Bug 3: don't push to history on error
    }

    const response = stdout.trim();
    if (!response) { channel.send('⚠️ No response.'); return; }

    // Bug 3: push only on success
    history.push({ role: 'user', raw: userMessage });
    history.push({ role: 'assistant', raw: response });

    // Bug 1: pass channel so user gets notified on summarize
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

  // Bug 5 minor: use Math.floor to avoid fractional exchange count
  if (content === '!status') {
    message.channel.send(`🟢 ${Math.floor(history.length / 2)} exchanges | Summary: ${summary ? 'yes' : 'no'}`);
    return;
  }

  if (content.startsWith('!')) return;

  message.channel.send('⏳ Thinking...');
  askClaude(content, message.channel);
});

client.once('ready', () => console.log('Bot online as ' + client.user.tag));
client.login(DISCORD_TOKEN);
