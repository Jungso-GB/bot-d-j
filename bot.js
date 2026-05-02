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

const pathModule = require('path');

// Endpoint que le site appellera pour récupérer les membres
app.get('/api/members', (req, res) => {
  try {
    const filePath = process.env.MEMBERS_FILE_PATH
      || pathModule.join(__dirname, 'data', 'members.json');
    const data = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(500).json({ error: 'Impossible de lire members.json' });
  }
});

// Endpoint pour les relations Main/ALT (généré par /import-alts)
app.get('/api/alts', (req, res) => {
  try {
    const filePath = process.env.ALTS_FILE_PATH
      || pathModule.join(__dirname, 'data', 'alts.json');
    if (!fs.existsSync(filePath)) {
      return res.json({ relations: {}, altOf: {}, characters: {}, totalRelationships: 0, totalMains: 0 });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(500).json({ error: 'Impossible de lire alts.json' });
  }
});

// Endpoint pour les infos de la guilde (compte total Raider.io)
app.get('/api/guild-info', (req, res) => {
  try {
    const filePath = process.env.GUILD_INFO_FILE_PATH
      || pathModule.join(__dirname, 'data', 'guild-info.json');
    if (!fs.existsSync(filePath)) {
      return res.json({ memberCount: null });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(500).json({ error: 'Impossible de lire guild-info.json' });
  }
});

app.listen(PORT, () => console.log(`🌐 Serveur HTTP en écoute sur le port ${PORT}`));
// ── Fin serveur HTTP ──

// ── Initialisation du fichier membres (disque persistant) ──
// Si le fichier n'existe pas encore (premier déploiement sur Render),
// on le crée avec un tableau vide plutôt que de planter au premier appel.
const settings = require('./settings');
const membersDir = pathModule.dirname(settings.membersFilePath);
if (!fs.existsSync(membersDir)) {
  fs.mkdirSync(membersDir, { recursive: true });
  console.log(`📁 Dossier créé : ${membersDir}`);
}
if (!fs.existsSync(settings.membersFilePath)) {
  fs.writeFileSync(settings.membersFilePath, '[]', 'utf8');
  console.log(`📄 members.json initialisé sur le disque persistant : ${settings.membersFilePath}`);
} else {
  const count = JSON.parse(fs.readFileSync(settings.membersFilePath, 'utf8')).length;
  console.log(`📄 members.json chargé (${count} membre(s)) depuis : ${settings.membersFilePath}`);
}
// ── Fin initialisation ──

const Discord = require('discord.js');

const bot = new Discord.Client({
  intents: new Discord.IntentsBitField([
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessageReactions, // pour les réactions rôles/métiers
  ]),
  // Partials nécessaires pour recevoir les réactions sur des messages non-cachés
  partials: [
    Discord.Partials.Message,
    Discord.Partials.Channel,
    Discord.Partials.Reaction,
  ],
});

bot.settings = settings;
bot.commands = new Discord.Collection();

bot.commandEnabled = (name) => bot.settings.commandToggles?.[name] !== false;

const loadCommands      = require('./Loader/loadCommands');
const loadSlashCommands = require('./Loader/loadSlashCommands');
const fetchGuildInfo    = require('./Helpers/fetchGuildInfo');
const { syncReactions, handleReactionChange } = require('./Helpers/syncReactions');

loadCommands(bot);

bot.on('ready', async () => {
  console.log(`✅ Bot connecté : ${bot.user.tag}`);
  bot.user.setActivity('les Jambons 🍖', { type: Discord.ActivityType.Watching });

  await loadSlashCommands(bot);

  if (settings.startupChannelId) {
    const channel = bot.channels.cache.get(settings.startupChannelId);
    if (channel) channel.send('🍺 Je suis de nouveau là !');
  }

  // Récupération initiale des infos de guilde (Raider.io), puis toutes les 24h
  fetchGuildInfo(settings.guildInfoFilePath);
  setInterval(() => fetchGuildInfo(settings.guildInfoFilePath), 24 * 60 * 60 * 1000);

  // Synchronisation initiale des rôles et métiers depuis les réactions Discord
  await syncReactions(bot);
  // Re-sync toutes les heures pour rattraper les réactions manquées
  setInterval(() => syncReactions(bot), 60 * 60 * 1000);
});

// ── Réactions en temps réel ──────────────────────────────────────────
bot.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    await handleReactionChange(bot, reaction, user, 'add');
  } catch (err) {
    console.error('[reactions] Erreur messageReactionAdd :', err.message);
  }
});

bot.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    await handleReactionChange(bot, reaction, user, 'remove');
  } catch (err) {
    console.error('[reactions] Erreur messageReactionRemove :', err.message);
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
