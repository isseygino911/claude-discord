require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { spawn } = require('child_process');

const { DISCORD_TOKEN, ALLOWED_USER_ID } = process.env;

if (!DISCORD_TOKEN || !ALLOWED_USER_ID) {
  console.error('Missing DISCORD_TOKEN or ALLOWED_USER_ID');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const WORKDIR = '/root';
const isAllowed = (userId) => userId === ALLOWED_USER_ID;

const askClaude = (prompt, channel) => {
  const proc = spawn('claude', ['-p', prompt], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  proc.stdout.on('data', (data) => { output += data.toString(); });
  proc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) channel.send('⚠️ ' + msg);
  });

  proc.on('close', () => {
    if (output.trim()) {
      const max = 1900;
      const clean = output.trim().replace(/```/g, '');
      for (let i = 0; i < clean.length; i += max) {
        channel.send('```\n' + clean.slice(i, i + max) + '\n```');
      }
    }
  });
};

client.on('messageCreate', async (message) => {
console.log('Message received from:', message.author.id, 'content:', message.content);

  if (!isAllowed(message.author.id)) return;
  if (message.author.bot) return;

  const content = message.content.trim();
  if (content.startsWith('!')) return;

  console.log('Sending to Claude:', content);
  message.channel.send('⏳ Thinking...');
  askClaude(content, message.channel);
});

client.once('ready', () => console.log('Bot online as ' + client.user.tag));
client.login(DISCORD_TOKEN);
