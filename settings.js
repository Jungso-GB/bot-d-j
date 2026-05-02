const path = require('path');

module.exports = {
  // ID du serveur Discord principal
  mainGuildId: process.env.GUILD_ID || '',

  // Canal où le bot annonce son démarrage
  startupChannelId: '1499834446642413658',

  // Canal Discord où members.json est sauvegardé après chaque modification
  // Laisser vide ('') pour désactiver la sauvegarde
  backupChannelId: '1499834446642413658',

  // Chemin vers le fichier JSON des membres.
  // En prod sur Render : variable d'env MEMBERS_FILE_PATH=/data/members.json
  // En local : ./data/members.json par défaut
  membersFilePath: process.env.MEMBERS_FILE_PATH || path.join(__dirname, 'data', 'members.json'),

  commands: {
    // Utilisateurs Discord autorisés à utiliser /add, /remove
    allowedUsers: ['207992750988197889'],
    // Rôles Discord autorisés (alternative aux IDs utilisateurs)
    allowedRoles: [],
  },

  commandToggles: {
    add: true,
    remove: true,
    list: true,
    update: true,
    'refresh-avatars': true,
  },

  // Rang attribué par défaut à tout nouveau membre
  defaultRank: 'Jambon Frais',
};
