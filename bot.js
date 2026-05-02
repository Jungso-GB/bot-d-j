require('module-alias/register');
require('dotenv').config();

// ── Serveur HTTP (health check + API membres) ──
const express = require('express');
const fs      = require('fs');
const app     = express();
const PORT    = process.env.PORT || 10000;

// Autorise le site à appeler l'API depuis n'importe quelle origine
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => res.send('🍖 Donjons & Jambons Bot — online'));

// Endpoint que le site appellera pour récupérer les membres
app.get('/api/members', (req, res) => {
  try {
    const data = fs.readFileSync(require('./settings').membersFilePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(500).json({ error: 'Impossible de lire members.json' });
  }
});

app.listen(PORT, () => console.log(`🌐 Serveur HTTP en écoute sur le port ${PORT}`));
// ── Fin serveur HTTP ──

const Discord = require('discord.js');
const settings = require('./settings');

const bot = new Discord.Client({
  intents: new Discord.IntentsBitField([
    Discord.GatewayIntentBits.Guilds,   // seul intent nécessaire pour les slash commands
  ])
});

bot.settings = settings;
bot.commands = new Discord.Collection();

bot.commandEnabled = (name) => bot.settings.commandToggles?.[name] !== false;

const loadCommands      = require('./Loader/loadCommands');
const loadSlashCommands = require('./Loader/loadSlashCommands');

loadCommands(bot);

bot.on('ready', async () => {
  console.log(`✅ Bot connecté : ${bot.user.tag}`);
  bot.user.setActivity('les Jambons 🍖', { type: Discord.ActivityType.Watching });

  await loadSlashCommands(bot);

  if (settings.startupChannelId) {
    const channel = bot.channels.cache.get(settings.startupChannelId);
    if (channel) channel.send('🍺 Je suis de nouveau là !');
  }
});

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!bot.commandEnabled(interaction.commandName)) {
    return interaction.reply({ content: 'Cette commande est désactivée.', ephemeral: true });
  }

  try {
    const command = require(`./Commands/${interaction.commandName}`);
    console.log(`[CMD] /${command.name} par ${interaction.user.username}`);
    await command.run(bot, interaction);
  } catch (err) {
    console.error(`[ERR] Commande /${interaction.commandName} :`, err);
    const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
    if (interaction.deferred || interaction.replied) interaction.followUp(msg);
    else interaction.reply(msg);
  }
});

bot.login(process.env.DISCORD_TOKEN);
