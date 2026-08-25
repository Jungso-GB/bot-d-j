'use strict';

/**
 * Accès mutualisé à l'API Blizzard.
 *
 * Un seul token applicatif (client_credentials) pour tout le bot : la veille
 * saison et les profils de personnages tapent au même endroit, donc autant ne
 * pas maintenir deux caches de token qui s'ignorent.
 *
 * Le flux client_credentials suffit pour tout ce qu'on lit ici, y compris les
 * profils de personnages : aucun membre n'a besoin de se connecter à Battle.net.
 * Seul le réglage « Données de jeu et confidentialité du profil » du joueur peut
 * fermer la porte, et il répond alors 403 — voir lireProfil().
 */

const TIMEOUT_MS = 15000;

let tokenCache = null; // { value, expiresAt }

/** Erreur porteuse du code HTTP, pour distinguer un 403 d'une vraie panne. */
class BlizzardError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BlizzardError';
    this.status = status;
  }
}

async function getToken(settings) {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const { clientId, clientSecret } = settings.blizzard;
  if (!clientId || !clientSecret) throw new BlizzardError('Identifiants Blizzard absents (.env)', 401);

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new BlizzardError(`Authentification refusée (HTTP ${res.status})`, res.status);

  const json = await res.json();
  // Marge de 5 min : on ne présente jamais un token qui expire en vol
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 300) * 1000 };
  return tokenCache.value;
}

/**
 * Appel générique à l'API Blizzard.
 * @param {object} settings
 * @param {string} endpoint  chemin, ex. '/data/wow/achievement/index'
 * @param {string} namespace 'static' | 'dynamic' | 'profile'
 */
async function blizzardGet(settings, endpoint, namespace) {
  const { region, locale } = settings.blizzard;
  const token = await getToken(settings);
  const url = `https://${region}.api.blizzard.com${endpoint}?namespace=${namespace}-${region}&locale=${locale}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Donjons-et-Jambons-Bot/1.0' },
  });
  if (!res.ok) throw new BlizzardError(`HTTP ${res.status} sur ${endpoint}`, res.status);
  return res.json();
}

/** Requête publique hors Blizzard (Raider.io), même gestion du délai. */
async function getJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'Donjons-et-Jambons-Bot/1.0', ...(options.headers || {}) },
  });
  if (!res.ok) throw new BlizzardError(`HTTP ${res.status} sur ${url.split('?')[0]}`, res.status);
  return res.json();
}

module.exports = { blizzardGet, getJson, getToken, BlizzardError };
