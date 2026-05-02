const fs            = require('fs');
const backupMembers = require('../Helpers/backupMembers');
const fetchAvatar   = require('../Helpers/fetchAvatar');

// Les grades sont désormais synchronisés automatiquement depuis les rôles Discord (syncRanks).

const WOW_CLASSES = {
  'Guerrier':             '#C79C6E',
  'Paladin':              '#F58CBA',
  'Chasseur':             '#ABD473',
  'Voleur':               '#FFF569',
  'Prêtre':               '#FFFFFF',
  'Chevalier de la mort': '#C41F3B',
  'Chaman':               '#0070DE',
  'Mage':                 '#69CCF0',
  'Démoniste':            '#9482C9',
  'Moine':                '#00FF96',
  'Druide':               '#FF7D0A',
  'Chasseur de démons':   '#A330C9',
  'Évocateur':            '#33937F',
};

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
  name: 'update',
  description: 'Met à jour le profil d\'un membre de la guilde.',
  permission: 'Aucune',
  dm: false,
  options: [
    {
      type: 'USER',
      name: 'membre',
      description: 'Membre à modifier.',
      required: true,
    },
    {
      type: 'STRING',
      name: 'pseudo',
      description: 'Nouveau pseudo in-game (relance la récupération de l\'avatar).',
      required: false,
    },
    {
      type: 'STRING',
      name: 'realm',
      description: 'Nouveau royaume WoW (ex: kirin-tor, les-sentinelles).',
      required: false,
    },
    {
      type: 'STRING',
      name: 'classe',
      description: 'Nouvelle classe WoW.',
      required: false,
      choices: Object.keys(WOW_CLASSES).map(c => ({ name: c, value: c })),
    },
    {
      type: 'STRING',
      name: 'titre',
      description: 'Titre fun affiché sur le site. Envoie "aucun" pour le supprimer.',
      required: false,
    },
    {
      type: 'STRING',
      name: 'citation',
      description: 'Citation dans le profil. Envoie "aucun" pour la supprimer.',
      required: false,
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
      return interaction.followUp({
        content: `⚠️ **${discordUser.username}** n'est pas dans la liste. Utilise \`/add\` pour l'ajouter.`,
        ephemeral: true,
      });
    }

    const newPseudo   = interaction.options.getString('pseudo');
    const newRealm    = interaction.options.getString('realm')?.toLowerCase().trim() ?? null;
    const newClasse   = interaction.options.getString('classe');
    const newTitre    = interaction.options.getString('titre');
    const newCitation = interaction.options.getString('citation');

    if (!newPseudo && !newRealm && !newClasse && !newTitre && !newCitation) {
      return interaction.followUp({
        content: '⚠️ Fournis au moins un champ à modifier.\n💡 Les rôles, métiers et grades se synchronisent automatiquement depuis Discord.',
        ephemeral: true,
      });
    }

    const member  = members[index];
    const changes = [];

    if (newPseudo && newPseudo !== member.name) {
      member.name = newPseudo;
      changes.push(`pseudo → **${newPseudo}**`);
    }
    if (newRealm && newRealm !== member.realm) {
      member.realm = newRealm;
      changes.push(`realm → **${newRealm}**`);
    }
    if (newClasse && newClasse !== member.class) {
      member.class      = newClasse;
      member.classColor = WOW_CLASSES[newClasse];
      changes.push(`classe → **${newClasse}**`);
    }
    if (newTitre !== null) {
      if (newTitre?.toLowerCase() === 'aucun') {
        member.titre = null;
        changes.push('titre fun → *supprimé*');
      } else if (newTitre && newTitre !== member.titre) {
        member.titre = newTitre;
        changes.push(`titre fun → *« ${newTitre} »*`);
      }
    }
    if (newCitation !== null) {
      if (newCitation?.toLowerCase() === 'aucun') {
        member.citation = null;
        changes.push('citation → *supprimée*');
      } else if (newCitation && newCitation !== member.citation) {
        member.citation = newCitation;
        changes.push(`citation → *« ${newCitation} »*`);
      }
    }

    // Re-fetch avatar si pseudo ou realm a changé
    if (newPseudo || newRealm) {
      const newAvatar = await fetchAvatar(member.name, member.realm);
      if (newAvatar) {
        member.avatar = newAvatar;
        changes.push('avatar → ✅ mis à jour');
      } else {
        changes.push('avatar → ⚠️ introuvable sur Raider.io');
      }
    }

    if (!changes.length) {
      return interaction.followUp({
        content: `ℹ️ Aucune modification détectée pour **${discordUser.username}** (valeurs identiques).`,
        ephemeral: true,
      });
    }

    writeMembers(filePath, members);
    console.log(`[update] ${discordUser.username} — ${changes.join(', ')}`);
    await backupMembers(bot, filePath, 'Mise à jour', member.name);

    return interaction.followUp({
      content: `✅ **${member.name}** mis à jour :\n${changes.map(c => `• ${c}`).join('\n')}`,
      ephemeral: true,
    });
  },
};
