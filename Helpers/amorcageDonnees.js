'use strict';

/**
 * Préparation du dossier de données, au démarrage.
 *
 * Un conteneur est recréé à chaque redémarrage. Tout ce que le bot écrit
 * ailleurs que sur un volume monté repart avec lui : les quêtes prises, le
 * roster, les caches. C'est ce qui vidait le journal de tout le monde à chaque
 * redéploiement, sans que rien ne le signale.
 *
 * Ce module ne persiste rien par lui-même, c'est le volume de l'hébergeur qui
 * s'en charge. Il fait trois choses, dans cet ordre :
 *
 *   1. il crée le dossier de données s'il n'existe pas encore ;
 *   2. il y recopie les graines du dépôt (`data/graines/`) pour les seuls
 *      fichiers qui manquent. Un fichier déjà présent n'est jamais écrasé, sans
 *      quoi le premier déploiement venu ramènerait le roster d'il y a six mois ;
 *   3. il dit à voix haute où tout cela vit, et se plaint bruyamment s'il tourne
 *      en conteneur sans volume. C'est le contrôle qui manquait : un montage
 *      oublié se constatait une semaine plus tard, quand quelqu'un s'étonnait
 *      d'avoir perdu ses quêtes.
 */

const fs = require('fs');
const path = require('path');

// Les graines vivent dans le dépôt et n'en sortent jamais. Ce sont des états de
// départ, pas des sauvegardes : elles ne sont lues qu'une fois, quand la cible
// n'existe pas encore.
const GRAINES = path.join(__dirname, '..', 'data', 'graines');

// Les fichiers que le bot tient à jour, dans l'ordre où on aime les lire.
const FICHIERS = [
  'membersFilePath',
  'altsFilePath',
  'guildInfoFilePath',
  'eventsFilePath',
  'wowSeasonFilePath',
  'hautsFaitsFilePath',
  'objectifsFilePath',
];

/** Tourne-t-on dans un conteneur dont le disque disparaît au redémarrage ? */
function enConteneur() {
  return !!(process.env.RAILWAY_ENVIRONMENT_NAME
         || process.env.RAILWAY_PROJECT_ID
         || process.env.RENDER
         || process.env.FLY_APP_NAME
         || process.env.DYNO);
}

/** Recopie la graine si la cible manque. Renvoie true si quelque chose a été fait. */
function amorcer(cible) {
  const graine = path.join(GRAINES, path.basename(cible));
  if (!fs.existsSync(graine)) return false;

  // Même dossier de part et d'autre : on est en local, il n'y a rien à recopier
  if (path.resolve(graine) === path.resolve(cible)) return false;

  fs.copyFileSync(graine, cible);
  return true;
}

/**
 * Crée le dossier de données, amorce ce qui manque, et rend son rapport.
 * @returns {{dossier: string, persistant: boolean, amorces: string[]}}
 */
function preparer(settings) {
  const dossier = settings.dataDir;
  const persistant = !!settings.volumeMonte;

  fs.mkdirSync(dossier, { recursive: true });

  const presents = [];
  const amorces  = [];
  const neufs    = [];

  for (const cle of FICHIERS) {
    const cible = settings[cle];
    if (!cible) continue;

    fs.mkdirSync(path.dirname(cible), { recursive: true });

    const nom = path.basename(cible);
    if (fs.existsSync(cible))   presents.push(nom);
    else if (amorcer(cible))    amorces.push(nom);
    else                        neufs.push(nom);
  }

  // Le roster est le seul fichier qu'on refuse de laisser absent : la moitié du
  // bot le lit sans se demander s'il existe.
  if (!fs.existsSync(settings.membersFilePath)) {
    fs.writeFileSync(settings.membersFilePath, '[]', 'utf8');
  }

  console.log(`📁 Données dans ${dossier}`);
  if (presents.length) console.log(`   déjà là  : ${presents.join(', ')}`);
  if (amorces.length)  console.log(`   amorcés  : ${amorces.join(', ')}`);
  if (neufs.length)    console.log(`   à créer  : ${neufs.join(', ')}`);

  if (enConteneur() && !persistant) {
    console.error(
      '🚨 Aucun volume persistant monté. Ce dossier est recréé à chaque\n' +
      '   redémarrage : les quêtes prises, le roster et les caches seront\n' +
      '   perdus. Monte un volume et relance, ou règle DATA_DIR sur son chemin.'
    );
  } else if (!persistant) {
    console.log('   (dossier du dépôt, hors conteneur : le disque est déjà persistant)');
  }

  return { dossier, persistant, amorces };
}

module.exports = { preparer, enConteneur };
