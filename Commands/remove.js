const fs            = require('fs');
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
  name: 'remove',
  description: 'Retire un membre de la guilde.',
  permission: 'Aucune',
  dm: false,
  options: [
    {
      type: 'USER',
      name: 'membre',
      description: 'Compte Discord du membre à retirer.',
      required: true,
    },
  ],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAuthorized(bot, interaction)) {
      return interaction.followUp({ content: '🚫 Tu n\'as pas la permission d\'utiliser cette commande.', ephemeral: true });
    }

    const discordUser = interaction.options.getUser('membre');
    const filePath    = bot.settings.membersFilePath;
    const members     = readMembers(filePath);

    const index = members.findIndex(m => m.discordId === discordUser.id);
    if (index === -1) {
      return interaction.followUp({ content: `⚠️ **${discordUser.username}** n'est pas dans la liste.`, ephemeral: true });
    }

    const removed = members.splice(index, 1)[0];
    writeMembers(filePath, members);

    console.log(`[remove] ${discordUser.username} → ${removed.name} retiré`);

    // Backup dans le canal de dev
    await backupMembers(bot, filePath, 'Suppression', removed.name);

    return interaction.followUp({
      content: `✅ **${removed.name}** (\`${discordUser.username}\`) retiré de la guilde.`,
      ephemeral: true,
    });
  },
};
