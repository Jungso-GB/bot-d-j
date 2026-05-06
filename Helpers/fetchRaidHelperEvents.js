'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Récupère les événements depuis l'API Raid Helper v4, les fusionne avec
 * les événements déjà sauvegardés (pour garder l'historique même après
 * suppression sur Discord), et sauvegarde les 10 plus récents dans events.json.
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

  // ── Charger les events déjà sauvegardés ──────────────────────────────
  let savedEvents = [];
  if (fs.existsSync(eventsFilePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(eventsFilePath, 'utf8'));
      savedEvents = Array.isArray(existing.events) ? existing.events : [];
      console.log(`[fetchRaidHelperEvents] ${savedEvents.length} événement(s) déjà en cache`);
    } catch (err) {
      console.warn('[fetchRaidHelperEvents] Lecture cache échouée :', err.message);
    }
  }

  // ── Appel API Raid Helper ─────────────────────────────────────────────
  const url = `https://raid-helper.xyz/api/v4/servers/${raidHelperServerId}/events`;
  console.log(`[fetchRaidHelperEvents] Appel API : ${url}`);

  let apiEvents = [];

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
      // On continue avec les events en cache uniquement
    } else {
      const data = await res.json();
      apiEvents = data.postedEvents || [];
      console.log(`[fetchRaidHelperEvents] API → eventCountOverall=${data.eventCountOverall}, postedEvents=${apiEvents.length}`);

      // Log détaillé de chaque event reçu
      const now = Math.floor(Date.now() / 1000);
      for (const ev of apiEvents) {
        const dateStr = ev.startTime ? new Date(ev.startTime * 1000).toLocaleString('fr-FR') : 'sans date';
        const statut  = (ev.startTime ?? 0) >= now ? '📅 futur' : '📁 passé';
        console.log(`  ${statut} | id=${ev.id} | title="${ev.title}" | date=${dateStr}`);
        console.log(`  [rich] color=${ev.color ?? 'n/a'} | imageUrl=${ev.imageUrl ?? 'n/a'} | desc=${ev.description ? ev.description.slice(0, 60) + '…' : 'n/a'}`);
      }
    }
  } catch (err) {
    console.error('[fetchRaidHelperEvents] Erreur réseau :', err.message);
    // On continue avec les events en cache uniquement
  }

  // ── Fusion : API en priorité, cache pour compléter ────────────────────
  // Les events de l'API écrasent ceux du cache si même ID (mise à jour)
  const apiIds  = new Set(apiEvents.map(e => String(e.id)));
  const merged  = [
    ...apiEvents,
    ...savedEvents.filter(e => !apiIds.has(String(e.id))),
  ];

  // Trier par startTime décroissant (plus récent/futur en premier)
  merged.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));

  // Garder les 10 plus récents
  const events = merged.slice(0, 10);

  console.log(`[fetchRaidHelperEvents] Fusion → ${merged.length} unique(s), conservé ${events.length}/10`);

  // ── Sauvegarde ────────────────────────────────────────────────────────
  const payload = {
    updatedAt:   new Date().toISOString(),
    totalEvents: events.length,
    events,
  };

  const dir = path.dirname(eventsFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(eventsFilePath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[fetchRaidHelperEvents] ✅ events.json sauvegardé (${events.length} événement(s))`);
}

module.exports = fetchRaidHelperEvents;
