'use strict';

const fs = require('fs');

const { blizzardGet, BlizzardError } = require('./blizzardApi');

/**
 * Progression d'un membre, pour ne pas lui proposer ce qu'il a déjà fait — et
 * surtout pour savoir ce qu'il lui reste à faire, nommément.
 *
 * Le lien Discord → personnage vient de members.json, qui porte déjà un
 * discordId à côté du nom et du royaume : rien à demander aux membres.
 *
 * Tout passe par le token applicatif — aucune connexion Battle.net requise.
 * Deux cas ferment la porte, et tous deux sont traités comme « on ne sait pas » :
 *   403 → le joueur a activé la confidentialité de son profil. C'est son choix,
 *         on ne le contourne pas ; /que-faire lui explique comment l'ouvrir s'il
 *         le souhaite, et fonctionne sans en attendant.
 *   404 → personnage renommé, transféré ou supprimé.
 *
 * Principe directeur : dans le doute, on ne filtre pas. Mieux vaut proposer une
 * activité déjà faite que d'en cacher une qui ne l'est pas.
 *
 * ── Sur le poids en mémoire ───────────────────────────────────────────
 * Le volet hauts faits pèse ~2 000 entrées, chacune traînant son arbre de
 * critères. Multiplié par un roster entier gardé six heures en cache, ça
 * devient lourd pour rien. On en extrait donc à la lecture la seule forme utile
 * — quels critères manquent, sous forme d'identifiants — et on jette le brut.
 */

// Un profil ne bouge pas assez vite pour justifier mieux
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Un profil qu'on n'a PAS réussi à lire se garde beaucoup moins longtemps.
 *
 * Six heures sur un échec, c'est six heures de `/que-faire` sans objectif pour
 * une panne d'API de trente secondes. C'est aussi ce qui rendait fausse la
 * promesse faite à l'écran d'aide — « relance la commande, le changement est
 * pris en compte dans les minutes qui suivent » — puisqu'un joueur qui venait
 * d'ouvrir son profil restait bloqué sur le refus mis en cache.
 */
const TTL_ECHEC_MS = 10 * 60 * 1000;

// Une lecture ratée pour cause de panne mérite une seconde chance immédiate ;
// un refus assumé (403) ou un personnage absent (404) n'en méritent aucune.
const REESSAIS = 1;

// Un haut fait à un seul critère n'a rien à raconter : il est fait ou il ne
// l'est pas, et c'est le résolveur « haut fait simple » qui s'en occupe.
const CRITERES_MINIMUM = 2;

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
  for (let essai = 0; essai <= REESSAIS; essai++) {
    try {
      return await blizzardGet(settings, endpoint, 'profile');
    } catch (err) {
      // Un refus est une réponse, pas une panne : inutile d'insister
      if (err instanceof BlizzardError && (err.status === 403 || err.status === 404)) {
        return { _refus: err.status };
      }
      if (essai === REESSAIS) {
        console.warn(`[progression] ${endpoint} injoignable : ${err.message}`);
        return null;
      }
    }
  }
  return null;
}

/**
 * Réduit le volet hauts faits à ce qui sert vraiment.
 *
 * Deux formes de progression cohabitent dans l'API :
 *   - une liste de sous-critères cochables (« 19 zones sur 20 ») → `manquants`
 *   - un simple compteur qui grimpe (« 62 000 po sur 100 000 ») → `quantite`
 *
 * @returns {{obtenus: Set<number>, candidats: object[]}}
 */
function reduireHautsFaits(liste) {
  const obtenus = new Set();
  const candidats = [];

  for (const a of liste) {
    if (a.completed_timestamp) { obtenus.add(a.id); continue; }

    const enfants = a.criteria?.child_criteria;
    if (enfants?.length >= CRITERES_MINIMUM) {
      const manquants = enfants.filter(c => !c.is_completed).map(c => c.id);
      if (!manquants.length) continue; // tous cochés mais haut fait pas validé : cas limite, on passe
      candidats.push({
        id: a.id,
        total: enfants.length,
        faits: enfants.length - manquants.length,
        manquants,
      });
    } else if (a.criteria?.amount > 0) {
      candidats.push({ id: a.id, quantite: a.criteria.amount });
    }
  }

  return { obtenus, candidats };
}

/** Meilleurs runs Mythique+ de la saison en cours, à plat. */
async function meilleursRuns(settings, base, mplus) {
  const saison = (mplus?.seasons || []).slice(-1)[0];
  if (!saison) return null;

  const detail = await volet(settings, `${base}/mythic-keystone-profile/season/${saison.id}`);
  if (!detail?.best_runs) return null;

  return detail.best_runs.map(r => ({
    donjon:        r.dungeon?.name,
    donjonId:      r.dungeon?.id,
    niveau:        r.keystone_level,
    dansLeChrono:  r.is_completed_within_time === true,
  }));
}

/**
 * Récupère la progression d'un personnage.
 * @returns {Promise<object>} toujours un objet ; `ok:false` si rien n'est exploitable
 */
async function chargerProgression(settings, membre) {
  const base = `/profile/wow/character/${membre.realm.toLowerCase()}` +
               `/${encodeURIComponent(membre.name.toLowerCase())}`;

  const [fiche, hf, montures, mascottes, jouets, reputations, mplus, quetes] = await Promise.all([
    volet(settings, base),
    volet(settings, `${base}/achievements`),
    volet(settings, `${base}/collections/mounts`),
    volet(settings, `${base}/collections/pets`),
    volet(settings, `${base}/collections/toys`),
    volet(settings, `${base}/reputations`),
    volet(settings, `${base}/mythic-keystone-profile`),
    volet(settings, `${base}/quests/completed`),
  ]);

  // Le volet hauts faits est le socle de tout : sans lui, on ne sait ni ce qui
  // est fait, ni ce qui manque. Le déclarer « lu » alors qu'il est vide donne
  // un profil qui se prétend exploitable et ne contient rien — l'écran affiche
  // alors l'activité nue, instantanément, sans que rien ne signale la panne.
  //
  // On distingue les trois refus, parce qu'ils n'appellent pas la même réponse :
  // la confidentialité se règle côté joueur, l'indisponibilité se règle toute
  // seule, et un personnage introuvable demande un /add.
  if (!hf?.achievements) {
    return {
      ok: false,
      raison: hf?._refus === 403 ? 'prive'
            : hf?._refus === 404 ? 'introuvable'
            : 'indisponible',
      personnage: `${membre.name}-${membre.realm}`,
      discordId: membre.discordId,
    };
  }

  const { obtenus, candidats } = reduireHautsFaits(hf?.achievements || []);

  // Un palier « N réputations exaltées » atteint vaut mieux qu'un décompte
  // maison : on compte quand même nous-mêmes, c'est plus robuste.
  const listeRep = reputations?.reputations || [];
  const exaltees = listeRep
    .filter(r => (r.standing?.value != null && r.standing?.name)
              && /exalt/i.test(r.standing.name)).length;

  return {
    ok: true,
    personnage: `${membre.name}-${membre.realm}`,
    discordId: membre.discordId,

    // Ce qui est acquis — sert au filtrage « déjà fait »
    hautsFaits: hf?.achievements ? obtenus : null,
    quetes:     quetes?.quests ? new Set(quetes.quests.map(q => q.id)) : null,
    montures:   montures?.mounts?.length ?? null,
    mascottes:  mascottes?.pets?.length  ?? null,
    jouets:     jouets?.toys?.length     ?? null,
    exaltees:   reputations?.reputations ? exaltees : null,
    scoreMplus: mplus?.current_mythic_rating?.rating != null
      ? Math.round(mplus.current_mythic_rating.rating) : null,

    // Le niveau d'objet réellement porté, pas la moyenne sac compris : c'est
    // celui-là qui décide de ce que le personnage peut suivre.
    ilvl:   fiche?.equipped_item_level ?? null,
    classe: fiche?.character_class?.name ?? null,
    spe:    fiche?.active_spec?.name ?? null,

    // Ce qui manque — sert à bâtir un objectif nominatif
    candidats,
    monturesIds:  montures?.mounts ? new Set(montures.mounts.map(m => m.mount?.id).filter(Boolean)) : null,
    mascottesIds: mascottes?.pets  ? new Set(mascottes.pets.map(p => p.species?.id).filter(Boolean)) : null,
    reputationsBrutes: listeRep.length ? listeRep.map(r => ({
      id:      r.faction?.id,
      nom:     r.faction?.name,
      palier:  r.standing?.name,
      tier:    r.standing?.tier,
      valeur:  r.standing?.value,
      max:     r.standing?.max,
    })) : null,
    mplusRuns: await meilleursRuns(settings, base, mplus),

    chargeLe: new Date().toISOString(),
  };
}

/**
 * Progression du joueur derrière une interaction Discord, avec cache.
 * Retourne toujours un objet exploitable, jamais une exception.
 *
 * @param {object} settings
 * @param {string} discordId
 * @param {{frais?: boolean}} [options] `frais` force la relecture (passe de suivi)
 */
async function progressionDe(settings, discordId, options = {}) {
  const membre = membreDepuisDiscord(settings, discordId);
  if (!membre) return { ok: false, raison: 'non-enregistre', discordId };

  const cle = `${membre.realm}/${membre.name}`.toLowerCase();
  if (!options.frais) {
    const enCache = cache.get(cle);
    if (enCache && Date.now() < enCache.expiresAt) return enCache.progress;
  }

  let progress;
  try {
    progress = await chargerProgression(settings, membre);
  } catch (err) {
    console.warn(`[progression] ${membre.name} : ${err.message}`);
    progress = { ok: false, raison: 'erreur', discordId };
  }

  // On met même les refus en cache — inutile de retaper toutes les 5 secondes —
  // mais bien moins longtemps : un échec doit pouvoir se réparer dans la séance.
  cache.set(cle, {
    progress,
    expiresAt: Date.now() + (progress.ok ? TTL_MS : TTL_ECHEC_MS),
  });
  return progress;
}

/** Vide le cache (utile après un /add ou un changement de personnage). */
progressionDe.vider = () => cache.clear();

module.exports = { progressionDe, membreDepuisDiscord };
