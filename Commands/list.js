const fs = require('fs');

const ROLE_EMOJI = { Tank: '🛡️', Heal: '💚', DPS: '⚔️' };

function readMembers(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  name: 'list',
  description: 'Affiche la liste des membres de la guilde.',
  permission: 'Aucune',
  dm: false,
  options: [],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    const members = readMembers(bot.settings.membersFilePath);

    if (members.length === 0) {
      return interaction.followUp({ content: '📋 Aucun membre enregistré pour l\'instant.', ephemeral: true });
    }

    const byRole = { Tank: [], Heal: [], DPS: [] };
    for (const m of members) {
      if (byRole[m.role]) byRole[m.role].push(m);
      else byRole['DPS'].push(m);
    }

    const lines = [`**📋 Roster — ${members.length} membre(s)**\n`];

    for (const [role, list] of Object.entries(byRole)) {
      if (!list.length) continue;
      lines.push(`${ROLE_EMOJI[role]} **${role}** (${list.length})`);
      for (const m of list) {
        const classe = m.class ? ` — ${m.class}` : '';
        lines.push(`  • **${m.name}** \`${m.realm}\`${classe} — *${m.rank}*`);
      }
      lines.push('');
    }

    return interaction.followUp({ content: lines.join('\n'), ephemeral: true });
  },
};
