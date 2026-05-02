const fs            = require('fs');
const fetchAvatar   = require('../Helpers/fetchAvatar');
const backupMembers = require('../Helpers/backupMembers');

function isAuthorized(bot, interaction) {
  const { allowedUsers, allowedRoles } = bot.settings.commands;
  if (allowedUsers.includes(interaction.user.id)) return true;
  if (interaction.member?.roles?.cache.some(r => allowedRoles.includes(r.id))) return true;
  return false;
}

function readMembers(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeMembers(filePath, members) {
  fs.writeFileSync(filePath, JSON.stringify(members, null, 2), 'utf8');
}

module.exports = {
  name: 'refresh-avatars',
  description: 'Met à jour les avatars de tous les membres via Raider.io.',
  permission: 'Aucune',
  dm: false,
  options: [],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAuthorized(bot, interaction)) {
      return interaction.followUp({ content: '🚫 Tu n\'as pas la permission d\'utiliser cette commande.', ephemeral: true });
    }

    const filePath = bot.settings.membersFilePath;
    const members  = readMembers(filePath);

    if (!members.length) {
      return interaction.followUp({ content: '📋 Aucun membre à mettre à jour.', ephemeral: true });
    }

    await interaction.followUp({
      content: `⏳ Récupération des avatars pour **${members.length}** membre(s)… (Raider.io)`,
      ephemeral: true,
    });

    let updated = 0;
    let failed  = 0;

    for (const member of members) {
      const avatar = await fetchAvatar(member.name, member.realm);
      if (avatar && avatar !== member.avatar) {
        member.avatar = avatar;
        updated++;
      } else if (!avatar) {
        failed++;
      }
    }

    writeMembers(filePath, members);
    console.log(`[refresh-avatars] ${updated} mis à jour, ${failed} non trouvés`);

    await backupMembers(bot, filePath, 'Refresh avatars', `${updated} mis à jour`);

    return interaction.followUp({
      content: [
        `✅ **Avatars mis à jour !**`,
        `• ${updated} avatar(s) récupéré(s)`,
        failed > 0 ? `• ${failed} personnage(s) introuvable(s) sur Raider.io (initiales conservées)` : '',
      ].filter(Boolean).join('\n'),
      ephemeral: true,
    });
  },
};
