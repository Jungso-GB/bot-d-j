require('module-alias/register');
require('dotenv').config();

const fs = require('fs');

// ── Dossier de données ──
// Création, amorçage depuis les graines du dépôt, et alerte si le bot tourne
// en conteneur sans volume monté. Voir Helpers/amorcageDonnees.
//
// Fait avant tout le reste, et surtout avant d'ouvrir le serveur HTTP : les
// routes ci-dessous servent ces fichiers, autant qu'ils soient en place.
const settings = require('./settings');
require('./Helpers/amorcageDonnees').preparer(settings);
// ── Fin dossier de données ──

// ── Serveur HTTP (health check + API membres) ──
const express = require('express');
const app     = express();
const PORT    = process.env.PORT || 10000;

// Autorise le site à appeler l'API depuis n'importe quelle origine
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => res.send('🍖 Donjons & Jambons Bot · online'));

// Endpoint que le site appellera pour récupérer les membres
app.get('/api/members', (req, res) => {
  try {
    const filePath = settings.membersFilePath;
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
    const filePath = settings.altsFilePath;
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

// Endpoint pour les événements Raid Helper
app.get('/api/events', (req, res) => {
  try {
    const filePath = settings.eventsFilePath;
    if (!fs.existsSync(filePath)) {
      console.log('[/api/events] events.json introuvable, retour tableau vide');
      return res.json({ updatedAt: null, totalEvents: 0, events: [] });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`[/api/events] Servi : ${parsed.events?.length ?? 0} événement(s), updatedAt=${parsed.updatedAt}`);
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    console.error('[/api/events] Erreur :', err.message);
    res.status(500).json({ error: 'Impossible de lire events.json' });
  }
});

// Endpoint de rechargement forcé des événements (sans attendre les 24h)
app.get('/api/events/refresh', async (req, res) => {
  console.log('[/api/events/refresh] Rechargement forcé demandé');
  try {
    const fetchFn = require('./Helpers/fetchRaidHelperEvents');
    await fetchFn(settings);
    const filePath = settings.eventsFilePath;
    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, message: 'Fetch terminé mais events.json vide', events: [] });
    }
    const data   = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const count  = data.events?.length ?? 0;
    console.log(`[/api/events/refresh] ✅ ${count} événement(s) chargé(s)`);
    res.json({ ok: true, message: `${count} événement(s) chargé(s)`, ...data });
  } catch (err) {
    console.error('[/api/events/refresh] Erreur :', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint pour la veille WoW (extension, saison M+, donjons, affixes)
app.get('/api/wow-season', (req, res) => {
  try {
    const filePath = settings.wowSeasonFilePath;
    if (!fs.existsSync(filePath)) {
      return res.json({ updatedAt: null, expansion: null, season: null, dungeons: [], affixes: null });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(500).json({ error: 'Impossible de lire wow-season.json' });
  }
});

// Endpoint de rechargement forcé de la veille WoW (sans attendre les 24h)
app.get('/api/wow-season/refresh', async (req, res) => {
  console.log('[/api/wow-season/refresh] Rechargement forcé demandé');
  try {
    const fetchFn = require('./Helpers/fetchWowSeason');
    const { data, changed } = await fetchFn(settings);
    if (!data) return res.status(502).json({ ok: false, error: 'Rafraîchissement impossible' });
    res.json({ ok: true, changed, ...data });
  } catch (err) {
    console.error('[/api/wow-season/refresh] Erreur :', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint pour les infos de la guilde (compte total Raider.io)
app.get('/api/guild-info', (req, res) => {
  try {
    const filePath = settings.guildInfoFilePath;
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

const Discord = require('discord.js');

const bot = new Discord.Client({
  intents: new Discord.IntentsBitField([
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessageReactions, // pour les réactions rôles/métiers
    Discord.GatewayIntentBits.GuildVoiceStates,      // pour /que-faire : qui joue ensemble ce soir
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

const loadCommands           = require('./Loader/loadCommands');
const loadSlashCommands      = require('./Loader/loadSlashCommands');
const fetchGuildInfo         = require('./Helpers/fetchGuildInfo');
const { syncReactions, handleReactionChange } = require('./Helpers/syncReactions');
const { syncRanks }          = require('./Helpers/syncRanks');
const fetchRaidHelperEvents  = require('./Helpers/fetchRaidHelperEvents');
const fetchWowSeason         = require('./Helpers/fetchWowSeason');
const hautsFaitsIndex        = require('./Helpers/hautsFaitsIndex');
const objectifsSuivi         = require('./Helpers/objectifsSuivi');
const { planifierHebdo, libelleSchedule } = require('./Helpers/scheduler');

/**
 * Rafraîchit la veille WoW et prévient sur Discord si la saison ou l'extension
 * a changé depuis le dernier passage.
 */
async function veilleWow() {
  const { data, changed, previous } = await fetchWowSeason(settings);
  if (!changed || !data || !settings.wowSeasonChannelId) return;

  const channel = bot.channels.cache.get(settings.wowSeasonChannelId);
  if (!channel) return;

  const nouvelleExtension = previous?.expansion?.id !== data.expansion?.id;
  const donjons = data.dungeons.map(d => `• ${d.name} · ${d.timerMinutes} min`).join('\n');

  channel.send(
    [
      nouvelleExtension
        ? `🎉 **Nouvelle extension détectée : ${data.expansion.name} !**`
        : `🔄 **Nouvelle saison Mythique+ : ${data.season.label}**`,
      '',
      `**Rotation des ${data.dungeons.length} donjons :**`,
      donjons,
      '',
      `_Le catalogue de \`/que-faire\` est déjà à jour._`,
    ].join('\n')
  ).catch(err => console.warn('[wow-season] Annonce impossible :', err.message));
}

/**
 * Veille complète : la saison, puis le référentiel des hauts faits.
 *
 * L'index des hauts faits est le socle des objectifs personnalisés de
 * /que-faire. Il ne bouge qu'aux patchs, mais il coûte ~170 appels à
 * construire : on le reconstruit donc au même rythme que la veille, et jamais
 * à la demande. Son échec ne doit rien empêcher : sans lui, les objectifs
 * cessent simplement d'être filtrés par thème.
 */
async function veilleComplete() {
  await veilleWow();
  try {
    hautsFaitsIndex.vider();
    await hautsFaitsIndex.construire(settings);
  } catch (err) {
    console.warn('[hauts-faits] reconstruction impossible :', err.message);
  }
}

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

  // Récupération des événements Raid Helper, puis toutes les 24h
  fetchRaidHelperEvents(settings);
  setInterval(() => fetchRaidHelperEvents(settings), 24 * 60 * 60 * 1000);

  // Veille WoW : une passe au démarrage (le bot peut avoir été éteint au moment
  // du créneau), puis à jour et heure fixes (voir settings.veilleSchedule).
  veilleWow();
  planifierHebdo(settings.veilleSchedule, veilleComplete, 'veille WoW');
  console.log(`🗓️  Veille WoW planifiée ${libelleSchedule(settings.veilleSchedule)}`);

  // Référentiel des hauts faits : construit seulement s'il manque, pour qu'un
  // redémarrage ne repaie pas les 170 appels de catégories.
  hautsFaitsIndex.assurer(settings);

  // Objectifs personnels : passe quotidienne qui félicite ceux qui ont fini
  objectifsSuivi.planifier(bot);

  // Synchronisation initiale des rôles et métiers depuis les réactions Discord
  await syncReactions(bot);
  // Re-sync toutes les heures pour rattraper les réactions manquées
  setInterval(() => syncReactions(bot), 60 * 60 * 1000);

  // Synchronisation des grades depuis les rôles Discord (après les réactions pour éviter les conflits)
  await syncRanks(bot);
  // Re-sync des grades toutes les heures
  setInterval(() => syncRanks(bot), 60 * 60 * 1000);
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
