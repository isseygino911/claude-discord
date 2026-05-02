module.exports = {
  apps: [{
    name: 'claude-discord',
    script: 'bot.js',
    cwd: '/home/claude-project/claude-discord',
    env_file: '.env',
    restart_delay: 5000,
    max_restarts: 10,
  }]
};

