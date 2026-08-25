'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

const {
  MODES,
  SECTIONS,
  getMode,
  getSection,
  pickActivity,
  countActivities,
  countMode,
  renderActivity,
  estFait,
} = require('../Helpers/activities');

const fetchWowSeason      = require('../Helpers/fetchWowSeason');
const { progressionDe }   = require('../Helpers/characterProgress');
const objectifs           = require('../Helpers/objectifs');
const objectifsSuivi      = require('../Helpers/objectifsSuivi');
const { rediger }         = require('../Helpers/redacteurIA');

// Durée pendant laquelle les boutons restent cliquables
const TIMEOUT_MS = 10 * 60 * 1000;

// customId : quefaire:<action>:<mode>:<section>:<activité>:<toutVoir>
// Les segments inutilisés valent '-'. Le dernier segment transporte l'état du
// bouton « voir aussi ce qui est fait », qui doit survivre d'un écran à l'autre.
const PREFIX = 'quefaire';
const NONE   = '-';

const id = (action, mode = NONE, section = NONE, activity = NONE, tout = false) =>
  `${PREFIX}:${action}:${mode}:${section}:${activity}:${tout ? '1' : '0'}`;

/** Bouton de bascule « inclure ce qui est déjà fait ». */
function boutonToutVoir(mode, section, tout) {
  return new ButtonBuilder()
    .setCustomId(id('bascule', mode?.id, section?.id, NONE, !tout))
    .setLabel(tout ? 'Masquer ce qui est fait' : 'Voir aussi ce qui est fait')
    .setEmoji(tout ? '🙈' : '👁️')
    .setStyle(ButtonStyle.Secondary);
}

/** Bouton d'aide affiché quand le profil du joueur reste fermé. */
function boutonProfilPrive() {
  return new ButtonBuilder()
    .setCustomId(id('aide'))
    .setLabel('Pourquoi je n\'ai pas d\'objectif ?')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Secondary);
}

/** Ligne d'état affichée en pied d'embed selon ce qu'on sait du joueur. */
function mentionProgression(progress, groupe = null) {
  if (progress?.ok) {
    return groupe?.length > 1
      ? `Progression lue sur ${groupe.length} joueurs du vocal`
      : `Progression lue sur ${progress.personnage}`;
  }
  if (progress?.raison === 'prive') {
    return '🔒 Profil illisible — objectifs personnalisés désactivés';
  }
  if (progress?.raison === 'introuvable') {
    return `Personnage introuvable côté Blizzard${progress.personnage ? ` (${progress.personnage})` : ''}`;
  }
  if (progress?.raison === 'non-enregistre') {
    return 'Personnage non enregistré — utilise /add pour un tri personnalisé';
  }
  return null;
}

/** « 12 activités possibles » ou « 12 possibles · 3 déjà faites ». */
function libelleCompte(c) {
  if (!c.faits) return `${c.total} activités possibles`;
  return `${c.restants} à faire · ${c.faits} déjà faite${c.faits > 1 ? 's' : ''}`;
}

// ── Vocal ─────────────────────────────────────────────────────────────

/**
 * Les identifiants Discord des joueurs présents dans le même salon vocal.
 *
 * Personne en vocal — ou intent absent — renvoie une liste vide, et tout le
 * reste continue sur le seul profil du demandeur. Les bots sont écartés, et
 * l'auteur passe en tête : c'est lui qui donne le ton si le croisement échoue.
 */
function compagnonsEnVocal(interaction) {
  const salon = interaction.member?.voice?.channel;
  if (!salon) return [];

  const autres = [...salon.members.values()]
    .filter(m => !m.user.bot && m.id !== interaction.user.id)
    .map(m => m.id);

  return [interaction.user.id, ...autres];
}

/**
 * Charge les progressions du groupe, en ne gardant que les profils lisibles.
 * Un membre absent de members.json ou au profil fermé est simplement ignoré :
 * il joue quand même, il ne pèse juste pas sur le choix de l'objectif.
 */
async function progressionsDuGroupe(settings, discordIds) {
  const profils = [];
  for (const discordId of discordIds) {
    const p = await progressionDe(settings, discordId);
    if (p?.ok) profils.push(p);
  }
  return profils;
}

// ── Objectif ──────────────────────────────────────────────────────────

/**
 * Bâtit le bloc « objectif » d'une activité : les faits d'abord, la rédaction
 * ensuite. Si l'IA ne répond pas, les faits s'affichent seuls — ils se
 * suffisent, ils sont juste plus secs.
 *
 * @returns {Promise<{objectif: object, texte: object|null}|null>}
 */
async function construireObjectif(settings, activity, brute, progress, groupe, live) {
  if (!activity.objectif) return null;

  const objectif = groupe?.length > 1
    ? await objectifs.pourGroupe(settings, brute, groupe, { live })
    : await objectifs.pourActivite(settings, brute, progress, { live });

  if (!objectif) return null;

  const texte = await rediger(settings, objectif, activity, live);
  return { objectif, texte };
}

// Limite d'un champ d'embed Discord. La dépasser fait rejeter tout le message.
const CHAMP_MAX = 1024;

/**
 * Met en forme le bloc d'objectif dans l'embed.
 *
 * Le budget de caractères est serré et la prose de l'IA est de longueur
 * imprévisible. On assemble donc par ordre de valeur décroissante en s'arrêtant
 * avant le mur, plutôt que de tout coller et de couper au caractère près — une
 * étape amputée en plein mot est pire que pas d'étape du tout.
 *
 * Les critères manquants sont réservés d'avance : ce sont les seules données
 * vérifiées auprès de Blizzard, ce sont donc les dernières à sacrifier.
 */
function ajouterObjectif(embed, bloc) {
  if (!bloc) return;

  const { objectif, texte } = bloc;

  // Quand l'IA a pris la main, elle n'a plus cité les critères manquants tels
  // quels : on les remet en clair, ils restent l'information la plus précieuse.
  const rappelFaits = (texte?.etapes?.length && objectif.etapes?.length && objectif.type !== 'collection')
    ? `**Il te manque :** ${objectif.etapes.join(' · ')}` +
      (objectif.reste ? ` *(+${objectif.reste} autres)*` : '')
    : null;

  const lignes = [];
  let budget = CHAMP_MAX - (rappelFaits ? rappelFaits.length + 2 : 0);

  const ajouter = (ligne) => {
    const cout = ligne.length + 1;
    if (cout > budget) return false;
    budget -= cout;
    lignes.push(ligne);
    return true;
  };

  if (objectif.progression) ajouter(`*${objectif.progression}*`);

  if (texte?.accroche) ajouter(texte.accroche);
  else if (objectif.contexte) ajouter(objectif.contexte);

  // Les étapes rédigées par l'IA remplacent la liste brute quand elles
  // existent : elles disent comment s'y prendre, pas seulement quoi cocher.
  const etapes = texte?.etapes?.length ? texte.etapes : objectif.etapes;
  if (etapes?.length) {
    ajouter('');
    // Une étape qui ne tient pas est abandonnée entière, pas rognée
    for (const [n, e] of etapes.entries()) if (!ajouter(`\`${n + 1}.\` ${e}`)) break;
  }

  if (rappelFaits) {
    lignes.push('', rappelFaits);
  } else if (objectif.reste) {
    ajouter(`*(+${objectif.reste} autres non listés)*`);
  }

  if (objectif.recompense) ajouter(`**Récompense :** ${objectif.recompense}`);

  embed.addFields({
    name: `🎯 ${objectif.cible}`.slice(0, 256),
    value: lignes.join('\n'),
    inline: false,
  });
}

// ── Écrans ────────────────────────────────────────────────────────────

/** Écran 1 — comment on joue : seul ou en groupe de 5. */
function modeScreen(progress, tout, groupe) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🍖 Que faire aujourd\'hui ?')
    .setDescription('D\'abord, tu joues comment ce soir ?')
    .addFields(
      MODES.map(m => ({
        name: `${m.emoji} ${m.label}`,
        value: `${m.tagline}\n*${libelleCompte(countMode(m.id, progress))}*`,
        inline: false,
      }))
    );

  const mention = mentionProgression(progress, groupe);
  if (mention) embed.setFooter({ text: mention });

  const rows = [
    new ActionRowBuilder().addComponents(
      MODES.map(m =>
        new ButtonBuilder()
          .setCustomId(id('mode', m.id, NONE, NONE, tout))
          .setLabel(m.label)
          .setEmoji(m.emoji)
          .setStyle(ButtonStyle.Primary)
      )
    ),
  ];

  const secondaires = [
    ...(progress?.ok ? [boutonToutVoir(null, null, tout)] : []),
    ...(progress?.ok ? [] : [boutonProfilPrive()]),
  ];
  if (secondaires.length) rows.push(new ActionRowBuilder().addComponents(secondaires));

  return { embeds: [embed], components: rows };
}

/** Écran 2 — combien de temps on y consacre. */
function sectionScreen(mode, progress, tout) {
  const embed = new EmbedBuilder()
    .setColor(mode.color)
    .setAuthor({ name: `${mode.emoji} ${mode.label}` })
    .setTitle('Et tu as combien de temps ?')
    .setDescription('Choisis l\'engagement, je tire une activité au hasard.')
    .addFields(
      SECTIONS.map(s => ({
        name: `${s.emoji} ${s.label}`,
        value: `${s.tagline}\n*${libelleCompte(countActivities(mode.id, s.id, progress))}*`,
        inline: false,
      }))
    );

  if (tout) embed.setFooter({ text: 'Les activités déjà faites sont incluses dans le tirage' });

  const rows = [
    new ActionRowBuilder().addComponents(
      SECTIONS.map(s =>
        new ButtonBuilder()
          .setCustomId(id('pick', mode.id, s.id, NONE, tout))
          .setLabel(s.label)
          .setEmoji(s.emoji)
          .setStyle(ButtonStyle.Primary)
      )
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(id('home', NONE, NONE, NONE, tout))
        .setLabel('Changer de mode')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary),
      ...(progress?.ok ? [boutonToutVoir(mode, null, tout)] : []),
    ),
  ];

  return { embeds: [embed], components: rows };
}

/** Écran 3 — l'activité tirée au sort, jetons résolus et objectif calculé. */
function activityScreen(mode, section, activity, bloc, live, progress, tout, dejaFait, groupe, pris = false) {
  const embed = new EmbedBuilder()
    .setColor(section.color)
    .setAuthor({ name: `${mode.emoji} ${mode.label} · ${section.emoji} ${section.label}` })
    .setTitle(dejaFait ? `✅ ${activity.titre}` : activity.titre)
    .setDescription(
      dejaFait
        ? `**Tu l'as déjà fait.**\n${activity.resume}`
        : activity.resume
    )
    .addFields(
      { name: '👥 Effectif', value: mode.label,    inline: true },
      { name: '⏱️ Durée',    value: activity.duree, inline: true },
      { name: '🎁 À la clé', value: activity.gain,  inline: false },
    );

  ajouterObjectif(embed, bloc);

  if (activity.astuce) {
    embed.addFields({ name: '💡 Astuce', value: activity.astuce, inline: false });
  }

  const pied = [];
  if (live?.season?.label) pied.push(live.season.label);
  if (bloc && pris) {
    pied.push(groupe?.length > 1
      ? 'Objectif du groupe pris — je félicite quand il tombe'
      : 'Objectif pris — je te félicite quand il tombe');
  } else if (bloc) {
    pied.push('Rien n\'est enregistré tant que tu ne l\'as pas pris');
  } else {
    pied.push('Pas convaincu ? Relance le dé.');
  }
  embed.setFooter({ text: pied.join(' · ') });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(id('reroll', mode.id, section.id, activity.id, tout))
        .setLabel('Une autre !')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Success),
      // Le bouton n'apparaît que s'il y a un objectif à prendre : un tirage
      // sans cible personnalisée n'a rien à faire engager à qui que ce soit.
      ...(bloc ? [
        new ButtonBuilder()
          .setCustomId(id('prendre', mode.id, section.id, activity.id, tout))
          .setLabel(pris ? 'Objectif pris' : 'Je le prends')
          .setEmoji(pris ? '✅' : '🎯')
          .setStyle(pris ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(pris),
      ] : []),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(id('back', mode.id, NONE, NONE, tout))
        .setLabel('Changer de durée')
        .setEmoji('⏱️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(id('home', NONE, NONE, NONE, tout))
        .setLabel('Changer de mode')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary),
      ...(progress?.ok ? [boutonToutVoir(mode, section, tout)] : [boutonProfilPrive()]),
    ),
  ];

  return { embeds: [embed], components: rows };
}

/** Écran d'erreur : une case du catalogue encore vide. */
function emptyScreen(mode, section, tout) {
  const embed = new EmbedBuilder()
    .setColor(section.color)
    .setAuthor({ name: `${mode.emoji} ${mode.label}` })
    .setTitle(`${section.emoji} ${section.label}`)
    .setDescription('Aucune activité enregistrée dans cette case pour l\'instant.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id('back', mode.id, NONE, NONE, tout))
      .setLabel('Changer de durée')
      .setEmoji('⏱️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Écran d'aide, en éphémère : pourquoi le bot ne voit rien, et quoi faire.
 *
 * On se garde d'affirmer que le profil est privé : un 403 côté Blizzard veut
 * aussi dire « personnage inactif depuis un moment ». Les deux causes sont donc
 * annoncées, avec la manipulation qui répare la première et la connexion en jeu
 * qui répare la seconde.
 */
function aideScreen(progress) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔒 Je n\'arrive pas à lire ta progression');

  if (progress?.raison === 'non-enregistre') {
    embed.setDescription(
      'Ton compte Discord n\'est relié à aucun personnage.\n\n' +
      'Demande à un officier de t\'ajouter avec `/add`, et je pourrai te proposer ' +
      'des objectifs taillés sur ta progression réelle plutôt que des idées au hasard.'
    );
    return { embeds: [embed], flags: MessageFlags.Ephemeral };
  }

  embed
    .setDescription(
      progress?.personnage
        ? `Blizzard refuse de me communiquer les données de **${progress.personnage}**. Deux causes possibles.`
        : 'Blizzard refuse de me communiquer les données de ton personnage. Deux causes possibles.'
    )
    .addFields(
      {
        name: '1️⃣ Le partage de données est désactivé sur ton compte',
        value:
          'C\'est la cause la plus fréquente, et elle se règle en trente secondes :\n' +
          '`1.` Va sur **https://account.battle.net/privacy** (connecte-toi)\n' +
          '`2.` Descends jusqu\'à **Confidentialité des données de jeu et du profil**\n' +
          '`3.` Coche **Partager mes données de jeu avec les développeurs communautaires**\n' +
          '`4.` Enregistre, puis relance `/que-faire` — le changement est pris en compte ' +
          'dans les minutes qui suivent',
        inline: false,
      },
      {
        name: '2️⃣ Le personnage n\'a pas joué depuis longtemps',
        value:
          'Blizzard ferme aussi l\'accès aux personnages restés trop longtemps hors ligne. ' +
          'Une simple connexion en jeu, puis une déconnexion propre, suffit à réveiller la fiche.',
        inline: false,
      },
      {
        name: '🤝 Et si tu préfères garder ça fermé',
        value:
          'Aucun souci, c\'est ton droit le plus strict et je ne contournerai rien. ' +
          '`/que-faire` continue de fonctionner : tu perds les objectifs sur mesure et ' +
          'le tri de ce que tu as déjà fait, pas le reste.',
        inline: false,
      },
    )
    .setFooter({ text: 'Je ne lis que des données publiques de personnage — jamais ton compte Battle.net.' });

  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

// ── Commande ──────────────────────────────────────────────────────────

module.exports = {
  name: 'que-faire',
  description: 'Propose une activité World of Warcraft au hasard, selon le mode de jeu et le temps disponible.',
  permission: 'Aucune',
  dm: false,
  options: [],

  async run(bot, interaction) {
    await interaction.deferReply();

    // Mise en cache six heures côté helper : cet appel est quasi gratuit ensuite
    const progress = await progressionDe(bot.settings, interaction.user.id);

    // Le vocal est relevé une fois, au lancement : c'est la photo du groupe au
    // moment où quelqu'un se demande quoi faire. Les profils, eux, ne sont
    // chargés que si une activité de groupe sort — inutile de sonder cinq
    // personnages pour une soirée transmog en solo.
    const compagnons = compagnonsEnVocal(interaction);
    let groupe = null;

    const chargerGroupe = async () => {
      if (groupe) return groupe;
      groupe = compagnons.length > 1
        ? await progressionsDuGroupe(bot.settings, compagnons)
        : [];
      return groupe;
    };

    // Dernier écran d'activité affiché. Un objectif n'est enregistré que si le
    // joueur clique « Je le prends » — le tirage seul n'engage à rien. Comme
    // l'objectif est bien trop gros pour tenir dans un customId (100 caractères),
    // on le garde ici, dans la portée de la commande : seul son auteur pilote
    // ces boutons, et un seul écran est vivant à la fois.
    let dernier = null;

    await interaction.editReply(modeScreen(progress, false, null));
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: TIMEOUT_MS,
    });

    /** Tirage + objectif + rendu. Le travail long tient ici, d'où le defer. */
    const ecranActivite = async (i, mode, section, excludeId, tout) => {
      const brute = pickActivity(mode.id, section.id, excludeId, { progress, inclureFaits: tout });
      if (!brute) return i.editReply(emptyScreen(mode, section, tout));

      // Relu à chaque tirage : la veille tourne en tâche de fond, on prend
      // toujours le dernier état sans avoir à redémarrer le bot.
      const live     = fetchWowSeason.read(bot.settings);
      const activity = renderActivity(brute, live);
      const dejaFait = estFait(brute, progress);

      const equipe = mode.id === 'groupe' ? await chargerGroupe() : null;

      const bloc = (progress?.ok && !dejaFait)
        ? await construireObjectif(bot.settings, activity, brute, progress, equipe, live)
        : null;

      dernier = bloc ? { bloc, activity, mode, section, live, equipe, tout } : null;

      // Un écran sans bloc d'objectif est indiscernable d'un bot resté sur
      // l'ancienne version : on dit toujours pourquoi il manque.
      if (!bloc && brute.objectif) {
        console.log(`[que-faire] ${brute.id} : pas d'objectif — ` +
          (!progress?.ok ? `profil illisible (${progress?.raison})`
           : dejaFait   ? 'activité déjà accomplie'
           : 'aucune cible trouvée par le résolveur'));
      }

      return i.editReply(
        activityScreen(mode, section, activity, bloc, live, progress, tout, dejaFait, equipe, false)
      );
    };

    /**
     * Enregistrement volontaire de l'objectif affiché.
     *
     * Un objectif de groupe engage le meneur : c'est lui qui a lancé la
     * commande, c'est son profil qui servira de juge, et c'est donc lui seul
     * qu'on félicitera. Les autres suivent pour le plaisir.
     */
    const prendreObjectif = async (i) => {
      if (!dernier) {
        return i.reply({
          content: '🎲 Cet objectif n\'est plus affiché — relance un tirage pour en prendre un.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const { bloc, activity, mode, section, live, equipe, tout } = dernier;
      const precedent = objectifsSuivi.enCours(bot.settings, interaction.user.id);

      objectifsSuivi.noter(bot.settings, interaction.user.id, bloc.objectif, activity, progress);

      await i.update(
        activityScreen(mode, section, activity, bloc, live, progress, tout, false, equipe, true)
      );

      // On ne remplace pas un engagement en silence
      if (precedent && precedent.cible !== bloc.objectif.cible) {
        await i.followUp({
          content: `📌 Ton objectif précédent — **${precedent.cible}** — a été remplacé.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    };

    collector.on('collect', async (i) => {
      // Seul l'auteur de la commande pilote sa propre proposition
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: '🚫 Cette proposition n\'est pas la tienne — lance ta propre `/que-faire` !',
          flags: MessageFlags.Ephemeral,
        });
      }

      const [, action, modeId, sectionId, activityId, toutFlag] = i.customId.split(':');
      const tout = toutFlag === '1';

      try {
        if (action === 'aide')    return i.reply(aideScreen(progress));
        if (action === 'prendre') return prendreObjectif(i);
        if (action === 'home')    return i.update(modeScreen(progress, tout, groupe));

        const mode = getMode(modeId);
        if (!mode) return i.update(modeScreen(progress, tout, groupe));

        // La bascule renvoie sur l'écran d'où elle a été actionnée
        if (action === 'bascule') {
          const section = getSection(sectionId);
          if (!section) return i.update(sectionScreen(mode, progress, tout));
          await i.deferUpdate();
          return ecranActivite(i, mode, section, null, tout);
        }

        if (action === 'mode' || action === 'back') return i.update(sectionScreen(mode, progress, tout));

        const section = getSection(sectionId);
        if (!section) return i.update(sectionScreen(mode, progress, tout));

        // Lecture de profils et appel au rédacteur : trop long pour un update
        // direct, Discord n'attend que trois secondes.
        await i.deferUpdate();
        return ecranActivite(i, mode, section, action === 'reroll' ? activityId : null, tout);
      } catch (err) {
        console.warn(`[que-faire] ${action} : ${err.message}`);
      }
    });

    collector.on('end', async () => {
      // Les boutons ne répondent plus : on les grise plutôt que de les laisser tromper le monde
      try {
        const current = await interaction.fetchReply();
        const rows = current.components.map(row =>
          ActionRowBuilder.from(row).setComponents(
            row.components.map(c => ButtonBuilder.from(c).setDisabled(true))
          )
        );
        await interaction.editReply({ components: rows });
      } catch {
        // Message supprimé ou interaction expirée : rien à faire
      }
    });
  },
};
