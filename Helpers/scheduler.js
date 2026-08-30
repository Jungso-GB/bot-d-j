'use strict';

/**
 * Planification hebdomadaire à jour et heure fixes.
 *
 * setInterval(24 h) dérive : la tâche se cale sur l'heure de démarrage du bot,
 * et un redéploiement à 3 h du matin la fixe à 3 h du matin. Ici on vise une
 * heure murale, recalculée après chaque exécution : un redémarrage ne décale
 * plus rien, et le changement d'heure est absorbé au passage suivant.
 *
 * Pas de dépendance : le calcul du prochain créneau passe par Intl, qui sait
 * déjà lire l'heure dans un fuseau donné.
 */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// setTimeout plafonne à ~24,8 jours ; on ne dépasse jamais 7 jours ici, mais
// une borne de sécurité évite un débordement silencieux en cas de mauvais réglage.
const MAX_DELAI_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Où en est-on, dans le fuseau demandé ?
 * @returns {{jour: number, minutesDepuisMinuit: number}}
 */
function maintenantDans(timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map(p => [p.type, p.value])
  );

  const index = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  // Intl rend « 24 » pour minuit en hour12:false, à ramener à 0
  const heure = Number(parts.hour) % 24;

  return { jour: index, minutesDepuisMinuit: heure * 60 + Number(parts.minute) };
}

/**
 * Délai en millisecondes jusqu'au prochain créneau.
 * @param {number[]} jours   0 = dimanche … 4 = jeudi
 * @param {number} heure
 * @param {number} minute
 * @param {string} timeZone
 */
function delaiJusquAuProchain(jours, heure, minute, timeZone) {
  const { jour, minutesDepuisMinuit } = maintenantDans(timeZone);
  const cible = heure * 60 + minute;

  let meilleur = Infinity;
  for (const j of jours) {
    let ecartJours = (j - jour + 7) % 7;
    // Créneau du jour déjà passé : ce sera pour la semaine prochaine
    if (ecartJours === 0 && cible <= minutesDepuisMinuit) ecartJours = 7;
    const minutes = ecartJours * 24 * 60 + (cible - minutesDepuisMinuit);
    if (minutes < meilleur) meilleur = minutes;
  }

  // Une minute plancher : on ne veut pas d'un réveil immédiat en boucle
  return Math.min(Math.max(meilleur, 1) * 60 * 1000, MAX_DELAI_MS);
}

/**
 * Délai en millisecondes jusqu'au prochain créneau d'un cycle intra-journalier.
 *
 * Les créneaux sont calés sur l'horloge murale (00h00, 02h00, 04h00…) et non
 * sur l'heure de démarrage du bot. C'est la même raison que pour la version
 * hebdomadaire : un redéploiement à 3h17 ne doit pas condamner la tâche à
 * tourner à 17 de chaque heure paire pour le reste de sa vie.
 *
 * Le jour du changement d'heure, un créneau peut tomber une heure trop tôt ou
 * trop tard : le délai est recalculé après chaque passage, donc l'écart se
 * résorbe au suivant. Sur une tâche qui tourne douze fois par jour, ça n'a pas
 * de conséquence observable.
 *
 * @param {number} heures  écart entre deux passages, en heures
 * @param {number} minute  minute du créneau (0 = pile)
 * @param {string} timeZone
 */
function delaiJusquAuProchainCreneau(heures, minute, timeZone) {
  const { minutesDepuisMinuit } = maintenantDans(timeZone);
  const pas = Math.max(1, Math.round(heures * 60));

  // Le premier multiple strictement après maintenant. S'il tombe au-delà de
  // minuit, le report du lendemain se fait tout seul : on ne manipule que des
  // durées, jamais de dates.
  const k = Math.floor((minutesDepuisMinuit - minute) / pas) + 1;
  const minutes = k * pas + minute - minutesDepuisMinuit;

  return Math.min(Math.max(minutes, 1) * 60 * 1000, MAX_DELAI_MS);
}

/**
 * Lance une tâche à intervalle régulier dans la journée.
 *
 * @param {object} config  { heures, minute, fuseau }
 * @param {Function} tache fonction (éventuellement async) à exécuter
 * @param {string} [nom]   étiquette pour les journaux
 * @returns {{annuler: Function, prochain: Function}}
 */
function planifierIntervalle(config, tache, nom = 'tâche') {
  const { heures = 2, minute = 0, fuseau = 'Europe/Paris' } = config || {};
  let timer = null;

  const programmer = () => {
    const delai = delaiJusquAuProchainCreneau(heures, minute, fuseau);
    const quand = new Date(Date.now() + delai);

    console.log(
      `[planif] ${nom} : prochain passage ${quand.toLocaleString('fr-FR', { timeZone: fuseau })} ` +
      `(dans ${Math.round(delai / 60000)} min)`
    );

    timer = setTimeout(async () => {
      try {
        await tache();
      } catch (err) {
        console.warn(`[planif] ${nom} a échoué : ${err.message}`);
      } finally {
        programmer(); // on replanifie quoi qu'il arrive
      }
    }, delai);

    if (typeof timer.unref === 'function') timer.unref();
  };

  programmer();

  return {
    annuler: () => { if (timer) clearTimeout(timer); timer = null; },
    prochain: () => new Date(Date.now() + delaiJusquAuProchainCreneau(heures, minute, fuseau)),
  };
}

/**
 * Lance une tâche à jour et heure fixes, chaque semaine.
 *
 * @param {object} config  { jours: number[], heure, minute, fuseau }
 * @param {Function} tache fonction (éventuellement async) à exécuter
 * @param {string} [nom]   étiquette pour les journaux
 * @returns {{annuler: Function, prochain: Function}}
 */
function planifierHebdo(config, tache, nom = 'tâche') {
  const { jours = [4], heure = 8, minute = 0, fuseau = 'Europe/Paris' } = config || {};
  let timer = null;

  const programmer = () => {
    const delai = delaiJusquAuProchain(jours, heure, minute, fuseau);
    const quand = new Date(Date.now() + delai);

    console.log(
      `[planif] ${nom} : prochain passage ${quand.toLocaleString('fr-FR', { timeZone: fuseau })} ` +
      `(dans ${Math.round(delai / 3600000)} h)`
    );

    timer = setTimeout(async () => {
      try {
        await tache();
      } catch (err) {
        console.warn(`[planif] ${nom} a échoué : ${err.message}`);
      } finally {
        programmer(); // on replanifie quoi qu'il arrive
      }
    }, delai);

    // Ne pas retenir le processus en vie pour ce seul minuteur
    if (typeof timer.unref === 'function') timer.unref();
  };

  programmer();

  return {
    annuler: () => { if (timer) clearTimeout(timer); timer = null; },
    prochain: () => new Date(Date.now() + delaiJusquAuProchain(jours, heure, minute, fuseau)),
  };
}

/** Libellé lisible d'un réglage, pour les journaux et /que-faire. */
function libelleSchedule(config) {
  // Un réglage par intervalle ne se raconte pas en jours de la semaine
  if (config?.heures) {
    const h = config.heures;
    return `toutes les ${h} heure${h > 1 ? 's' : ''} (${config.fuseau || 'Europe/Paris'})`;
  }

  const { jours = [4], heure = 8, minute = 0, fuseau = 'Europe/Paris' } = config || {};
  const hh = String(heure).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');

  // Les sept jours cochés, c'est une tâche quotidienne : l'énumérer donnerait
  // « chaque dimanche et lundi et mardi et… », que personne ne veut lire.
  const noms = jours.length >= 7
    ? 'jour'
    : jours.map(j => JOURS[j]).reduce((acc, nom, i, liste) =>
        acc + (i === 0 ? '' : i === liste.length - 1 ? ' et ' : ', ') + nom, '');

  return `chaque ${noms} à ${hh}h${mm} (${fuseau})`;
}

module.exports = {
  planifierHebdo,
  planifierIntervalle,
  delaiJusquAuProchain,
  delaiJusquAuProchainCreneau,
  libelleSchedule,
  JOURS,
};
