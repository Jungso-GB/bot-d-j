'use strict';

const fs              = require('fs');
const path            = require('path');
const https           = require('https');
const { AttachmentBuilder } = require('discord.js');
const { parseGrmLog } = require('../Helpers/parseGrmLog');

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

    // ── 5. Backup dans le canal Discord ─────────────────────────────
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

    return interaction.followUp({
      content: [
        `✅ Import réussi depuis **${result.guildKey}** !`,
        `• **${result.totalRelationships}** personnage(s) lié(s) au total`,
        `• **${result.totalMains}** main(s) distincts`,
        ``,
        `Les données sont disponibles sur le site via \`/api/alts\`.`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
