/**
 * Récupère l'URL de l'avatar d'un personnage WoW via l'API publique Raider.io.
 * Pas de clé API requise.
 *
 * @param {string} name   - Nom du personnage (ex: "Jungso")
 * @param {string} realm  - Realm slug (ex: "kirin-tor")
 * @param {string} region - Région (défaut: "eu")
 * @returns {Promise<string|null>} URL du portrait ou null si introuvable
 */
async function fetchAvatar(name, realm, region = 'eu') {
  try {
    const url = `https://raider.io/api/v1/characters/profile`
      + `?region=${encodeURIComponent(region)}`
      + `&realm=${encodeURIComponent(realm)}`
      + `&name=${encodeURIComponent(name)}`
      + `&fields=thumbnail_url`;

    const res = await fetch(url);

    if (res.status === 400 || res.status === 404) {
      // Personnage inconnu de Raider.io
      console.warn(`[fetchAvatar] Personnage introuvable sur Raider.io : ${name} (${realm}-${region})`);
      return null;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.thumbnail_url) return null;
    // Remplace -avatar.jpg (84×84) par -main.jpg (portrait HD) pour la meilleure qualité
    return data.thumbnail_url.replace(/-avatar\.jpg(\?|$)/, '-main.jpg$1');

  } catch (err) {
    console.error(`[fetchAvatar] Erreur pour ${name} :`, err.message);
    return null;
  }
}

module.exports = fetchAvatar;
