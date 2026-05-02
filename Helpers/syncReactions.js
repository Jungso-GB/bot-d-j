'use strict';

const fs = require('fs');

/**
 * Normalise un nom d'emoji pour la comparaison (minuscules, sans espaces/underscores).
 * Permet de matcher "Travail_du_cuir", "Travail du cuir", "travailducuir", etc.
 */
function normalizeEmoji(name) {
  return String(name).toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Construit un index normalisé depuis un objet de mapping emoji → valeur.
 */
function buildEmojiIndex(mapping) {
  const idx = {};
  for (const [key, val] of Object.entries(mapping)) {
    idx[normalizeEmoji(key)] = val;
  }
  return idx;
}

/**
 * Récupère toutes les réactions d'un message Discord.
 * Retourne { normEmojiName → Set<userId> } ou null si erreur.
 */
async function fetchReactionMap(bot, channelId, messageId) {
  try {
    const channel = await bot.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    const result  = {};

    for (const [, reaction] of message.reactions.cache) {
      const normName = normalizeEmoji(reaction.emoji.name);
      // Récupère tous les utilisateurs (jusqu'à 100 par réaction)
      const users = await reaction.users.fetch({ limit: 100 });
      result[normName] = new Set(users.keys());
    }
    return result;
  } catch (err) {
    console.warn(`[syncReactions] Impossible de lire le message ${messageId} :`, err.message);
    return null;
  }
}

/**
 * Synchronisation complète (démarrage ou /sync-roles).
 * Lit les deux messages et met à jour roles + professions de tous les membres.
 */
async function syncReactions(bot) {
  const s        = bot.settings;
  const filePath = s.membersFilePath;
  if (!fs.existsSync(filePath)) return;

  let members = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const roleIdx = buildEmojiIndex(s.roleEmojis       || {});
  const profIdx = buildEmojiIndex(s.professionEmojis || {});

  // ── Rôles ──────────────────────────────────────────────────────────
  const roleMap = await fetchReactionMap(bot, s.rolesChannelId, s.rolesMessageId);
  if (roleMap) {
    // Réinitialise les rôles avant de recharger depuis les réactions
    for (const m of members) m.roles = [];

    for (const [normEmoji, userIds] of Object.entries(roleMap)) {
      const role = roleIdx[normEmoji];
      if (!role) continue;
      for (const userId of userIds) {
        const m = members.find(x => x.discordId === userId);
        if (!m) continue;
        if (!m.roles.includes(role)) m.roles.push(role);
      }
    }
    console.log('[syncReactions] Rôles synchronisés');
  }

  // ── Métiers ────────────────────────────────────────────────────────
  const profMap = await fetchReactionMap(bot, s.professionsChannelId, s.professionsMessageId);
  if (profMap) {
    for (const m of members) m.professions = [];

    for (const [normEmoji, userIds] of Object.entries(profMap)) {
      const prof = profIdx[normEmoji];
      if (!prof) continue;
      for (const userId of userIds) {
        const m = members.find(x => x.discordId === userId);
        if (!m) continue;
        if (!m.professions.includes(prof)) m.professions.push(prof);
      }
    }
    console.log('[syncReactions] Métiers synchronisés');
  }

  fs.writeFileSync(filePath, JSON.stringify(members, null, 2), 'utf8');
}

/**
 * Mise à jour en temps réel suite à une réaction ajoutée ou retirée.
 */
async function handleReactionChange(bot, reaction, user, action) {
  const s         = bot.settings;
  const messageId = reaction.message.id;
  const isRole    = messageId === s.rolesMessageId;
  const isProf    = messageId === s.professionsMessageId;
  if (!isRole && !isProf) return;

  const filePath = s.membersFilePath;
  if (!fs.existsSync(filePath)) return;

  let members = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const m = members.find(x => x.discordId === user.id);
  if (!m) return;  // utilisateur non suivi

  const normEmoji = normalizeEmoji(reaction.emoji.name);

  if (isRole) {
    const roleIdx = buildEmojiIndex(s.roleEmojis || {});
    const role    = roleIdx[normEmoji];
    if (!role) return;
    if (!Array.isArray(m.roles)) m.roles = [];

    if (action === 'add' && !m.roles.includes(role)) {
      m.roles.push(role);
    } else if (action === 'remove') {
      m.roles = m.roles.filter(r => r !== role);
    }
    console.log(`[reactions] ${user.username} — rôles : ${m.roles.join(', ') || 'aucun'}`);
  }

  if (isProf) {
    const profIdx = buildEmojiIndex(s.professionEmojis || {});
    const prof    = profIdx[normEmoji];
    if (!prof) return;
    if (!Array.isArray(m.professions)) m.professions = [];

    if (action === 'add' && !m.professions.includes(prof)) {
      m.professions.push(prof);
    } else if (action === 'remove') {
      m.professions = m.professions.filter(p => p !== prof);
    }
    console.log(`[reactions] ${user.username} — métiers : ${m.professions.join(', ') || 'aucun'}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(members, null, 2), 'utf8');
}

module.exports = { syncReactions, handleReactionChange };
