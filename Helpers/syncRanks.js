'use strict';

const fs = require('fs');

/**
 * Priorité des grades (plus le chiffre est élevé, plus le grade est haut).
 * Un membre peut avoir plusieurs rôles Discord ; on garde le grade le plus haut.
 */
const RANK_PRIORITY = {
  'Tavernier':   4,
  'Cuisinier':   3,
  'Jambonneau':  2,
  'Jambon Frais': 1,
};

/**
 * Synchronise le grade (rank) de chaque membre enregistré dans members.json
 * en lisant les rôles Discord correspondants (définis dans settings.rankRoles).
 *
 * Ne nécessite pas d'intent GuildMembers privilégié : on récupère chaque membre
 * individuellement via guild.members.fetch(discordId).
 */
async function syncRanks(bot) {
  const { rankRoles, membersFilePath, mainGuildId } = bot.settings;
  if (!rankRoles || !Object.keys(rankRoles).length) return;
  if (!mainGuildId) { console.warn('[syncRanks] mainGuildId non défini dans settings.js'); return; }

  const guild = bot.guilds.cache.get(mainGuildId);
  if (!guild) { console.warn('[syncRanks] Guilde introuvable dans le cache'); return; }

  if (!fs.existsSync(membersFilePath)) return;

  let members;
  try {
    members = JSON.parse(fs.readFileSync(membersFilePath, 'utf8'));
  } catch (err) {
    console.error('[syncRanks] Lecture members.json échouée :', err.message);
    return;
  }

  let changed = false;

  for (const member of members) {
    if (!member.discordId) continue;

    let guildMember;
    try {
      guildMember = await guild.members.fetch(member.discordId);
    } catch {
      // Membre a peut-être quitté le serveur — on ne touche pas à son grade
      continue;
    }

    // Trouver le grade le plus élevé parmi les rôles Discord du membre
    let bestRank     = null;
    let bestPriority = 0;

    for (const [roleId, rankName] of Object.entries(rankRoles)) {
      if (guildMember.roles.cache.has(roleId)) {
        const priority = RANK_PRIORITY[rankName] ?? 0;
        if (priority > bestPriority) {
          bestPriority = priority;
          bestRank     = rankName;
        }
      }
    }

    // Si aucun rôle de grade trouvé, on ne modifie pas le grade existant
    if (!bestRank) continue;

    if (member.rank !== bestRank) {
      console.log(`[syncRanks] ${member.name} : "${member.rank}" → "${bestRank}"`);
      member.rank = bestRank;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(membersFilePath, JSON.stringify(members, null, 2), 'utf8');
    console.log('[syncRanks] members.json mis à jour avec les grades Discord');
  } else {
    console.log('[syncRanks] Grades déjà à jour.');
  }
}

module.exports = { syncRanks };
