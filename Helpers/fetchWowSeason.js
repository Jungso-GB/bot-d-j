'use strict';

const fs   = require('fs');
const path = require('path');

const { blizzardGet, getJson } = require('./blizzardApi');

/**
 * Veille World of Warcraft : garde à jour l'extension, la saison Mythique+,
 * la liste des donjons de la rotation et les affixes de la semaine.
 *
 * Deux sources, chacune pour ce qu'elle fait de mieux :
 *   • Blizzard (API officielle, OAuth) → noms de donjons et d'extensions en français
 *   • Raider.io (public, sans clé)     → composition de la saison en cours et affixes
 *
 * La jointure se fait sur le challenge_mode_id, identique des deux côtés.
 *
 * Écrit data/wow-season.json et retourne { data, changed, previous }.
 * En cas d'échec réseau, le fichier existant est conservé tel quel : mieux vaut
 * des données d'hier qu'un fichier vide.
 */

// Pseudo-extension « Saison actuelle » renvoyée par Blizzard, à ignorer.
const TIER_SAISON_ACTUELLE = 505;

// ── Assemblage ────────────────────────────────────────────────────────

/** Extension la plus récente côté Blizzard, en français. */
function extensionCourante(tiers) {
  const vraies = (tiers || []).filter(t => t.id !== TIER_SAISON_ACTUELLE);
  if (!vraies.length) return null;
  const derniere = vraies.reduce((a, b) => (b.id > a.id ? b : a));
  return { id: derniere.id, name: derniere.name };
}

/**
 * Cherche la saison Mythique+ active chez Raider.io.
 * On sonde plusieurs expansion_id pour que l'arrivée d'une extension soit
 * détectée sans qu'on ait à toucher au code.
 */
async function saisonActive(expansionIdMin) {
  const now = Date.now();
  let trouvee = null;

  for (let exp = expansionIdMin; exp <= expansionIdMin + 3; exp++) {
    let data;
    try {
      data = await getJson(`https://raider.io/api/v1/mythic-plus/static-data?expansion_id=${exp}`);
    } catch {
      continue; // extension inconnue de Raider.io : on passe
    }
    if (!data.seasons?.length) continue;

    for (const s of data.seasons) {
      // On écarte les variantes techniques : classements figés, événements courts
      if (!s.is_main_season || s.slug.includes('cutoffs')) continue;
      const debut = new Date(s.starts.eu).getTime();
      const fin   = new Date(s.ends.eu).getTime();
      if (debut > now || now >= fin) continue;
      // À égalité, on garde la saison la plus récemment ouverte
      if (!trouvee || debut > trouvee.debut) trouvee = { saison: s, expansionId: exp, debut };
    }
  }

  return trouvee;
}

/**
 * « MN1 (Full) » + « Midnight » → « Midnight — Saison 1 ».
 * Les libellés Raider.io traînent des suffixes techniques (« • Full », « (Full) ») :
 * on ne garde que le numéro, d'où qu'il vienne.
 */
function libelleSaison(saison, extension) {
  const numero = (saison.short_name || '').match(/(\d+)/)?.[1]
              || (saison.name || '').match(/season\s*(\d+)/i)?.[1];
  const base   = extension?.name || 'World of Warcraft';
  return numero ? `${base} — Saison ${numero}` : `${base} — ${saison.name}`;
}

function lireFichier(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Rafraîchit la veille et écrit le fichier.
 * @param {object} settings – objet settings du bot
 * @returns {Promise<{data: object|null, changed: boolean, previous: object|null}>}
 */
async function fetchWowSeason(settings) {
  const filePath = settings.wowSeasonFilePath;
  const previous = lireFichier(filePath);

  try {
    // 1. Noms français (Blizzard) — indexés par challenge_mode_id
    const [donjonsBz, extensionsBz] = await Promise.all([
      blizzardGet(settings, '/data/wow/mythic-keystone/dungeon/index', 'dynamic'),
      blizzardGet(settings, '/data/wow/journal-expansion/index', 'static'),
    ]);
    const nomsFR   = new Map((donjonsBz.dungeons || []).map(d => [d.id, d.name]));
    const extension = extensionCourante(extensionsBz.tiers);

    // 2. Composition de la saison en cours (Raider.io)
    const active = await saisonActive(settings.raiderIoExpansionIdMin);
    if (!active) throw new Error('Aucune saison Mythique+ active trouvée');

    const { saison } = active;
    const dungeons = (saison.dungeons || []).map(d => ({
      challengeModeId: d.challenge_mode_id,
      name:            nomsFR.get(d.challenge_mode_id) || d.name, // repli sur l'anglais
      nameEn:          d.name,
      shortName:       d.short_name,
      timerMinutes:    Math.round(d.keystone_timer_seconds / 60),
      icon:            d.icon_url || null,
    }));

    const traduits = dungeons.filter(d => d.name !== d.nameEn).length;

    // 3. Affixes de la semaine, en français (Raider.io)
    let affixes = null;
    try {
      const a = await getJson(
        `https://raider.io/api/v1/mythic-plus/affixes?region=${settings.blizzard.region}&locale=fr`
      );
      affixes = {
        title: a.title,
        names: (a.affix_details || []).map(x => x.name),
      };
    } catch {
      affixes = previous?.affixes || null; // non bloquant
    }

    const fin = new Date(saison.ends.eu);
    const data = {
      updatedAt: new Date().toISOString(),
      expansion: extension,
      season: {
        slug:      saison.slug,
        name:      saison.name,
        shortName: saison.short_name,
        label:     libelleSaison(saison, extension),
        startsAt:  saison.starts.eu,
        endsAt:    saison.ends.eu,
        daysLeft:  Math.max(0, Math.ceil((fin - Date.now()) / 86400000)),
      },
      dungeons,
      affixes,
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    const changed = Boolean(
      previous && (
        previous.season?.slug !== data.season.slug ||
        previous.expansion?.id !== data.expansion?.id
      )
    );

    console.log(
      `[wow-season] ${data.expansion?.name} · ${data.season.label} — ` +
      `${dungeons.length} donjons (${traduits} en FR), fin dans ${data.season.daysLeft} j` +
      (changed ? ' ⚠️ CHANGEMENT DÉTECTÉ' : '')
    );

    return { data, changed, previous };

  } catch (err) {
    console.warn(`[wow-season] Rafraîchissement échoué : ${err.message}` +
      (previous ? ' — données précédentes conservées' : ''));
    return { data: previous, changed: false, previous };
  }
}

/** Lecture seule du dernier état connu de la veille (null si jamais rempli). */
fetchWowSeason.read = (settings) => lireFichier(settings.wowSeasonFilePath);

module.exports = fetchWowSeason;
