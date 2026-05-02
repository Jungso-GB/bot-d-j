const fs = require('fs');
const { AttachmentBuilder } = require('discord.js');

/**
 * Envoie members.json dans le canal de backup Discord.
 * @param {import('discord.js').Client} bot
 * @param {string} filePath  - chemin absolu vers members.json
 * @param {string} action    - libellé de l'action ('Ajout' | 'Suppression')
 * @param {string} memberName - pseudo in-game concerné
 */
async function backupMembers(bot, filePath, action, memberName) {
  const channelId = bot.settings.backupChannelId;
  if (!channelId) return; // Backup désactivée si pas de canal configuré

  const channel = bot.channels.cache.get(channelId);
  if (!channel) {
    console.warn(`[backup] Canal introuvable : ${channelId}`);
    return;
  }

  try {
    const raw   = fs.readFileSync(filePath, 'utf8');
    const count = JSON.parse(raw).length;
    const file  = new AttachmentBuilder(Buffer.from(raw, 'utf8'), { name: 'members.json' });
    const ts    = `<t:${Math.floor(Date.now() / 1000)}:F>`;

    await channel.send({
      content: `🗂️ **Backup membres** — ${action} de **${memberName}** — ${count} membre(s) au total — ${ts}`,
      files: [file],
    });

    console.log(`[backup] members.json envoyé dans #${channel.name}`);
  } catch (err) {
    console.error('[backup] Échec de l\'envoi :', err);
  }
}

module.exports = backupMembers;
