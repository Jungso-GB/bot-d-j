'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

/**
 * Récupère les infos de la guilde depuis Raider.io et les sauvegarde en JSON.
 * Retourne { name, realm, memberCount, updatedAt } ou null en cas d'échec.
 *
 * @param {string} guildInfoFilePath  – Chemin du fichier de sortie
 */
async function fetchGuildInfo(guildInfoFilePath) {
  const url =
    'https://raider.io/api/v1/guilds/profile' +
    '?region=eu&realm=kirin-tor&name=Donjons%20et%20Jambons&fields=members';

  return new Promise(resolve => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Donjons-et-Jambons-Bot/1.0' } },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const info = {
              name:        json.name         || 'Donjons et Jambons',
              realm:       json.realm        || 'kirin-tor',
              memberCount: json.members?.length ?? null,
              updatedAt:   new Date().toISOString(),
            };
            const dir = path.dirname(guildInfoFilePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(guildInfoFilePath, JSON.stringify(info, null, 2), 'utf8');
            console.log(`[guild-info] ${info.name} — ${info.memberCount} membre(s) total`);
            resolve(info);
          } catch (err) {
            console.warn('[guild-info] Parse échoué :', err.message);
            resolve(null);
          }
        });
      }
    );
    req.on('error', err => {
      console.warn('[guild-info] Fetch échoué :', err.message);
      resolve(null);
    });
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
  });
}

module.exports = fetchGuildInfo;
