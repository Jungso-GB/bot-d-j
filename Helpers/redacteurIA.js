'use strict';

/**
 * Rédaction de la marche à suivre d'un objectif, via OpenRouter.
 *
 * ── Ce que l'IA a le droit de faire ───────────────────────────────────
 * Reformuler des faits déjà établis et y ajouter le « comment s'y rendre » :
 * par où passer, quel portail prendre, dans quel ordre s'y mettre. C'est la
 * seule chose que l'API Blizzard ne sait pas dire — elle donne « Griseveille »
 * mais jamais « au nord-ouest de Tornheim ».
 *
 * ── Ce qu'elle n'a pas le droit de faire ──────────────────────────────
 * Choisir la cible. Elle est déjà choisie, vérifiée, et lui est imposée. Le
 * risque de fabulation est réel : l'extension en cours est plus récente que
 * l'entraînement de la plupart des modèles, et un modèle qui ne sait pas invente
 * volontiers un nom de rare et des coordonnées. La consigne lui demande donc
 * explicitement de rester vague quand il n'est pas sûr — un « cherche du côté du
 * nord de la zone » est utile, un faux nom de PNJ envoie le joueur dans le mur.
 *
 * ── Sans clé ──────────────────────────────────────────────────────────
 * Tout continue de fonctionner : `rediger()` renvoie null et l'appelant affiche
 * les faits bruts, qui se suffisent à eux-mêmes. L'IA est un confort de lecture,
 * jamais une dépendance.
 */

const TIMEOUT_MS = 12000;
const URL = 'https://openrouter.ai/api/v1/chat/completions';

// Plafonds de sécurité sur ce qui revient : on affiche dans un embed Discord,
// et un modèle bavard ne doit pas pouvoir faire exploser la mise en page.
const ACCROCHE_MAX = 320;
const ETAPE_MAX    = 160;
const ETAPES_MAX   = 4;

const CONSIGNE = `Tu écris pour le bot Discord d'une guilde World of Warcraft francophone détendue.

On te donne un objectif de jeu DÉJÀ CHOISI et DÉJÀ VÉRIFIÉ auprès de l'API officielle de Blizzard.
Ta seule mission : le rendre agréable à lire et expliquer comment s'y prendre concrètement.

RÈGLES ABSOLUES
1. Ne change jamais l'objectif, les chiffres de progression, ni les noms fournis.
2. N'invente aucun nom de PNJ, de rare, de boss, d'objet ni de coordonnées.
   Les seuls noms propres de contenu que tu peux écrire sont ceux du champ
   "noms_autorises", plus des lieux du jeu que tu connais avec certitude.
3. L'extension en cours est très récente. Si tu n'es pas certain de l'emplacement
   ou de la méthode, reste volontairement vague ("repère la zone sur la carte",
   "regarde du côté des quêtes de la zone") plutôt que d'inventer une précision.
   Une étape vague et juste vaut mieux qu'une étape précise et fausse.
4. Tutoiement, ton chaleureux et direct, zéro emphase marketing, zéro emoji.
5. Français de France.

FORMAT DE RÉPONSE — un objet JSON, rien d'autre, sans balises de code :
{"accroche": "une ou deux phrases qui donnent envie de s'y mettre ce soir",
 "etapes": ["étape courte et actionnable", "…"]}

Entre 2 et 4 étapes. Chaque étape tient en une ligne.`;

/** Tronque proprement une chaîne trop longue. */
function borner(texte, max) {
  const t = String(texte || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Extrait l'objet JSON d'une réponse, même noyé dans du bavardage. */
function extraireJson(brut) {
  const texte = String(brut || '').trim();
  const debut = texte.indexOf('{');
  const fin   = texte.lastIndexOf('}');
  if (debut === -1 || fin <= debut) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

/** Les faits transmis au modèle — rien de plus que ce qu'on a vérifié. */
function dossier(objectif, activity, live) {
  return {
    activite:        activity.titre,
    objectif:        objectif.cible,
    description:     objectif.contexte || undefined,
    progression:     objectif.progression || undefined,
    reste_a_faire:   objectif.etapes?.length ? objectif.etapes : undefined,
    autres_manquants: objectif.reste ? `${objectif.reste} de plus non listés` : undefined,
    recompense:      objectif.recompense || undefined,
    concernes:       objectif.concernes?.length ? objectif.concernes : undefined,
    saison:          live?.season?.label || undefined,
    extension:       live?.expansion?.name || undefined,
    noms_autorises:  [...new Set(objectif.faitsAutorises || [])],
  };
}

/**
 * Rédige l'accroche et les étapes d'un objectif.
 *
 * @param {object} settings
 * @param {object} objectif  sortie d'un résolveur de Helpers/objectifs.js
 * @param {object} activity  activité rendue (jetons déjà résolus)
 * @param {object|null} live veille saison
 * @returns {Promise<{accroche: string, etapes: string[]}|null>} null = repli sur les faits bruts
 */
async function rediger(settings, objectif, activity, live) {
  const { apiKey, model } = settings.openrouter || {};
  if (!apiKey || !objectif) return null;

  let reponse;
  try {
    reponse = await fetch(URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Recommandé par OpenRouter pour identifier l'appelant
        'X-Title': 'Donjons et Jambons',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: 'system', content: CONSIGNE },
          { role: 'user', content: JSON.stringify(dossier(objectif, activity, live), null, 1) },
        ],
      }),
    });
  } catch (err) {
    console.warn(`[redacteur] appel impossible : ${err.message}`);
    return null;
  }

  if (!reponse.ok) {
    console.warn(`[redacteur] HTTP ${reponse.status} d'OpenRouter`);
    return null;
  }

  let json;
  try {
    json = await reponse.json();
  } catch {
    return null;
  }

  const texte = json?.choices?.[0]?.message?.content;
  const objet = extraireJson(texte);
  if (!objet) {
    console.warn('[redacteur] réponse illisible, repli sur les faits bruts');
    return null;
  }

  const etapes = (Array.isArray(objet.etapes) ? objet.etapes : [])
    .filter(e => typeof e === 'string' && e.trim())
    .slice(0, ETAPES_MAX)
    .map(e => borner(e, ETAPE_MAX));

  const accroche = borner(objet.accroche, ACCROCHE_MAX);

  // Une réponse vide des deux côtés ne vaut pas mieux que pas de réponse
  if (!accroche && !etapes.length) return null;

  return { accroche, etapes };
}

module.exports = { rediger };
