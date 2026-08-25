'use strict';

const fs = require('fs');

const { blizzardGet, BlizzardError } = require('./blizzardApi');

/**
 * Progression d'un membre, pour ne pas lui proposer ce qu'il a déjà fait.
 *
 * Le lien Discord → personnage vient de members.json, qui porte déjà un
 * discordId à côté du nom et du royaume : rien à demander aux membres.
 *
 * Tout passe par le token applicatif — aucune connexion Battle.net requise.
 * Deux cas ferment la porte, et tous deux sont traités comme « on ne sait pas » :
 *   403 → le joueur a activé la confidentialité de son profil. C'est son choix,
 *         on ne le contourne pas et on ne filtre simplement rien pour lui.
 *   404 → personnage renommé, transféré ou supprimé.
 *
 * Principe directeur : dans le doute, on ne filtre pas. Mieux vaut proposer une
 * activité déjà faite que d'en cacher une qui ne l'est pas.
 */

// Un profil ne bouge pas assez vite pour justifier mieux
const TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map(); // clé `${realm}/${name}` → { progress, expiresAt }

/** Retrouve la fiche membre correspondant à un utilisateur Discord. */
function membreDepuisDiscord(settings, discordId) {
  try {
    if (!fs.existsSync(settings.membersFilePath)) return null;
    const membres = JSON.parse(fs.readFileSync(settings.membersFilePath, 'utf8'));
    return membres.find(m => m.discordId === discordId) || null;
  } catch {
    return null;
  }
}

/** Un appel de profil qui absorbe son échec : null plutôt qu'une exception. */
async function volet(settings, endpoint) {
  try {
    return await blizzardGet(settings, endpoint, 'profile');
  } catch (err) {
    if (err instanceof BlizzardError && (err.status === 403 || err.status === 404)) {
      return { _refus: err.status };
    }
    return null;
  }
}

/**
 * Récupère la progression d'un personnage.
 * @returns {Promise<object>} toujours un objet ; `ok:false` si rien n'est exploitable
 */
async function chargerProgression(settings, membre) {
  const base = `/profile/wow/character/${membre.realm.toLowerCase()}` +
               `/${encodeURIComponent(membre.name.toLowerCase())}`;

  const [hf, montures, mascottes, jouets, reputations, mplus, quetes] = await Promise.all([
    volet(settings, `${base}/achievements`),
    volet(settings, `${base}/collections/mounts`),
    volet(settings, `${base}/collections/pets`),
    volet(settings, `${base}/collections/toys`),
    volet(settings, `${base}/reputations`),
    volet(settings, `${base}/mythic-keystone-profile`),
    volet(settings, `${base}/quests/completed`),
  ]);

  const refus = [hf, montures, mplus].find(v => v?._refus);
  if (refus && !hf?.achievements) {
    return {
      ok: false,
      raison: refus._refus === 403 ? 'prive' : 'introuvable',
      personnage: `${membre.name}-${membre.realm}`,
    };
  }

  // Un palier « N réputations exaltées » atteint vaut mieux qu'un décompte
  // maison : on compte quand même nous-mêmes, c'est plus robuste.
  const exaltees = (reputations?.reputations || [])
    .filter(r => (r.standing?.value != null && r.standing?.name)
              && /exalt/i.test(r.standing.name)).length;

  return {
    ok: true,
    personnage: `${membre.name}-${membre.realm}`,
    hautsFaits: hf?.achievements
      ? new Set(hf.achievements.filter(a => a.completed_timestamp).map(a => a.id))
      : null,
    quetes: quetes?.quests ? new Set(quetes.quests.map(q => q.id)) : null,
    montures:   montures?.mounts?.length ?? null,
    mascottes:  mascottes?.pets?.length  ?? null,
    jouets:     jouets?.toys?.length     ?? null,
    exaltees:   reputations?.reputations ? exaltees : null,
    scoreMplus: mplus?.current_mythic_rating?.rating != null
      ? Math.round(mplus.current_mythic_rating.rating) : null,
    chargeLe: new Date().toISOString(),
  };
}

/**
 * Progression du joueur derrière une interaction Discord, avec cache.
 * Retourne toujours un objet exploitable, jamais une exception.
 */
async function progressionDe(settings, discordId) {
  const membre = membreDepuisDiscord(settings, discordId);
  if (!membre) return { ok: false, raison: 'non-enregistre' };

  const cle = `${membre.realm}/${membre.name}`.toLowerCase();
  const enCache = cache.get(cle);
  if (enCache && Date.now() < enCache.expiresAt) return enCache.progress;

  let progress;
  try {
    progress = await chargerProgression(settings, membre);
  } catch (err) {
    console.warn(`[progression] ${membre.name} : ${err.message}`);
    progress = { ok: false, raison: 'erreur' };
  }

  // On met même les refus en cache : inutile de retaper toutes les 5 secondes
  cache.set(cle, { progress, expiresAt: Date.now() + TTL_MS });
  return progress;
}

/** Vide le cache (utile après un /add ou un changement de personnage). */
progressionDe.vider = () => cache.clear();

module.exports = { progressionDe, membreDepuisDiscord };
