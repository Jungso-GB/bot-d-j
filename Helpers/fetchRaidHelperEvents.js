'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Récupère les événements à venir depuis l'API Raid Helper v4 et les sauvegarde
 * dans events.json (chemin défini dans settings.eventsFilePath).
 *
 * Appelé une fois par jour depuis bot.js.
 *
 * @param {object} settings  – bot.settings
 */
async function fetchRaidHelperEvents(settings) {
  const { raidHelperApiKey, raidHelperServerId, eventsFilePath } = settings;

  if (!raidHelperApiKey) {
    console.warn('[fetchRaidHelperEvents] RAID_HELPER_API_KEY non défini — import ignoré');
    return;
  }
  if (!raidHelperServerId) {
    console.warn('[fetchRaidHelperEvents] RAID_HELPER_SERVER_ID non défini — import ignoré');
    return;
  }

  // On ne récupère que les événements futurs (StartTimeFilter = maintenant)
  const startFilter = Math.floor(Date.now() / 1000);

  const url = `https://raid-helper.xyz/api/v4/servers/${raidHelperServerId}/events`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization:     raidHelperApiKey,
        StartTimeFilter:   String(startFilter),
        IncludeSignUps:    'true',
      },
    });

    if (!res.ok) {
      console.error(`[fetchRaidHelperEvents] HTTP ${res.status} — ${await res.text().catch(() => '')}`);
      return;
    }

    const data = await res.json();
    const events = (data.postedEvents || []).sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

    const payload = {
      updatedAt:   new Date().toISOString(),
      totalEvents: data.eventCountOverall ?? events.length,
      events,
    };

    const dir = path.dirname(eventsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(eventsFilePath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`[fetchRaidHelperEvents] ${events.length} événement(s) chargé(s)`);
  } catch (err) {
    console.error('[fetchRaidHelperEvents] Erreur :', err.message);
  }
}

module.exports = fetchRaidHelperEvents;
