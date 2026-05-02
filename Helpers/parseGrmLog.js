'use strict';

/**
 * Normalise un nom WoW pour la comparaison (sans accents, minuscules, lettres/chiffres/tirets).
 */
function normalize(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Parse le fichier de log GRM pour extraire :
 *  - Les relations Main/ALT
 *  - Les infos de base (joinDate, invitedBy) par personnage
 *
 * @param {object} grmData  – JSON parsé du fichier GRM
 * @param {string} [guildKey] – Clé de la guilde ; auto-détectée si absent
 * @returns {object} { updatedAt, guildKey, totalRelationships, totalMains, relations, altOf, characters }
 */
function parseGrmLog(grmData, guildKey) {
  if (!guildKey) guildKey = Object.keys(grmData)[0];
  const logs = grmData[guildKey];
  if (!Array.isArray(logs)) throw new Error(`Clé "${guildKey}" introuvable ou invalide dans le fichier.`);

  // Extraire le realm depuis la clé "GuildeNom-RealmName" → "realm-name"
  // Ex: "Donjons et Jambons-KirinTor" → "kirin-tor"
  const realmRaw = guildKey.includes('-') ? guildKey.split('-').pop() : '';
  const guildRealm = realmRaw
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // KirinTor → Kirin-Tor
    .toLowerCase()                          // kirin-tor
    || 'kirin-tor';

  // ── Structures internes ──
  const mainOf       = {};  // normAlt  → normMain
  const altsOf       = {};  // normMain → Set<normAlt>
  const displayNames = {};  // norm     → displayName (dernière version vue)
  const characters   = {};  // norm     → { joinDate, invitedBy }

  function setDisplay(norm, display) {
    if (norm && display) displayNames[norm] = display;
  }

  function recordLink(altName, mainName) {
    const normAlt  = normalize(altName);
    const normMain = normalize(mainName);
    if (!normAlt || !normMain || normAlt === normMain) return;
    setDisplay(normAlt,  altName);
    setDisplay(normMain, mainName);
    mainOf[normAlt] = normMain;
    if (!altsOf[normMain]) altsOf[normMain] = new Set();
    altsOf[normMain].add(normAlt);
  }

  // ── Parsing ligne par ligne ──
  for (const line of logs) {

    // ── 1. Note "ALT Main" ou "Reroll Main" ─────────────────────────
    // "Note publique de ALT ajoutée : "ALT Main""
    // "Note publique de ALT : "vieille" en "ALT Main""
    {
      // Ajout de note
      let m = line.match(/Note publique de (.+?) ajoutée? ?: ?"(?:ALT|Reroll)\s+([^"]+)"/i);
      if (!m) {
        // Mise à jour (... en "ALT Main")
        m = line.match(/Note publique de (.+?) : ".+" en "(?:ALT|Reroll)\s+([^"]+)"/i);
      }
      if (m) {
        const altChar  = m[1].trim();
        let   mainChar = m[2].trim();
        // Nettoyer les suffixes parasites (Farm, PvP, pourcentages, "/ autre nom", etc.)
        mainChar = mainChar
          .split(/\s+(?:farm|pvp|\d+%|[-]{2,}|\/)/i)[0]
          .replace(/\s+\(.+?\)$/, '')
          .trim();
        if (mainChar) recordLink(altChar, mainChar);
        continue;
      }
    }

    // ── 2. Level-up "(M)" : ALT (M) (Main) a atteint le niveau ──────
    // Le personnage qui monte de niveau est l'ALT ;
    // le nom entre secondes parenthèses est son Main (tel qu'enregistré dans GRM).
    {
      const m = line.match(/: (.+?) \(M\) \((.+?)\) a (?:atteint|perdu|gagné)/);
      if (m) {
        recordLink(m[1].trim(), m[2].trim());
        continue;
      }
    }

    // ── 3. Départ/exclusion avec "(M) is listed as the Main" ─────────
    // "ALTS DANS LA GUILDE : A, B, C  X (M) is listed as the Main"
    {
      const mainMatch = line.match(/([^\s(,]+)\s*\(M\)\s+is listed as the Main/);
      const altsMatch = line.match(/ALTS DANS LA GUILDE\s*:\s*(.+?)(?=\s+[A-Z][a-z]|\s*$)/);
      if (mainMatch && altsMatch) {
        const mainChar = mainMatch[1].trim();
        const altList  = altsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        for (const alt of altList) {
          if (normalize(alt) !== normalize(mainChar)) recordLink(alt, mainChar);
        }
        continue;
      }
    }

    // ── 4. Départ/exclusion avec "'Main' du joueur : MAINNAME" ───────
    {
      const m = line.match(/: (.+?) (?:a quitté|a été renvoyé|is no longer).+?'Main' du joueur\s*:\s*(.+?)(?=\s+Membre|\s+Note|\s*$)/);
      if (m) {
        const alt  = m[1].trim();
        const main = m[2].trim();
        if (normalize(alt) !== normalize(main)) recordLink(alt, main);
        continue;
      }
    }

    // ── 5. Rejoindre la guilde → joinDate + invitedBy ────────────────
    {
      const m = line.match(/^(.+?) : (.+?) a rejoint la guilde ! \(NIV: \d+\)(?: - Invité par : (.+))?/);
      if (m) {
        const date   = m[1].trim();
        const char   = m[2].trim();
        const invBy  = m[3]?.trim() || null;
        const normC  = normalize(char);
        setDisplay(normC, char);
        if (!characters[normC]) {
          characters[normC] = { joinDate: date, invitedBy: invBy };
        }
        continue;
      }
    }
  }

  // ── Construction du résultat final ──────────────────────────────────
  const relations = {};
  for (const [normMain, altSet] of Object.entries(altsOf)) {
    if (!altSet.size) continue;
    const entry = {
      displayName: displayNames[normMain] || normMain,
      alts: [...altSet].map(normAlt => ({
        name:       displayNames[normAlt] || normAlt,
        normalized: normAlt,
        realm:      guildRealm,  // même realm que la guilde par défaut
      })),
    };
    const info = characters[normMain];
    if (info?.joinDate)   entry.joinDate   = info.joinDate;
    if (info?.invitedBy)  entry.invitedBy  = info.invitedBy;
    relations[normMain] = entry;
  }

  // altOf = normAlt → normMain (lookup rapide côté site)
  const altOf = { ...mainOf };

  // Infos de personnage (join, invited) pour tout le monde
  const charInfo = {};
  for (const [norm, info] of Object.entries(characters)) {
    charInfo[norm] = {
      displayName: displayNames[norm] || norm,
      ...info,
    };
  }

  return {
    updatedAt:          new Date().toISOString(),
    guildKey,
    guildRealm,
    totalRelationships: Object.keys(altOf).length,
    totalMains:         Object.keys(relations).length,
    relations,   // normMain → { displayName, alts, joinDate?, invitedBy? }
    altOf,       // normAlt  → normMain
    characters:  charInfo,  // norm → { displayName, joinDate, invitedBy }
  };
}

module.exports = { parseGrmLog, normalize };
