'use strict';

const { syncRanks } = require('../Helpers/syncRanks');

function isAuthorized(bot, interaction) {
  const { allowedUsers, allowedRoles } = bot.settings.commands;
  if (allowedUsers.includes(interaction.user.id)) return true;
  if (interaction.member?.roles?.cache.some(r => allowedRoles.includes(r.id))) return true;
  return false;
}

module.exports = {
  name: 'refresh-ranks',
  description: 'Synchronise les grades de tous les membres depuis leurs rôles Discord.',
  permission: 'Aucune',
  dm: false,
  options: [],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAuthorized(bot, interaction)) {
      return interaction.followUp({ content: '🚫 Tu n\'as pas la permission d\'utiliser cette commande.', ephemeral: true });
    }

    await interaction.followUp({
      content: '⏳ Synchronisation des grades en cours…',
      ephemeral: true,
    });

    try {
      const result = await syncRanks(bot);
      const { changed, total, updates } = result ?? { changed: false, total: 0, updates: [] };

      const lines = [
        `✅ **Grades synchronisés !**`,
        `• ${total} membre(s) vérifié(s)`,
        `• ${updates.length} grade(s) mis à jour`,
      ];

      if (updates.length > 0) {
        lines.push('');
        lines.push('**Changements :**');
        for (const u of updates) {
          lines.push(`• **${u.name}** : ${u.from || '?'} → ${u.to}`);
        }
      }

      return interaction.followUp({ content: lines.join('\n'), ephemeral: true });

    } catch (err) {
      console.error('[refresh-ranks] Erreur :', err);
      return interaction.followUp({
        content: `❌ Erreur lors de la synchronisation : ${err.message}`,
        ephemeral: true,
      });
    }
  },
};
