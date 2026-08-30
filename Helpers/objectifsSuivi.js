'use strict';

/**
 * Journal des quêtes prises, et félicitations quand elles tombent.
 *
 * C'est ce qui sépare une suggestion d'un défi : le bot se souvient de ce qu'il
 * a proposé, revient vérifier tous les matins, et le dit à la guilde quand
 * quelqu'un est allé au bout.
 *
 * Rien n'est enregistré au tirage : il faut que le joueur clique « Je le
 * prends ». Une idée qu'on regarde et qu'on relance n'a pas à devenir une dette,
 * et un objectif qu'on n'a pas choisi n'a aucune valeur.
 *
 * Un membre peut mener plusieurs quêtes de front, dans la limite de
 * `JOURNAL_MAX`. Le plafond n'est pas là pour économiser quoi que ce soit — la
 * passe quotidienne lit **un profil par membre**, pas un par quête, et tester
 * cinq preuves sur le même profil est gratuit. Il est là parce qu'un journal
 * qu'on ne peut plus lire d'un coup d'œil cesse d'être un journal, et parce
 * qu'une quête qu'on a oublié avoir prise ne motive personne.
 *
 * ── Vérification différée ─────────────────────────────────────────────
 * Chaque quête est stockée avec sa `preuve` : le critère mesurable qui dit
 * qu'elle est accomplie. Le vocabulaire prolonge celui de `estFait()` dans
 * activities.js (achievement, monturesAuMoins…) avec deux formes propres au
 * suivi :
 *   { reputation: 54, tierAuMoins: 5 }        palier de réputation atteint
 *   { mplusDonjon: 'Repos des rois', niveauAuMoins: 8 }
 *   { ilvlAuMoins: 260 }                      niveau d'objet équipé atteint
 *
 * La passe quotidienne relit les profils **sans passer par le cache** : un cache
 * de six heures suffit pour un tirage, pas pour constater un exploit.
 */

const fs = require('fs');
const path = require('path');

const { EmbedBuilder } = require('discord.js');

const { progressionDe } = require('./characterProgress');
const { planifierHebdo, libelleSchedule } = require('./scheduler');

// Au-delà, on considère que la quête est abandonnée et on cesse de la sonder.
const PEREMPTION_JOURS = 90;

// Le palmarès détaillé n'a pas vocation à grossir indéfiniment.
const HISTORIQUE_MAX = 200;

// Combien de quêtes un membre peut mener de front.
const JOURNAL_MAX = 5;

// ── Persistance ────────────────────────────────────────────────────────

/** Un identifiant court et stable, pour désigner une quête dans un bouton. */
function nouvelId(existants) {
  let id;
  do { id = Math.random().toString(36).slice(2, 8); } while (existants.has(id));
  return id;
}

/**
 * Le journal d'un membre, remis en forme.
 *
 * Deux réparations silencieuses au passage. Le suivi n'a longtemps gardé qu'une
 * quête par membre, rangée directement sous son identifiant : ces entrées-là
 * sont réenveloppées dans un tableau plutôt que jetées — quelqu'un a cliqué
 * « Je le prends » pour de bon, ce n'est pas à nous de l'oublier. Et celles qui
 * n'ont pas d'identifiant en reçoivent un, sans quoi aucun bouton ne pourrait
 * les désigner.
 */
function normaliserJournal(valeur) {
  const liste = (Array.isArray(valeur) ? valeur : [valeur]).filter(e => e?.preuve);
  const pris = new Set(liste.map(e => e.id).filter(Boolean));

  return liste.map(e => {
    if (e.id) return e;
    const id = nouvelId(pris);
    pris.add(id);
    return { ...e, id };
  });
}

/** Total de quêtes bouclées par membre, reconstruit depuis l'historique. */
function compter(faits) {
  const totaux = {};
  for (const f of faits) {
    if (f?.discordId) totaux[f.discordId] = (totaux[f.discordId] || 0) + 1;
  }
  return totaux;
}

function lire(settings) {
  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(settings.objectifsFilePath, 'utf8'));
  } catch {
    return { encours: {}, faits: [], totaux: {} };
  }

  const encours = {};
  for (const [discordId, valeur] of Object.entries(brut.encours || {})) {
    const journal = normaliserJournal(valeur);
    if (journal.length) encours[discordId] = journal;
  }

  const faits = Array.isArray(brut.faits) ? brut.faits : [];

  // Le total à vie ne se recompte pas depuis `faits` : l'historique détaillé est
  // plafonné, et le recompter ferait maigrir le palmarès de ceux qui jouent le
  // plus, à mesure que leurs vieilles réussites sortent de la liste. On le tient
  // donc à part, et on ne le reconstruit que s'il n'existe pas encore.
  const totaux = brut.totaux || compter(faits);

  return { encours, faits, totaux };
}

function ecrire(settings, data) {
  try {
    fs.mkdirSync(path.dirname(settings.objectifsFilePath), { recursive: true });
    fs.writeFileSync(settings.objectifsFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[objectifs] écriture impossible : ${err.message}`);
  }
}

// ── Journal ────────────────────────────────────────────────────────────

/**
 * Ajoute une quête au journal d'un membre.
 *
 * On garde ce qui sert à vérifier et à raconter — pas la prose de l'IA, qui
 * sera de toute façon régénérée. La fiche Wowhead, elle, fait partie du lot :
 * l'annonce tombe des semaines plus tard, dans un autre salon, et le résolveur
 * qui savait la construire n'est plus dans le décor à ce moment-là.
 *
 * @returns {{ok: true, entree: object, total: number, reste: number}
 *          |{ok: false, raison: 'non-verifiable'|'doublon'|'plafond', entree?: object}}
 */
function noter(settings, discordId, objectif, activity, progress) {
  if (!objectif?.preuve) return { ok: false, raison: 'non-verifiable' };

  const data = lire(settings);
  const journal = data.encours[discordId] || [];

  // Deux fois la même preuve, c'est deux fois la même quête : elles tomberaient
  // le même matin et le palmarès compterait double pour un seul effort.
  const empreinte = JSON.stringify(objectif.preuve);
  const doublon = journal.find(e => JSON.stringify(e.preuve) === empreinte);
  if (doublon) return { ok: false, raison: 'doublon', entree: doublon };

  if (journal.length >= JOURNAL_MAX) return { ok: false, raison: 'plafond' };

  const entree = {
    id:            nouvelId(new Set(journal.map(e => e.id))),
    activite:      activity.id,
    titreActivite: activity.titre,
    type:          objectif.type,
    cible:         objectif.cible,
    contexte:      objectif.contexte || null,
    progression:   objectif.progression || null,
    etapes:        objectif.etapes || [],
    recompense:    objectif.recompense || null,
    preuve:        objectif.preuve,
    lien:          objectif.lien || null,
    personnage:    progress?.personnage || null,
    priseLe:       new Date().toISOString(),
  };

  data.encours[discordId] = [...journal, entree];
  ecrire(settings, data);

  return {
    ok: true,
    entree,
    total: journal.length + 1,
    reste: JOURNAL_MAX - journal.length - 1,
  };
}

/** Les quêtes en cours d'un membre, de la plus ancienne à la plus récente. */
function enCours(settings, discordId) {
  return lire(settings).encours[discordId] || [];
}

/**
 * Retire une quête du journal (abandon volontaire).
 * @returns {object|null} la quête abandonnée, ou null si elle n'y était plus.
 */
function abandonner(settings, discordId, id) {
  const data = lire(settings);
  const journal = data.encours[discordId] || [];

  const entree = journal.find(e => e.id === id);
  if (!entree) return null;

  const reste = journal.filter(e => e.id !== id);
  if (reste.length) data.encours[discordId] = reste;
  else delete data.encours[discordId];

  ecrire(settings, data);
  return entree;
}

// ── Classement ─────────────────────────────────────────────────────────

/**
 * Le palmarès de la guilde : le podium du mois en cours, et le total à vie.
 *
 * Les deux ne mesurent pas la même chose, et c'est voulu. Le mois se remet à
 * zéro, donc un nouveau venu peut y gagner dès sa première semaine ; le total
 * à vie récompense l'endurance et ne bouge jamais à la baisse.
 */
function classement(settings) {
  const data = lire(settings);

  const debut = new Date();
  debut.setDate(1);
  debut.setHours(0, 0, 0, 0);

  const duMois = new Map();
  for (const f of data.faits) {
    const quand = Date.parse(f.boucleLe);
    if (Number.isNaN(quand) || quand < debut.getTime()) continue;
    duMois.set(f.discordId, (duMois.get(f.discordId) || 0) + 1);
  }

  const trier = (entrees) => [...entrees]
    .map(([discordId, n]) => ({ discordId, n }))
    .filter(l => l.discordId && l.n > 0)
    .sort((a, b) => b.n - a.n);

  return {
    libelleMois: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(debut),
    mois: trier(duMois),
    vie:  trier(Object.entries(data.totaux)),
  };
}

// ── Vérification ───────────────────────────────────────────────────────

/**
 * La preuve est-elle tenue au vu de la progression fraîchement relue ?
 *
 * Dans le doute — donnée absente, profil devenu privé — on répond non. Une
 * félicitation à tort se remarque bien plus qu'une félicitation en retard.
 */
function preuveTenue(preuve, progress) {
  if (!preuve || !progress?.ok) return false;

  const tests = [];

  if (preuve.achievement != null) {
    tests.push(progress.hautsFaits?.has(preuve.achievement) === true);
  }
  if (preuve.quete != null) {
    tests.push(progress.quetes?.has(preuve.quete) === true);
  }
  if (preuve.monturesAuMoins != null) {
    tests.push(progress.montures != null && progress.montures >= preuve.monturesAuMoins);
  }
  if (preuve.mascottesAuMoins != null) {
    tests.push(progress.mascottes != null && progress.mascottes >= preuve.mascottesAuMoins);
  }
  if (preuve.ilvlAuMoins != null) {
    tests.push(progress.ilvl != null && progress.ilvl >= preuve.ilvlAuMoins);
  }
  if (preuve.jouetsAuMoins != null) {
    tests.push(progress.jouets != null && progress.jouets >= preuve.jouetsAuMoins);
  }
  if (preuve.reputation != null && preuve.tierAuMoins != null) {
    const f = (progress.reputationsBrutes || []).find(r => r.id === preuve.reputation);
    tests.push(f?.tier != null && f.tier >= preuve.tierAuMoins);
  }
  if (preuve.mplusDonjon != null && preuve.niveauAuMoins != null) {
    const runs = (progress.mplusRuns || [])
      .filter(r => r.donjon === preuve.mplusDonjon && r.dansLeChrono);
    tests.push(runs.some(r => r.niveau >= preuve.niveauAuMoins));
  }

  return tests.length > 0 && tests.every(Boolean);
}

/** La quête est-elle trop vieille pour qu'on continue à la sonder ? */
function perime(entree) {
  const pris = Date.parse(entree.priseLe);
  if (Number.isNaN(pris)) return true;
  return Date.now() - pris > PEREMPTION_JOURS * 24 * 60 * 60 * 1000;
}

// ── Annonce ────────────────────────────────────────────────────────────

/**
 * Le nom de la cible, cliquable quand on connaît sa fiche.
 *
 * Les quêtes prises avant l'arrivée des liens n'en ont pas, et il en traîne
 * dans le fichier pour des semaines : elles s'affichent alors exactement comme
 * avant, en gras. Une quête dont la cible n'a pas de fiche — l'équipement —
 * passe par le même chemin.
 */
function nomCible(entree) {
  return entree.lien
    ? `**[${entree.cible}](${entree.lien})**`
    : `**${entree.cible}**`;
}

function embedFelicitations(discordId, entree) {
  const jours = Math.max(1, Math.round((Date.now() - Date.parse(entree.priseLe)) / 86400000));

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🏆 Quête bouclée !')
    .setDescription(
      `<@${discordId}> a terminé ${nomCible(entree)}.\n` +
      `Quête prise il y a ${jours} jour${jours > 1 ? 's' : ''} sur *${entree.titreActivite}*.`
    );

  if (entree.personnage) {
    embed.setFooter({ text: `${entree.personnage} · /journal pour voir le reste` });
  }

  return embed;
}

/**
 * Passe de vérification : relit les profils concernés et félicite.
 *
 * Un membre n'est lu qu'une fois, quel que soit le nombre de quêtes qu'il mène.
 * En revanche chaque quête bouclée a droit à son annonce : trois exploits le
 * même matin, ce sont trois messages, et c'est bien le but.
 *
 * @returns {Promise<number>} nombre de quêtes validées
 */
async function verifier(bot) {
  const settings = bot.settings;
  const data = lire(settings);
  const ids = Object.keys(data.encours);
  if (!ids.length) return 0;

  let valides = 0;
  let modifie = false;

  for (const discordId of ids) {
    const journal = data.encours[discordId];

    const vivantes = journal.filter(e => !perime(e));
    if (vivantes.length !== journal.length) modifie = true;

    if (!vivantes.length) {
      delete data.encours[discordId];
      continue;
    }

    // Lecture fraîche imposée : le cache de six heures ne suffit pas ici
    const progress = await progressionDe(settings, discordId, { frais: true });

    const bouclees  = vivantes.filter(e => preuveTenue(e.preuve, progress));
    const restantes = vivantes.filter(e => !bouclees.includes(e));

    if (restantes.length) data.encours[discordId] = restantes;
    else delete data.encours[discordId];

    if (!bouclees.length) continue;
    modifie = true;

    for (const entree of bouclees) {
      data.faits.unshift({ discordId, ...entree, boucleLe: new Date().toISOString() });
      data.totaux[discordId] = (data.totaux[discordId] || 0) + 1;
      valides++;

      const salonId = settings.objectifsChannelId;
      if (!salonId) continue;

      try {
        const salon = await bot.channels.fetch(salonId);
        await salon.send({ content: `<@${discordId}>`, embeds: [embedFelicitations(discordId, entree)] });
      } catch (err) {
        console.warn(`[objectifs] annonce impossible : ${err.message}`);
      }
    }

    data.faits = data.faits.slice(0, HISTORIQUE_MAX);
  }

  if (modifie) ecrire(settings, data);
  if (valides) console.log(`[objectifs] ${valides} quête(s) bouclée(s) annoncée(s)`);
  return valides;
}

/** Programme la passe quotidienne. */
function planifier(bot) {
  const config = bot.settings.objectifsSchedule;
  console.log(`[objectifs] vérification ${libelleSchedule(config)}`);
  return planifierHebdo(config, () => verifier(bot), 'objectifs');
}

module.exports = {
  noter,
  enCours,
  abandonner,
  classement,
  verifier,
  planifier,
  preuveTenue,
  nomCible,
  JOURNAL_MAX,
};
