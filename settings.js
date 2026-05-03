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

  // Chemin vers le fichier JSON des relations Main/ALT (généré par /import-alts)
  altsFilePath: process.env.ALTS_FILE_PATH || path.join(__dirname, 'data', 'alts.json'),

  // Chemin vers le fichier JSON des infos de la guilde (compte Raider.io)
  guildInfoFilePath: process.env.GUILD_INFO_FILE_PATH || path.join(__dirname, 'data', 'guild-info.json'),

  // Chemin vers le fichier JSON des événements Raid Helper
  eventsFilePath: process.env.EVENTS_FILE_PATH || path.join(__dirname, 'data', 'events.json'),

  // Clé API Raid Helper — variable d'env RAID_HELPER_API_KEY (prioritaire) ou fallback
  raidHelperApiKey:   process.env.RAID_HELPER_API_KEY   || 'ZFJb5zIm5ckB7V3APsuVH0FY0K3kGfXg57vwj8Rz',
  // ID serveur Discord pour Raid Helper (variable d'env ou celui du serveur)
  raidHelperServerId: process.env.RAID_HELPER_SERVER_ID || '1432474143252811861',

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
    'import-alts': true,
    'refresh-ranks': true,
  },

  // Rang attribué par défaut à tout nouveau membre (avant la 1ère synchro Discord)
  defaultRank: 'Jambon Frais',

  // IDs des rôles Discord correspondant aux grades de guilde.
  // La synchro automatique attribue le grade le plus élevé détenu par le membre.
  rankRoles: {
    '1432474143642619989': 'Tavernier',
    '1432474143642619988': 'Cuisinier',
    '1432474143642619986': 'Jambonneau',
    '1444328874681827582': 'Jambon Frais',
  },

  // ── Réactions Discord ──────────────────────────────────────────────
  // Message où les membres réagissent pour choisir leur(s) rôle(s)
  rolesChannelId:  '1432474144800509960',
  rolesMessageId:  '1433499168382517369',
  // Message où les membres réagissent pour déclarer leurs métiers
  professionsChannelId: '1432474144800509960',
  professionsMessageId: '1449782387742605502',

  // Mapping emoji name → rôle (comparaison normalisée : sans casse/espaces/_)
  roleEmojis: {
    'heal': 'Heal',
    'tank': 'Tank',
    'dps':  'DPS',
  },

  // Mapping emoji name → métier
  professionEmojis: {
    'Alchemie':        'Alchimiste',
    'Couture':         'Couturier',
    'Calligraphie':    'Calligraphe',
    'Enchantement':    'Enchanteur',
    'Forge':           'Forgeron',
    'Ingenierie':      'Ingénieur',
    'Joaillerie':      'Joaillier',
    'Travail du cuir': 'Travail du cuir',
    'Cuisine':         'Cuisine',
  },
};
