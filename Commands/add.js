const fs            = require('fs');
const backupMembers = require('../Helpers/backupMembers');
const fetchAvatar   = require('../Helpers/fetchAvatar');

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
  name: 'add',
  description: 'Ajoute un membre de la guilde.',
  permission: 'Aucune',
  dm: false,
  options: [
    {
      type: 'USER',
      name: 'membre',
      description: 'Compte Discord du membre.',
      required: true,
    },
    {
      type: 'STRING',
      name: 'pseudo',
      description: 'Pseudo in-game (personnage WoW).',
      required: true,
    },
    {
      type: 'STRING',
      name: 'realm',
      description: 'Royaume WoW (ex: kirin-tor, les-clairvoyants, les-sentinelles).',
      required: true,
    },
    {
      type: 'STRING',
      name: 'role',
      description: 'Rôle en jeu.',
      required: true,
      choices: [
        { name: 'Tank', value: 'Tank' },
        { name: 'Heal', value: 'Heal' },
        { name: 'DPS',  value: 'DPS'  },
      ],
    },
    {
      type: 'STRING',
      name: 'classe',
      description: 'Classe WoW (optionnel).',
      required: false,
      choices: Object.keys(WOW_CLASSES).map(c => ({ name: c, value: c })),
    },
    {
      type: 'STRING',
      name: 'titre',
      description: 'Titre fun affiché sur le site (ex: "Maître du jambon", optionnel).',
      required: false,
    },
  ],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAuthorized(bot, interaction)) {
      return interaction.followUp({ content: '🚫 Tu n\'as pas la permission d\'utiliser cette commande.', ephemeral: true });
    }

    const discordUser = interaction.options.getUser('membre');
    const pseudo      = interaction.options.getString('pseudo');
    const realm       = interaction.options.getString('realm').toLowerCase().trim();
    const role        = interaction.options.getString('role');
    const classe      = interaction.options.getString('classe');
    const classColor  = classe ? WOW_CLASSES[classe] : '#8c7b65';
    const titre       = interaction.options.getString('titre') || null;

    const filePath = bot.settings.membersFilePath;
    const members  = readMembers(filePath);

    if (members.find(m => m.discordId === discordUser.id)) {
      return interaction.followUp({ content: `⚠️ **${discordUser.username}** est déjà dans la liste.`, ephemeral: true });
    }

    // Tentative de récupération de l'avatar via Raider.io
    const avatar = await fetchAvatar(pseudo, realm);
    if (avatar) {
      console.log(`[add] Avatar trouvé pour ${pseudo} : ${avatar}`);
    } else {
      console.log(`[add] Pas d'avatar Raider.io pour ${pseudo}, initiales affichées`);
    }

    const newMember = {
      discordId:   discordUser.id,
      discordName: discordUser.username,
      name:        pseudo,
      realm:       realm,
      class:       classe || '',
      classColor:  classColor,
      role:        role,
      rank:        bot.settings.defaultRank,
      titre:       titre,   // titre fun, null si absent
      avatar:      avatar,  // null si non trouvé → initiales côté site
    };

    members.push(newMember);
    writeMembers(filePath, members);

    console.log(`[add] ${discordUser.username} → ${pseudo} (${realm}) ajouté`);
    await backupMembers(bot, filePath, 'Ajout', pseudo);

    const avatarInfo = avatar ? '✅ Avatar récupéré automatiquement.' : '⚠️ Avatar introuvable sur Raider.io — initiales affichées. Utilise `/refresh-avatars` après que le personnage soit enregistré.';

    return interaction.followUp({
      content: `✅ **${pseudo}** (\`${discordUser.username}\`) ajouté comme **${role}** sur *${realm}*. Rang : ${bot.settings.defaultRank}.\n${avatarInfo}`,
      ephemeral: true,
    });
  },
};
