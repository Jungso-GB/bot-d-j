'use strict';

const fs              = require('fs');
const path            = require('path');
const https           = require('https');
const { AttachmentBuilder } = require('discord.js');
const { parseGrmLog, normalize } = require('../Helpers/parseGrmLog');

const TARGET_RANKS = ['jambon frais', 'jambonneau'];

/**
 * Parcourt les logs GRM pour extraire le dernier rang connu de chaque personnage.
 * Retourne un Map normName → { displayName, rank }.
 */
function extractFinalRanks(logs) {
  const ranks = new Map();
  for (const line of logs) {
    // "Date : Officier a promu/rétrogradé Personnage de AncienRang à NouveauRang"
    const m = line.match(/: .+? a (?:promu|rétrogradé|retrogradé) (.+?) de .+ à (.+)/);
    if (m) {
      const charName = m[1].trim();
      const newRank  = m[2].trim();
      ranks.set(normalize(charName), { displayName: charName, rank: newRank });
    }
  }
  return ranks;
}

/**
 * Retourne la liste des personnages principaux (non-alts) ayant un grade cible
 * d'après les données GRM, en excluant ceux déjà enregistrés dans members.json.
 */
function findMissingMembers(result, rankMap, members) {
  const knownNorms = new Set(members.map(m => normalize(m.name)));

  // Réunit tous les personnages connus (depuis les événements de jonction + les changements de rang)
  const allChars = new Map(); // norm → displayName
  for (const [norm, info] of Object.entries(result.characters)) {
    allChars.set(norm, info.displayName);
  }
  for (const [norm, info] of rankMap) {
    if (!allChars.has(norm)) allChars.set(norm, info.displayName);
  }

  const missing = [];
  for (const [norm, displayName] of allChars) {
    if (result.altOf[norm]) continue;                  // ignorer les alts
    if (knownNorms.has(norm)) continue;                // déjà sur le site
    const rank = (rankMap.get(norm)?.rank ?? 'Jambon Frais').trim();
    if (TARGET_RANKS.includes(rank.toLowerCase())) {
      missing.push(displayName);
    }
  }
  return missing.sort((a, b) => a.localeCompare(b, 'fr'));
}

function isAuthorized(bot, interaction) {
  const { allowedUsers, allowedRoles } = bot.settings.commands;
  if (allowedUsers.includes(interaction.user.id)) return true;
  if (interaction.member?.roles?.cache.some(r => allowedRoles.includes(r.id))) return true;
  return false;
}

/** Télécharge un fichier depuis une URL Discord et retourne son contenu brut. */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = {
  name:        'import-alts',
  description: 'Importe les relations Main/ALT depuis un export JSON de GRM.',
  permission:  'Aucune',
  dm:          false,
  options: [
    {
      type:        'ATTACHMENT',
      name:        'fichier',
      description: 'Fichier JSON exporté par le addon GRM (Guild Roster Manager).',
      required:    true,
    },
  ],

  async run(bot, interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAuthorized(bot, interaction)) {
      return interaction.followUp({
        content:   '🚫 Tu n\'as pas la permission d\'utiliser cette commande.',
        ephemeral: true,
      });
    }

    const attachment = interaction.options.getAttachment('fichier');

    if (!attachment.name.endsWith('.json')) {
      return interaction.followUp({
        content:   '⚠️ Le fichier doit être un `.json` exporté par GRM.',
        ephemeral: true,
      });
    }

    // ── 1. Téléchargement ────────────────────────────────────────────
    let raw;
    try {
      const buf = await downloadFile(attachment.url);
      raw = buf.toString('utf8');
    } catch (err) {
      console.error('[import-alts] Téléchargement échoué :', err);
      return interaction.followUp({
        content:   '❌ Impossible de télécharger le fichier joint.',
        ephemeral: true,
      });
    }

    // ── 2. Parse JSON ────────────────────────────────────────────────
    let grmData;
    try {
      grmData = JSON.parse(raw);
    } catch {
      return interaction.followUp({
        content:   '❌ Le fichier ne semble pas être un JSON valide.',
        ephemeral: true,
      });
    }

    // ── 3. Parse le log GRM ──────────────────────────────────────────
    let result;
    try {
      result = parseGrmLog(grmData);
    } catch (err) {
      return interaction.followUp({
        content:   `❌ Erreur lors du parsing GRM : ${err.message}`,
        ephemeral: true,
      });
    }

    // ── 4. Sauvegarde dans alts.json ─────────────────────────────────
    const altsPath = bot.settings.altsFilePath;
    const altsDir  = path.dirname(altsPath);
    if (!fs.existsSync(altsDir)) fs.mkdirSync(altsDir, { recursive: true });
    fs.writeFileSync(altsPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[import-alts] ${result.totalRelationships} relations sauvegardées dans ${altsPath}`);

    // ── 5. Rapport des membres manquants (grade Jambon Frais / Jambonneau) ──
    const guildKey = Object.keys(grmData)[0];
    const rawLogs  = grmData[guildKey];
    const rankMap  = extractFinalRanks(rawLogs);
    const members  = (() => {
      try {
        if (!fs.existsSync(bot.settings.membersFilePath)) return [];
        return JSON.parse(fs.readFileSync(bot.settings.membersFilePath, 'utf8'));
      } catch { return []; }
    })();
    const missingMembers = findMissingMembers(result, rankMap, members);

    // ── 6. Backup dans le canal Discord ─────────────────────────────
    try {
      const channel = bot.channels.cache.get(bot.settings.backupChannelId);
      if (channel) {
        await channel.send({
          content: `🗂️ **Import ALTs** — \`${result.guildKey}\` — ${result.totalRelationships} personnages liés, ${result.totalMains} mains — <t:${Math.floor(Date.now() / 1000)}:F>`,
          files: [
            new AttachmentBuilder(
              Buffer.from(JSON.stringify(result, null, 2)),
              { name: 'alts.json' }
            ),
          ],
        });
      }
    } catch (err) {
      console.warn('[import-alts] Backup Discord échoué :', err.message);
    }

    // ── 7. Message de réponse ────────────────────────────────────────
    const lines = [
      `✅ Import réussi depuis **${result.guildKey}** !`,
      `• **${result.totalRelationships}** personnage(s) lié(s) au total`,
      `• **${result.totalMains}** main(s) distincts`,
      ``,
      `Les données sont disponibles sur le site via \`/api/alts\`.`,
    ];

    if (missingMembers.length > 0) {
      lines.push('');
      lines.push(`⚠️ **${missingMembers.length} personnage(s) grade *Jambon Frais* / *Jambonneau* non enregistrés sur le site :**`);
      for (const name of missingMembers) {
        lines.push(`  • ${name}`);
      }
      lines.push(`💡 Utilise \`/add\` pour les ajouter.`);
    } else {
      lines.push('');
      lines.push('✅ Tous les membres *Jambon Frais* / *Jambonneau* sont déjà sur le site.');
    }

    return interaction.followUp({
      content: lines.join('\n'),
      ephemeral: true,
    });
  },
};
