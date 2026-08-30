'use strict';

/**
 * Référentiel des hauts faits, rangés par grande catégorie.
 *
 * Le profil d'un personnage dit quels hauts faits il a validés, jamais dans
 * quelle famille ils tombent. Pour qu'une activité « exploration » propose un
 * objectif d'exploration et pas un haut fait de PvP, il faut donc l'information
 * inverse : quels hauts faits appartiennent à quelle catégorie.
 *
 * Blizzard la donne, mais éclatée sur 170 catégories imbriquées, à raison d'un
 * appel chacune. C'est trop pour un tirage, d'où cet index construit une fois,
 * posé sur disque, et rafraîchi avec la veille saison.
 *
 * Les 16 catégories racines couvrent tout le jeu :
 *   96 Quêtes · 97 Exploration · 81 Tours de force · 201 Réputation
 *   95 PvP · 92 Personnages · 168 Donjons et raids · 169 Métiers
 *   155 Évènements mondiaux · 15076 Guilde · 15117 Combats de mascottes
 *   15234 Héritage · 15246 Collections · 15301 Contenu d'extension
 *   15522 Gouffres · 15606 Logis
 *
 * L'absence d'index n'est jamais fatale : les résolveurs retombent alors sur
 * « toutes catégories confondues », ce qui reste exploitable.
 */

const fs = require('fs');
const path = require('path');

const { blizzardGet } = require('./blizzardApi');

// Nombre d'appels menés de front pendant la construction. Blizzard tolère
// largement plus, mais rien ne presse : la construction est hebdomadaire.
const CONCURRENCE = 6;

// Garde-fou contre une boucle dans l'arbre des catégories (jamais vue, mais
// une récursion infinie sur 170 appels réseau se remarquerait tard).
const PROFONDEUR_MAX = 6;

// Combien de temps on tient un échec de définition pour acquis avant de
// retenter. Assez long pour ne pas marteler une API en difficulté, assez court
// pour qu'une panne passagère se répare toute seule.
const ECHEC_TTL_MS = 10 * 60 * 1000;

let memoire = null; // index lu depuis le disque, gardé en RAM

// Définitions déjà téléchargées, clé = identifiant de haut fait.
// Valeur : { def } en cas de succès, { def: null, reessayerApres } en cas d'échec.
const definitions = new Map();

/** Exécute les tâches par petits paquets plutôt que toutes d'un coup. */
async function parPaquets(items, taille, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += taille) {
    out.push(...await Promise.all(items.slice(i, i + taille).map(fn)));
  }
  return out;
}

/**
 * Tous les identifiants de hauts faits d'une catégorie et de ses descendantes.
 * @returns {Promise<number[]>}
 */
async function collecter(settings, categorieId, profondeur = 0) {
  if (profondeur > PROFONDEUR_MAX) return [];

  let cat;
  try {
    cat = await blizzardGet(settings, `/data/wow/achievement-category/${categorieId}`, 'static');
  } catch {
    return []; // une catégorie muette ne doit pas faire tomber l'index entier
  }

  const ids = (cat.achievements || []).map(a => a.id);
  const sous = (cat.subcategories || []).map(s => s.id);

  const enfants = await parPaquets(sous, CONCURRENCE, id => collecter(settings, id, profondeur + 1));
  return ids.concat(...enfants);
}

/**
 * Reconstruit l'index depuis l'API et l'écrit sur disque.
 * @returns {Promise<object|null>} l'index, ou null si la construction a échoué
 */
async function construire(settings) {
  const racine = await blizzardGet(settings, '/data/wow/achievement-category/index', 'static');
  const racines = racine.root_categories || [];
  if (!racines.length) throw new Error('aucune catégorie racine renvoyée');

  const parCategorie = {};
  for (const cat of racines) {
    const ids = await collecter(settings, cat.id);
    // Un même haut fait peut être listé deux fois dans l'arbre
    parCategorie[cat.id] = [...new Set(ids)];
  }

  const index = {
    construitLe: new Date().toISOString(),
    racines: racines.map(c => ({ id: c.id, name: c.name })),
    parCategorie,
  };

  fs.mkdirSync(path.dirname(settings.hautsFaitsFilePath), { recursive: true });
  fs.writeFileSync(settings.hautsFaitsFilePath, JSON.stringify(index), 'utf8');
  memoire = index;

  const total = Object.values(parCategorie).reduce((n, l) => n + l.length, 0);
  console.log(`[hauts-faits] index construit : ${racines.length} catégories, ${total} entrées`);
  return index;
}

/** Lit l'index depuis le disque. Renvoie null s'il n'a jamais été construit. */
function lire(settings) {
  if (memoire) return memoire;
  try {
    memoire = JSON.parse(fs.readFileSync(settings.hautsFaitsFilePath, 'utf8'));
    return memoire;
  } catch {
    return null;
  }
}

/**
 * Construit l'index s'il manque, le laisse tel quel sinon.
 * Appelé au démarrage : un bot qui redémarre ne repaie pas 170 appels.
 */
async function assurer(settings) {
  if (lire(settings)) return memoire;
  try {
    return await construire(settings);
  } catch (err) {
    console.warn(`[hauts-faits] index indisponible : ${err.message}`);
    return null;
  }
}

/**
 * Filtre des identifiants de hauts faits sur une liste de catégories.
 * Sans index ou sans catégorie demandée, on ne filtre pas : mieux vaut un
 * objectif hors thème qu'aucun objectif.
 *
 * @param {object} settings
 * @param {number[]|null} categories  identifiants de catégories racines
 * @returns {(id: number) => boolean}
 */
function filtreCategories(settings, categories) {
  if (!categories?.length) return () => true;

  const index = lire(settings);
  if (!index) return () => true;

  const permis = new Set();
  for (const cat of categories) {
    for (const id of index.parCategorie?.[cat] || []) permis.add(id);
  }
  if (!permis.size) return () => true;

  return id => permis.has(id);
}

/**
 * Définition complète d'un haut fait : nom, description, libellés des critères.
 *
 * C'est ici que les critères prennent un nom. Le profil ne renvoie que des
 * identifiants de critères et leur état ; le libellé français (« Griseveille »)
 * vient de cette définition. Sans elle, on n'a rien à afficher.
 *
 * @returns {Promise<{name, description, recompense, criteres: Map<number,string>}|null>}
 */
async function definition(settings, achievementId) {
  const enCache = definitions.get(achievementId);
  if (enCache !== undefined) {
    // Un succès est définitif : ces données ne bougent qu'aux patchs.
    if (enCache.def) return enCache.def;
    // Un échec ne l'est pas. Une coupure réseau ou un 429 passager suffirait
    // sinon à priver le bot de ce haut fait jusqu'au prochain redémarrage,
    // et si le coup de chaud touche toute une rafale d'appels, c'est le
    // système d'objectifs entier qui reste muet sans qu'on comprenne pourquoi.
    if (Date.now() < enCache.reessayerApres) return null;
  }

  try {
    const brut = await blizzardGet(settings, `/data/wow/achievement/${achievementId}`, 'static');
    const def = {
      id:          brut.id,
      name:        brut.name,
      description: brut.description || '',
      recompense:  brut.reward_description || '',
      criteres:    new Map(
        (brut.criteria?.child_criteria || [])
          .filter(c => c.description)
          .map(c => [c.id, c.description])
      ),
    };
    definitions.set(achievementId, { def });
    return def;
  } catch {
    definitions.set(achievementId, { def: null, reessayerApres: Date.now() + ECHEC_TTL_MS });
    return null;
  }
}

/** Vide les caches mémoire (index et définitions). */
function vider() {
  memoire = null;
  definitions.clear();
}

module.exports = { construire, lire, assurer, filtreCategories, definition, vider };
