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

  // Chemin vers le fichier JSON de la veille WoW (saison, donjons M+, affixes)
  wowSeasonFilePath: process.env.WOW_SEASON_FILE_PATH || path.join(__dirname, 'data', 'wow-season.json'),

  // Chemin vers l'index des hauts faits par catégorie (construit depuis l'API Blizzard)
  hautsFaitsFilePath: process.env.HAUTS_FAITS_FILE_PATH || path.join(__dirname, 'data', 'wow-hauts-faits.json'),

  // Chemin vers les objectifs personnels en cours (posés par /que-faire)
  objectifsFilePath: process.env.OBJECTIFS_FILE_PATH || path.join(__dirname, 'data', 'objectifs.json'),

  // ── Veille World of Warcraft ───────────────────────────────────────
  // API Blizzard : identifiants créés sur https://develop.battle.net/access/clients
  blizzard: {
    clientId:     process.env.BLIZZARD_CLIENT_ID     || '',
    clientSecret: process.env.BLIZZARD_CLIENT_SECRET || '',
    region:       process.env.BLIZZARD_REGION        || 'eu',
    locale:       process.env.BLIZZARD_LOCALE        || 'fr_FR',
  },

  // ── Objectifs personnalisés ────────────────────────────────────────
  // /que-faire ne se contente pas de tirer une activité : il lit le profil du
  // joueur et en déduit une cible nominative (« il te manque Griseveille »).
  //
  // Les faits viennent toujours de l'API Blizzard. OpenRouter n'intervient que
  // pour rédiger la marche à suivre autour de ces faits : il n'a jamais le droit
  // de choisir la cible. Sans clé, le rendu bascule sur des gabarits : la
  // fonctionnalité reste entière, elle perd juste le confort de lecture.
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model:  process.env.OPENROUTER_MODEL   || 'deepseek/deepseek-v4-flash',
  },

  // Canal où féliciter un membre qui vient de boucler son objectif.
  // Laisser vide ('') pour désactiver l'annonce.
  objectifsChannelId: process.env.OBJECTIFS_CHANNEL_ID || '1499834446642413658',

  // Passe de vérification des quêtes en cours, toutes les deux heures.
  // Format d'intervalle (heures) et non de créneau hebdomadaire : une quête
  // bouclée en début de soirée doit être félicitée dans la soirée, pas le
  // lendemain matin. Le coût est nul quand personne n'a de quête ouverte, et
  // d'un appel de profil par membre concerné sinon. Blizzard est large.
  objectifsSchedule: {
    heures: 2,
    minute: 0,
    fuseau: 'Europe/Paris',
  },

  // Première extension sondée chez Raider.io pour trouver la saison active.
  // Le helper sonde cet identifiant puis les 3 suivants : une nouvelle extension
  // est donc détectée sans modification de code.
  raiderIoExpansionIdMin: 11, // 11 = Midnight

  // Canal où annoncer un changement de saison ou d'extension.
  // Laisser vide ('') pour désactiver l'alerte.
  wowSeasonChannelId: '1499834446642413658',

  // Quand rafraîchir la veille WoW.
  // jours : 0 = dimanche, 1 = lundi … 4 = jeudi, 6 = samedi.
  //
  // La réinitialisation hebdomadaire EU tombe le mercredi matin : c'est à ce
  // moment que les affixes changent. Ajouter 3 (mercredi) à la liste évite
  // d'afficher les affixes de la semaine précédente pendant la journée du
  // mercredi. Un passage a lieu de toute façon à chaque démarrage du bot.
  veilleSchedule: {
    jours:  [3, 4],           // mercredi (réinit. EU, rotation des affixes) + jeudi
    heure:  8,
    minute: 0,
    fuseau: 'Europe/Paris',
  },

  // Clé API Raid Helper : variable d'env RAID_HELPER_API_KEY (prioritaire) ou fallback
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
    'que-faire': true,
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
