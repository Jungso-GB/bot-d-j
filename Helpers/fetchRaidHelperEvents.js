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

  const url = `https://raid-helper.xyz/api/v4/servers/${raidHelperServerId}/events`;
  console.log(`[fetchRaidHelperEvents] Appel API : ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization:  raidHelperApiKey,
        IncludeSignUps: 'true',
      },
    });

    console.log(`[fetchRaidHelperEvents] HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[fetchRaidHelperEvents] Erreur HTTP ${res.status} — ${body}`);
      return;
    }

    const data = await res.json();
    console.log(`[fetchRaidHelperEvents] Réponse brute : eventCountOverall=${data.eventCountOverall}, postedEvents=${data.postedEvents?.length ?? 0}`);

    const now  = Math.floor(Date.now() / 1000);

    // Log chaque événement reçu pour debug
    if (data.postedEvents?.length) {
      console.log('[fetchRaidHelperEvents] Événements reçus :');
      for (const ev of data.postedEvents) {
        const dateStr = ev.startTime ? new Date(ev.startTime * 1000).toLocaleString('fr-FR') : 'sans date';
        const futur   = (ev.startTime ?? 0) >= now ? '📅 futur' : '📁 passé';
        console.log(`  ${futur} | id=${ev.id} | title="${ev.title}" | date=${dateStr}`);
      }
    } else {
      console.log('[fetchRaidHelperEvents] ⚠️  Aucun événement retourné par l\'API');
    }

    // Trier par date : futurs d'abord (les plus proches), puis passés (les plus récents)
    const all = (data.postedEvents || []).sort((a, b) => {
      const aFut = (a.startTime ?? 0) >= now;
      const bFut = (b.startTime ?? 0) >= now;
      if (aFut && bFut) return (a.startTime ?? 0) - (b.startTime ?? 0);  // futurs : croissant
      if (!aFut && !bFut) return (b.startTime ?? 0) - (a.startTime ?? 0); // passés : décroissant
      return aFut ? -1 : 1; // futurs avant passés
    });

    // Conserver les 6 premiers (futurs prioritaires + passés récents pour compléter)
    const events = all.slice(0, 6);
    console.log(`[fetchRaidHelperEvents] → ${events.length} événement(s) conservé(s) (sur ${all.length})`);

    const payload = {
      updatedAt:   new Date().toISOString(),
      totalEvents: data.eventCountOverall ?? events.length,
      events,
    };

    const dir = path.dirname(eventsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(eventsFilePath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`[fetchRaidHelperEvents] ✅ events.json sauvegardé (${events.length} événement(s))`);
  } catch (err) {
    console.error('[fetchRaidHelperEvents] Erreur :', err.message);
  }
}

module.exports = fetchRaidHelperEvents;
