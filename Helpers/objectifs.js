'use strict';

/**
 * Fabrique d'objectifs concrets.
 *
 * Une activité du catalogue reste volontairement large (« Chasse aux rares d'une
 * zone »). Ce module la transforme en cible nominative en lisant le profil du
 * joueur : quel haut fait est presque bouclé, quel critère précis manque, à
 * combien de points d'un palier de réputation il se trouve, quel donjon de la
 * saison il n'a jamais timé.
 *
 * ── Règle non négociable ──────────────────────────────────────────────
 * Tout ce qui sort d'ici est **vérifié auprès de l'API Blizzard**. Les noms
 * propres (« Griseveille », « Exploration de Tornheim ») viennent de la
 * définition officielle du haut fait, localisée en français. Le rédacteur IA,
 * en aval, ne reçoit que ces faits et n'a pas le droit d'en inventer d'autres :
 * voir `faitsAutorises`, la liste blanche qu'on lui transmet.
 *
 * ── Contrat de sortie ─────────────────────────────────────────────────
 * Chaque résolveur renvoie `null` (rien de pertinent à proposer) ou :
 *   {
 *     type            identifiant du résolveur
 *     cible           l'objectif en une ligne, nom officiel
 *     contexte        la description Blizzard, s'il y en a une
 *     progression     « 19/20 », « 247 sur 1669 »… ou null
 *     etapes          faits vérifiés à accomplir, déjà nommés
 *     recompense      ce que ça rapporte, si l'API le dit
 *     preuve          critère surveillé pour féliciter le joueur plus tard
 *     faitsAutorises  liste blanche de noms propres pour le rédacteur IA
 *   }
 *
 * `preuve` reprend le vocabulaire de `estFait()` dans activities.js et l'étend
 * de deux formes propres au suivi différé (palier de réputation, niveau de clé
 * Mythique+). Le juge, lui, est unique : `preuveTenue()` dans objectifsSuivi.js.
 */

const { blizzardGet } = require('./blizzardApi');
const hautsFaitsIndex = require('./hautsFaitsIndex');

// Combien de sous-critères manquants on cite au plus. Au-delà, la liste cesse
// d'être un objectif et redevient une corvée.
const ETAPES_MAX = 6;

// On tire parmi les meilleurs candidats plutôt que de toujours servir le
// premier : deux `/que-faire` d'affilée ne doivent pas donner la même cible.
const VIVIER = 5;

// Combien de candidats on accepte de sonder avant d'abandonner. Chaque sondage
// coûte un appel de définition, et certains hauts faits n'ont pas de libellés
// de critères exploitables.
const SONDAGES_MAX = 5;

// Paliers des hauts faits de collection. Ce sont ceux du jeu, pas des ronds de
// notre invention : c'est ce qui permet à `preuve` d'être réellement vérifiable.
const PALIERS = [25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1250, 1500];

// Exalté est le dernier palier de réputation classique.
const TIER_EXALTE = 7;

// Part de la barre déjà remplie en deçà de laquelle une réputation ne fait pas
// un objectif honnête, quel que soit le palier atteint.
const AVANCEMENT_MINIMUM = 0.4;

// Pistes de collection : on en sonde une douzaine pour en retenir trois, le
// tri par provenance en écartant une bonne part.
const PISTES_SONDEES = 12;
const PISTES_MAX     = 3;

const catalogues = new Map(); // 'montures' | 'mascottes' → [{ id, nom }]

/** Tire un élément au hasard dans une liste. */
const auHasard = liste => liste[Math.floor(Math.random() * liste.length)];

/** Tire parmi les `n` premiers d'une liste déjà triée. */
const parmiLesMeilleurs = (liste, n = VIVIER) => auHasard(liste.slice(0, Math.max(1, n)));

/** Prochain palier de collection strictement au-dessus de `n`. */
const prochainPalier = n => PALIERS.find(p => p > n) ?? null;

// ── Hauts faits ────────────────────────────────────────────────────────

/**
 * Le cheval de bataille : un haut fait entamé mais pas terminé, dont on nomme
 * les sous-critères qui manquent.
 *
 * Les candidats sont triés par avancement décroissant — un haut fait à 19/20
 * fait un bien meilleur objectif du soir qu'un 2/50. On tire ensuite dans le
 * haut du panier pour garder de la variété d'un tirage à l'autre.
 */
async function hautFaitCriteres(settings, progress, opts = {}) {
  const passe = hautsFaitsIndex.filtreCategories(settings, opts.categories);

  const candidats = (progress.candidats || [])
    .filter(c => c.manquants?.length && passe(c.id))
    .sort((a, b) => (b.faits / b.total) - (a.faits / a.total));

  if (!candidats.length) return null;

  // Le vivier rétrécit à chaque tentative infructueuse pour ne pas repiocher
  // indéfiniment le même haut fait sans libellés.
  const dejaVus = new Set();
  for (let essai = 0; essai < SONDAGES_MAX; essai++) {
    const restants = candidats.filter(c => !dejaVus.has(c.id));
    if (!restants.length) return null;

    const choix = parmiLesMeilleurs(restants);
    dejaVus.add(choix.id);

    const def = await hautsFaitsIndex.definition(settings, choix.id);
    if (!def?.criteres?.size) continue;

    const etapes = choix.manquants
      .map(id => def.criteres.get(id))
      .filter(Boolean)
      .slice(0, ETAPES_MAX);

    if (!etapes.length) continue; // critères sans libellé : inexploitable

    const reste = choix.manquants.length - etapes.length;

    return {
      type: 'hautFaitCriteres',
      cible: def.name,
      contexte: def.description,
      progression: `${choix.faits}/${choix.total}`,
      etapes,
      reste: reste > 0 ? reste : 0,
      recompense: def.recompense,
      preuve: { achievement: choix.id },
      faitsAutorises: [def.name, ...etapes],
    };
  }

  return null;
}

/**
 * Repli du précédent : un haut fait à compteur (« amasser 100 000 pièces d'or »),
 * dont on connaît l'avancement mais pas le détail.
 */
async function hautFaitQuantite(settings, progress, opts = {}) {
  const passe = hautsFaitsIndex.filtreCategories(settings, opts.categories);

  const candidats = (progress.candidats || [])
    .filter(c => c.quantite > 0 && passe(c.id))
    .sort((a, b) => b.quantite - a.quantite);

  if (!candidats.length) return null;

  const dejaVus = new Set();
  for (let essai = 0; essai < SONDAGES_MAX; essai++) {
    const restants = candidats.filter(c => !dejaVus.has(c.id));
    if (!restants.length) return null;

    const choix = parmiLesMeilleurs(restants);
    dejaVus.add(choix.id);

    const def = await hautsFaitsIndex.definition(settings, choix.id);
    if (!def?.name) continue;

    return {
      type: 'hautFaitQuantite',
      cible: def.name,
      contexte: def.description,
      progression: `${choix.quantite} déjà au compteur`,
      etapes: [],
      reste: 0,
      recompense: def.recompense,
      preuve: { achievement: choix.id },
      faitsAutorises: [def.name],
    };
  }

  return null;
}

// ── Réputation ─────────────────────────────────────────────────────────

const PALIERS_REPUTATION = ['Haï', 'Hostile', 'Inamical', 'Neutre', 'Amical', 'Honoré', 'Révéré', 'Exalté'];

/**
 * La faction la plus proche de son palier suivant.
 *
 * On écarte volontairement les réputations jamais entamées : proposer « monte
 * Gnomeregan à Exalté » à quelqu'un qui n'y a jamais mis les pieds n'est pas un
 * objectif, c'est une punition.
 */
async function reputation(settings, progress) {
  const candidats = (progress.reputationsBrutes || [])
    .filter(r => r.tier != null && r.tier < TIER_EXALTE
              && r.max > 0 && r.valeur > 0 && r.nom);

  if (!candidats.length) return null;

  // Un palier élevé fait un bien meilleur objectif — passer Exalté quand on est
  // Révéré vaut mieux qu'un Neutre → Amical. Mais seulement si la barre est
  // effectivement entamée : « Honoré, 40 points sur 12 000 » est un palier
  // flatteur pour une soirée de farm déguisée en objectif.
  const engages = candidats.filter(r => r.valeur / r.max >= AVANCEMENT_MINIMUM);
  const vivier  = engages.length ? engages : candidats;

  vivier.sort((a, b) => (b.tier - a.tier) || ((b.valeur / b.max) - (a.valeur / a.max)));

  const choix = parmiLesMeilleurs(vivier);
  const restant = choix.max - choix.valeur;
  const suivant = PALIERS_REPUTATION[choix.tier + 1] || 'le palier suivant';

  return {
    type: 'reputation',
    cible: `Passer ${suivant} chez ${choix.nom}`,
    contexte: '',
    progression: `${choix.palier} — ${choix.valeur}/${choix.max}`,
    etapes: [`Gagner ${restant} points de réputation chez ${choix.nom}`],
    reste: 0,
    recompense: '',
    preuve: { reputation: choix.id, tierAuMoins: choix.tier + 1 },
    faitsAutorises: [choix.nom, suivant],
  };
}

// ── Collections ────────────────────────────────────────────────────────

/** Index complet des montures ou mascottes du jeu, téléchargé une fois. */
async function catalogue(settings, quoi) {
  if (catalogues.has(quoi)) return catalogues.get(quoi);

  let liste = [];
  try {
    if (quoi === 'montures') {
      const d = await blizzardGet(settings, '/data/wow/mount/index', 'static');
      liste = (d.mounts || []).map(m => ({ id: m.id, nom: m.name }));
    } else if (quoi === 'mascottes') {
      const d = await blizzardGet(settings, '/data/wow/pet/index', 'static');
      liste = (d.pets || []).map(p => ({ id: p.id, nom: p.name }));
    }
  } catch {
    liste = [];
  }

  catalogues.set(quoi, liste);
  return liste;
}

/**
 * Provenances qu'on ne propose jamais comme objectif.
 *
 * Une monture de boutique ne se farme pas, elle s'achète — l'afficher dans un
 * « voilà ce qu'il te manque » revient à envoyer le joueur à la caisse. Même
 * chose pour les promotions closes et les cartes à collectionner : ce sont des
 * manques définitifs, pas des objectifs.
 *
 * Les valeurs sont celles relevées dans l'API, pas des suppositions :
 *   à garder   DROP · VENDOR · QUEST · ACHIEVEMENT · PROFESSION
 *              WORLDEVENT · TRADINGPOST (le Comptoir se gagne en jouant)
 *   à écarter  PETSTORE · TCG · PROMOTION · COLLECTORS_EDITION
 *
 * Une pièce sans provenance du tout est écartée elle aussi : on n'a rien à en
 * dire, et c'est le plus souvent du contenu retiré du jeu.
 */
const PROVENANCES_EXCLUES = new Set(['PETSTORE', 'TCG', 'PROMOTION', 'COLLECTORS_EDITION']);

/** Provenance d'une pièce de collection, telle que l'API la qualifie. */
async function provenance(settings, quoi, id) {
  const endpoint = quoi === 'montures' ? `/data/wow/mount/${id}`
                 : quoi === 'mascottes' ? `/data/wow/pet/${id}`
                 : null;
  if (!endpoint) return null;

  try {
    const d = await blizzardGet(settings, endpoint, 'static');
    return d.source ? { type: d.source.type, nom: d.source.name } : null;
  } catch {
    return null;
  }
}

/**
 * Objectif de collection : le prochain palier officiel, plus quelques pièces
 * qui manquent réellement, nommées.
 *
 * Le palier est ce qui rend l'objectif vérifiable — une monture précise peut ne
 * jamais tomber, un palier finit toujours par arriver. Les noms cités servent
 * de pistes concrètes, pas de contrat.
 */
async function collection(settings, progress, opts = {}) {
  const quoi = opts.quoi || 'montures';

  const possedes = quoi === 'montures' ? progress.montures
                 : quoi === 'mascottes' ? progress.mascottes
                 : progress.jouets;
  if (possedes == null) return null;

  const cible = prochainPalier(possedes);
  if (!cible) return null;

  const label = quoi === 'montures' ? 'montures' : quoi === 'mascottes' ? 'mascottes' : 'jouets';
  const preuve = quoi === 'montures'  ? { monturesAuMoins: cible }
               : quoi === 'mascottes' ? { mascottesAuMoins: cible }
               : { jouetsAuMoins: cible };

  const etapes = [`Ramener ${cible - possedes} ${label} de plus`];
  const autorises = [];

  // Jouets exclus : l'API ne renvoie pas d'index de jouets exploitable.
  const possedesIds = quoi === 'montures' ? progress.monturesIds : progress.mascottesIds;
  if (possedesIds?.size) {
    const manquantes = (await catalogue(settings, quoi)).filter(e => !possedesIds.has(e.id));

    // On sonde un petit lot d'un coup, puis on ne garde que ce qui s'obtient
    // en jouant. Sonder pièce par pièce coûterait autant et donnerait moins.
    const lot = manquantes.sort(() => Math.random() - 0.5).slice(0, PISTES_SONDEES);
    const sondees = await Promise.all(
      lot.map(async e => ({ ...e, src: await provenance(settings, quoi, e.id) }))
    );

    for (const e of sondees.filter(e => e.src && !PROVENANCES_EXCLUES.has(e.src.type)).slice(0, PISTES_MAX)) {
      etapes.push(e.src.nom ? `${e.nom} — ${e.src.nom}` : e.nom);
      autorises.push(e.nom);
    }
  }

  return {
    type: 'collection',
    cible: `Franchir la barre des ${cible} ${label}`,
    contexte: '',
    progression: `${possedes} ${label}`,
    etapes,
    reste: 0,
    recompense: '',
    preuve,
    faitsAutorises: autorises,
  };
}

// ── Mythique+ ──────────────────────────────────────────────────────────

/**
 * Le donjon de la saison sur lequel le joueur est le plus en retard.
 *
 * Un donjon jamais tenté passe avant un donjon timé bas : c'est le trou le plus
 * visible dans la saison, et le plus satisfaisant à combler.
 */
async function mplusDonjon(settings, progress, opts = {}) {
  const donjons = opts.live?.dungeons || [];
  if (!donjons.length) return null;

  const meilleurs = new Map();
  for (const r of progress.mplusRuns || []) {
    const actuel = meilleurs.get(r.donjon);
    if (!actuel || r.niveau > actuel.niveau) meilleurs.set(r.donjon, r);
  }

  const jamaisFaits = donjons.filter(d => !meilleurs.has(d.name));
  const choix = jamaisFaits.length ? auHasard(jamaisFaits) : null;

  if (choix) {
    return {
      type: 'mplusDonjon',
      cible: `Timer ${choix.name} en Mythique+`,
      contexte: `Aucun passage enregistré cette saison sur ce donjon. Chrono : ${choix.timerMinutes} minutes.`,
      progression: 'jamais tenté cette saison',
      etapes: [
        `Monter un groupe pour ${choix.name}`,
        `Boucler la clé en moins de ${choix.timerMinutes} minutes`,
      ],
      reste: 0,
      recompense: '',
      preuve: { mplusDonjon: choix.name, niveauAuMoins: 2 },
      faitsAutorises: [choix.name],
    };
  }

  // Tous les donjons ont été touchés : on vise celui où le groupe plafonne
  const faible = donjons
    .map(d => ({ donjon: d, run: meilleurs.get(d.name) }))
    .sort((a, b) => a.run.niveau - b.run.niveau)[0];

  const vise = faible.run.niveau + (faible.run.dansLeChrono ? 1 : 0);

  return {
    type: 'mplusDonjon',
    cible: `Passer ${faible.donjon.name} en +${vise}`,
    contexte: faible.run.dansLeChrono
      ? `Meilleur passage cette saison : +${faible.run.niveau} dans le chrono. C'est ton donjon le plus bas.`
      : `Meilleur passage cette saison : +${faible.run.niveau}, hors chrono. Il reste à le timer.`,
    progression: `+${faible.run.niveau} actuellement`,
    etapes: [
      `Reprendre ${faible.donjon.name} au niveau ${vise}`,
      `Rester sous les ${faible.donjon.timerMinutes} minutes`,
    ],
    reste: 0,
    recompense: '',
    preuve: { mplusDonjon: faible.donjon.name, niveauAuMoins: vise },
    faitsAutorises: [faible.donjon.name],
  };
}

// ── Groupe ─────────────────────────────────────────────────────────────

/**
 * L'objectif qui manque au plus grand nombre.
 *
 * On croise les profils lisibles de tous les joueurs présents en vocal et on
 * cherche le haut fait entamé par le plus de monde. C'est ce qui donne au
 * groupe une raison commune de se connecter ce soir plutôt qu'une autre.
 */
async function groupe(settings, profils, opts = {}) {
  const lisibles = profils.filter(p => p?.ok && p.candidats?.length);
  if (lisibles.length < 2) return null;

  const passe = hautsFaitsIndex.filtreCategories(settings, opts.categories);

  // achievementId → { concernes: [progress], avancement: ratio moyen }
  const compte = new Map();
  for (const p of lisibles) {
    for (const c of p.candidats) {
      if (!c.manquants?.length || !passe(c.id)) continue;
      if (!compte.has(c.id)) compte.set(c.id, []);
      compte.get(c.id).push({ profil: p, candidat: c });
    }
  }

  const candidats = [...compte.entries()]
    .map(([id, membres]) => ({
      id,
      membres,
      ratio: membres.reduce((s, m) => s + m.candidat.faits / m.candidat.total, 0) / membres.length,
    }))
    .filter(c => c.membres.length >= 2)
    // D'abord le nombre de concernés, puis l'avancement moyen
    .sort((a, b) => (b.membres.length - a.membres.length) || (b.ratio - a.ratio));

  if (!candidats.length) return null;

  const dejaVus = new Set();
  for (let essai = 0; essai < SONDAGES_MAX; essai++) {
    const restants = candidats.filter(c => !dejaVus.has(c.id));
    if (!restants.length) return null;

    const choix = parmiLesMeilleurs(restants, 3);
    dejaVus.add(choix.id);

    const def = await hautsFaitsIndex.definition(settings, choix.id);
    if (!def?.criteres?.size) continue;

    // On décrit le manque du joueur le moins avancé : c'est lui qui donne le
    // rythme, et personne ne sera laissé sur le quai.
    const retardataire = choix.membres
      .sort((a, b) => (a.candidat.faits / a.candidat.total) - (b.candidat.faits / b.candidat.total))[0];

    const etapes = retardataire.candidat.manquants
      .map(id => def.criteres.get(id))
      .filter(Boolean)
      .slice(0, ETAPES_MAX);

    if (!etapes.length) continue;

    const noms = choix.membres.map(m => m.profil.personnage.split('-')[0]);

    return {
      type: 'groupe',
      cible: def.name,
      contexte: def.description,
      progression: `${choix.membres.length} d'entre vous sur ${profils.length} ne l'ont pas`,
      etapes,
      reste: Math.max(0, retardataire.candidat.manquants.length - etapes.length),
      recompense: def.recompense,
      preuve: { achievement: choix.id },
      concernes: noms,
      faitsAutorises: [def.name, ...etapes, ...noms],
    };
  }

  return null;
}

// ── Aiguillage ─────────────────────────────────────────────────────────

const RESOLVEURS = {
  hautFaitCriteres,
  hautFaitQuantite,
  reputation,
  collection,
  mplusDonjon,
};

/**
 * Construit l'objectif d'une activité pour un joueur donné.
 *
 * L'activité déclare le type d'objectif qui lui va (`activity.objectif`). Si le
 * résolveur ne trouve rien — profil trop avancé, catégorie vide, API muette —
 * on retombe sur un haut fait entamé toutes catégories confondues plutôt que de
 * ne rien proposer. Et si même ça échoue, on renvoie null : l'écran affichera
 * l'activité seule, exactement comme avant.
 *
 * @param {object} settings
 * @param {object} activity   activité brute du catalogue
 * @param {object} progress   progression du joueur
 * @param {{live?: object}} [contexte]
 * @returns {Promise<object|null>}
 */
async function pourActivite(settings, activity, progress, contexte = {}) {
  if (!progress?.ok) return null;

  const crochet = activity.objectif;
  if (!crochet) return null;

  const opts = { ...crochet, live: contexte.live };

  try {
    const resolveur = RESOLVEURS[crochet.type];
    if (resolveur) {
      const objectif = await resolveur(settings, progress, opts);
      if (objectif) return { ...objectif, activite: activity.id };
    }

    // Repli maison : un haut fait entamé, sans contrainte de catégorie
    const secours = await hautFaitCriteres(settings, progress, {});
    return secours ? { ...secours, activite: activity.id, parDefaut: true } : null;
  } catch (err) {
    console.warn(`[objectifs] ${activity.id} : ${err.message}`);
    return null;
  }
}

/**
 * Objectif commun à plusieurs joueurs, pour le mode groupe.
 * Retombe sur l'objectif individuel du meneur si le croisement ne donne rien.
 */
async function pourGroupe(settings, activity, profils, contexte = {}) {
  const meneur = profils[0];

  try {
    const commun = await groupe(settings, profils, { categories: activity.objectif?.categories });
    if (commun) return { ...commun, activite: activity.id };
  } catch (err) {
    console.warn(`[objectifs] groupe ${activity.id} : ${err.message}`);
  }

  return pourActivite(settings, activity, meneur, contexte);
}

module.exports = { pourActivite, pourGroupe, PALIERS_REPUTATION };
