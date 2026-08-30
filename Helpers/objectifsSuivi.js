'use strict';

/**
 * Mémoire des objectifs pris, et félicitations quand ils tombent.
 *
 * C'est ce qui sépare une suggestion d'un défi : le bot se souvient de ce qu'il
 * a proposé, revient vérifier tous les matins, et le dit à la guilde quand
 * quelqu'un est allé au bout.
 *
 * Rien n'est enregistré au tirage : il faut que le joueur clique « Je le
 * prends ». Une idée qu'on regarde et qu'on relance n'a pas à devenir une dette,
 * et un objectif qu'on n'a pas choisi n'a aucune valeur.
 *
 * Un seul objectif en cours par membre — le dernier pris remplace le précédent,
 * et le joueur en est averti sur le moment.
 *
 * ── Vérification différée ─────────────────────────────────────────────
 * L'objectif est stocké avec sa `preuve` : le critère mesurable qui dit qu'il
 * est accompli. Le vocabulaire prolonge celui de `estFait()` dans activities.js
 * (achievement, monturesAuMoins…) avec deux formes propres au suivi :
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

// Au-delà, on considère que l'objectif est abandonné et on cesse de le sonder.
const PEREMPTION_JOURS = 90;

// Le palmarès n'a pas vocation à grossir indéfiniment.
const HISTORIQUE_MAX = 200;

const VIDE = { encours: {}, faits: [] };

// ── Persistance ────────────────────────────────────────────────────────

function lire(settings) {
  try {
    const brut = JSON.parse(fs.readFileSync(settings.objectifsFilePath, 'utf8'));
    return { encours: brut.encours || {}, faits: brut.faits || [] };
  } catch {
    return { ...VIDE, encours: {}, faits: [] };
  }
}

function ecrire(settings, data) {
  try {
    fs.mkdirSync(path.dirname(settings.objectifsFilePath), { recursive: true });
    fs.writeFileSync(settings.objectifsFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[objectifs] écriture impossible : ${err.message}`);
  }
}

/**
 * Enregistre l'objectif qu'un membre vient de prendre.
 * On ne garde que ce qui sert à vérifier et à raconter — pas la prose de l'IA,
 * qui sera de toute façon régénérée à l'annonce. La fiche Wowhead en fait
 * partie : l'annonce tombe des semaines plus tard, dans un autre salon, et le
 * résolveur qui savait la construire n'est plus dans le décor à ce moment-là.
 */
function noter(settings, discordId, objectif, activity, progress) {
  if (!objectif?.preuve) return;

  const data = lire(settings);
  data.encours[discordId] = {
    activite:    activity.id,
    titreActivite: activity.titre,
    type:        objectif.type,
    cible:       objectif.cible,
    progression: objectif.progression || null,
    etapes:      objectif.etapes || [],
    preuve:      objectif.preuve,
    lien:        objectif.lien || null,
    personnage:  progress?.personnage || null,
    priseLe:     new Date().toISOString(),
  };
  ecrire(settings, data);
}

/** L'objectif en cours d'un membre, ou null. */
function enCours(settings, discordId) {
  return lire(settings).encours[discordId] || null;
}

/** Retire l'objectif en cours d'un membre (abandon volontaire). */
function abandonner(settings, discordId) {
  const data = lire(settings);
  if (!data.encours[discordId]) return false;
  delete data.encours[discordId];
  ecrire(settings, data);
  return true;
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

/** L'objectif est-il trop vieux pour qu'on continue à le sonder ? */
function perime(entree) {
  const pris = Date.parse(entree.priseLe);
  if (Number.isNaN(pris)) return true;
  return Date.now() - pris > PEREMPTION_JOURS * 24 * 60 * 60 * 1000;
}

// ── Annonce ────────────────────────────────────────────────────────────

/**
 * Le nom de la cible, cliquable quand on connaît sa fiche.
 *
 * Les objectifs pris avant l'arrivée des liens n'en ont pas, et il en traîne
 * dans le fichier pour des semaines : ils s'affichent alors exactement comme
 * avant, en gras. Un objectif dont la cible n'a pas de fiche — l'équipement —
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
    .setTitle('🏆 Objectif bouclé !')
    .setDescription(
      `<@${discordId}> a terminé ${nomCible(entree)}.\n` +
      `Objectif pris il y a ${jours} jour${jours > 1 ? 's' : ''} sur *${entree.titreActivite}*.`
    );

  if (entree.personnage) {
    embed.setFooter({ text: `${entree.personnage} · relance /que-faire pour le prochain` });
  }

  return embed;
}

/**
 * Passe de vérification : relit les profils concernés et félicite.
 * @returns {Promise<number>} nombre d'objectifs validés
 */
async function verifier(bot) {
  const settings = bot.settings;
  const data = lire(settings);
  const ids = Object.keys(data.encours);
  if (!ids.length) return 0;

  let valides = 0;
  let modifie = false;

  for (const discordId of ids) {
    const entree = data.encours[discordId];

    if (perime(entree)) {
      delete data.encours[discordId];
      modifie = true;
      continue;
    }

    // Lecture fraîche imposée : le cache de six heures ne suffit pas ici
    const progress = await progressionDe(settings, discordId, { frais: true });
    if (!preuveTenue(entree.preuve, progress)) continue;

    delete data.encours[discordId];
    data.faits.unshift({ discordId, ...entree, boucleLe: new Date().toISOString() });
    data.faits = data.faits.slice(0, HISTORIQUE_MAX);
    modifie = true;
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

  if (modifie) ecrire(settings, data);
  if (valides) console.log(`[objectifs] ${valides} objectif(s) bouclé(s) annoncé(s)`);
  return valides;
}

/** Programme la passe quotidienne. */
function planifier(bot) {
  const config = bot.settings.objectifsSchedule;
  console.log(`[objectifs] vérification ${libelleSchedule(config)}`);
  return planifierHebdo(config, () => verifier(bot), 'objectifs');
}

module.exports = { noter, enCours, abandonner, verifier, planifier, preuveTenue };
