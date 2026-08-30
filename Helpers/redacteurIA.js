'use strict';

/**
 * Rédaction de la marche à suivre d'un objectif, via OpenRouter.
 *
 * ── Ce que l'IA a le droit de faire ───────────────────────────────────
 * Reformuler des faits déjà établis et y ajouter le « comment s'y rendre » :
 * par où passer, quel portail prendre, dans quel ordre s'y mettre. C'est la
 * seule chose que l'API Blizzard ne sait pas dire : elle donne « Griseveille »
 * mais jamais « au nord-ouest de Tornheim ».
 *
 * ── Ce qu'elle n'a pas le droit de faire ──────────────────────────────
 * Choisir la cible. Elle est déjà choisie, vérifiée, et lui est imposée. Le
 * risque de fabulation est réel : l'extension en cours est plus récente que
 * l'entraînement de la plupart des modèles, et un modèle qui ne sait pas invente
 * volontiers un nom de rare et des coordonnées. La consigne lui demande donc
 * explicitement de rester vague quand il n'est pas sûr : un « cherche du côté du
 * nord de la zone » est utile, un faux nom de PNJ envoie le joueur dans le mur.
 *
 * ── Sans clé ──────────────────────────────────────────────────────────
 * Tout continue de fonctionner : `rediger()` renvoie null et l'appelant affiche
 * les faits bruts, qui se suffisent à eux-mêmes. L'IA est un confort de lecture,
 * jamais une dépendance.
 */

const TIMEOUT_MS = 20000;
const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Budget de sortie, et pourquoi il est si large pour cinq lignes de texte.
 *
 * Le modèle par défaut raisonne avant d'écrire, et ces jetons de raisonnement
 * sont facturés sur le même compteur que la réponse. Avec un plafond serré,
 * la réflexion consomme tout et la réponse revient vide (`finish_reason:
 * "length"`), un échec silencieux qui ressemble à une panne d'API.
 *
 * On coupe donc le raisonnement, qui n'apporte rien à une reformulation de
 * faits déjà établis : mesuré sur deepseek-v4-flash, ça descend de 12 s à 4 s
 * et divise le coût par huit. Le plafond large reste une ceinture de sécurité
 * pour un modèle qui raisonnerait quand même.
 */
const SORTIE_MAX_TOKENS = 1500;

// Plafonds de sécurité sur ce qui revient : on affiche dans un embed Discord,
// et un modèle bavard ne doit pas pouvoir faire exploser la mise en page.
// L'accroche est là pour donner le ton, pas pour raconter l'objectif : les
// étapes juste en dessous le font mieux qu'elle. Une seule phrase, donc, et le
// plafond est assez bas pour qu'un modèle bavard soit coupé plutôt que suivi.
const ACCROCHE_MAX = 150;
const ETAPE_MAX    = 140;
const ETAPES_MAX   = 4;

const CONSIGNE = `Tu es un nain forgeron de World of Warcraft (du clan "Donjons & Jambons"). Réponds toujours en incarnant ce personnage : accent chaleureux et bourru, vocabulaire de nain (camarade, par ma barbe, sacrebleu, forge, bière/hydromel, montagnes, pioche, clan), phrases courtes et directes, un brin bougon mais loyal.

Tu écris pour le bot Discord d'une guilde World of Warcraft francophone détendue.

On te donne un objectif de jeu DÉJÀ CHOISI et DÉJÀ VÉRIFIÉ auprès de l'API officielle de Blizzard.
Ta seule mission : le rendre agréable à lire et expliquer comment s'y prendre concrètement.

Le personnage habille le propos, il ne le décide jamais : les règles ci-dessous
passent avant le folklore. Un nain ne raconte pas de sornettes sur ce qu'il n'a
pas vu de ses yeux.

RÈGLES ABSOLUES
1. Ne change jamais l'objectif, les chiffres de progression, ni les noms fournis.
   N'écris AUCUN nombre qui ne figure pas tel quel dans les données. Le nombre
   de choses restant à faire est exactement la longueur de "reste_a_faire" :
   ne le recompte pas, ne l'arrondis pas, ne le devine pas. Dans le doute,
   écris "ce qu'il te reste" plutôt qu'un chiffre.
2. N'invente aucun nom de PNJ, de rare, de boss, d'objet ni de coordonnées.
   Les seuls noms propres de contenu que tu peux écrire sont ceux du champ
   "noms_autorises", plus des lieux du jeu que tu connais avec certitude.
3. L'extension en cours est très récente. Si tu n'es pas certain de l'emplacement
   ou de la méthode, reste volontairement vague ("repère la zone sur la carte",
   "regarde du côté des quêtes de la zone") plutôt que d'inventer une précision.
   Une étape vague et juste vaut mieux qu'une étape précise et fausse.
   Cela vaut aussi pour les points cardinaux, les mécaniques de boss, les tables
   de butin et les noms de vendeurs : n'en cite aucun dont tu ne sois sûr. Ne
   remplis jamais une étape avec un détail décoratif pour faire vrai.
4. Respecte "duree_annoncee". N'écris pas "ce soir" pour un objectif étalé sur
   plusieurs jours, ni "sur la durée" pour une soirée. C'est le rythme du joueur.
5. Tutoiement, zéro emphase marketing, zéro emoji. Le folklore nain assaisonne,
   il ne noie pas : une tournure ou deux suffisent, les étapes doivent rester
   immédiatement actionnables. Jamais de juron par ligne.
6. Français de France.
7. L'accroche ouvre sur une interpellation de la maison, en clin d'œil au nom de
   la guilde : "Bon, mon jambonneau", "Alors, mon petit lardon", "Écoute-moi
   bien, vieille couenne", "Par ma barbe, camarade"… Varie d'une fois sur
   l'autre, ne reprends pas toujours la même, et garde-la affectueuse : on
   taquine un compagnon de guilde, on ne le méprise pas.

FORMAT DE RÉPONSE (un objet JSON, rien d'autre, sans balises de code) :
{"accroche": "l'interpellation puis UNE phrase courte qui donne envie de s'y mettre",
 "etapes": ["étape courte et actionnable", "…"]}

L'accroche fait 20 mots au maximum, interpellation comprise. Elle donne le ton,
elle ne résume pas l'objectif ni ne recopie les étapes : celles-ci disent déjà
tout. Une accroche trop longue est coupée à l'affichage.

Entre 2 et 4 étapes. Chaque étape tient en une ligne. C'est là que va l'utile :
le "comment s'y prendre", pas le décor.`;

/**
 * Tronque une chaîne trop longue sur une frontière de mot.
 * Couper au caractère près donne « une mascott… », qu'on lit deux fois.
 */
function borner(texte, max) {
  const t = String(texte || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;

  const coupe = t.slice(0, max - 1);
  const espace = coupe.lastIndexOf(' ');
  // Un mot unique plus long que la limite : là, on coupe sec, faute de mieux
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
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

/** Les faits transmis au modèle, rien de plus que ce qu'on a vérifié. */
function dossier(objectif, activity, live) {
  return {
    activite:        activity.titre,
    duree_annoncee:  activity.duree,
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

/** Un aller-retour avec le modèle. Renvoie null sur n'importe quel raté. */
async function tenter(settings, objectif, activity, live) {
  const { apiKey, model } = settings.openrouter || {};

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
        max_tokens: SORTIE_MAX_TOKENS,
        // Ignoré par les modèles qui ne raisonnent pas (voir SORTIE_MAX_TOKENS)
        reasoning: { enabled: false },
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

  const choix = json?.choices?.[0];
  const objet = extraireJson(choix?.message?.content);
  if (!objet) {
    // On distingue les deux pannes : un budget épuisé se corrige dans le code,
    // une réponse hors format se corrige dans la consigne. Les confondre coûte
    // une soirée de recherche.
    console.warn(choix?.finish_reason === 'length'
      ? `[redacteur] réponse tronquée (${SORTIE_MAX_TOKENS} jetons épuisés), repli sur les faits bruts`
      : '[redacteur] réponse hors format, repli sur les faits bruts');
    return null;
  }

  const etapes = (Array.isArray(objet.etapes) ? objet.etapes : [])
    .filter(e => typeof e === 'string' && e.trim())
    .slice(0, ETAPES_MAX)
    .map(e => borner(e, ETAPE_MAX));

  const accroche = borner(objet.accroche, ACCROCHE_MAX);

  // Une réponse vide des deux côtés ne vaut pas mieux que pas de réponse
  if (!accroche && !etapes.length) {
    console.warn('[redacteur] JSON valide mais vide');
    return null;
  }

  return { accroche, etapes };
}

/**
 * Rédige l'accroche et les étapes d'un objectif.
 *
 * Une tentative sur huit revient inexploitable (hoquet du fournisseur, réponse
 * hors format) alors que la même demande passe au coup suivant. Comme l'écran
 * est déjà différé côté Discord, une reprise unique coûte quelques secondes au
 * pire et évite de dégrader l'affichage pour un aléa réseau. Au-delà d'une
 * reprise, on préfère les faits bruts à un joueur qui attend.
 *
 * @param {object} settings
 * @param {object} objectif  sortie d'un résolveur de Helpers/objectifs.js
 * @param {object} activity  activité rendue (jetons déjà résolus)
 * @param {object|null} live veille saison
 * @returns {Promise<{accroche: string, etapes: string[]}|null>} null = repli sur les faits bruts
 */
async function rediger(settings, objectif, activity, live) {
  if (!settings.openrouter?.apiKey || !objectif) return null;

  const premier = await tenter(settings, objectif, activity, live);
  if (premier) return premier;

  const reprise = await tenter(settings, objectif, activity, live);
  if (!reprise) console.warn('[redacteur] deux échecs de suite, repli sur les faits bruts');
  return reprise;
}

module.exports = { rediger, borner };
