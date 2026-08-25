'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
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

/** Ligne d'état affichée en pied d'embed selon ce qu'on sait du joueur. */
function mentionProgression(progress) {
  if (progress?.ok) return `Progression lue sur ${progress.personnage}`;
  if (progress?.raison === 'prive') {
    return 'Profil privé — impossible de savoir ce que tu as déjà fait';
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

// ── Écrans ────────────────────────────────────────────────────────────

/** Écran 1 — comment on joue : seul ou en groupe de 5. */
function modeScreen(progress, tout) {
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

  const mention = mentionProgression(progress);
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
  if (progress?.ok) {
    rows.push(new ActionRowBuilder().addComponents(boutonToutVoir(null, null, tout)));
  }

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

/** Écran 3 — l'activité tirée au sort, jetons résolus avec la veille. */
function activityScreen(mode, section, brute, live, progress, tout) {
  const activity = renderActivity(brute, live);
  const dejaFait = estFait(brute, progress);

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

  if (activity.astuce) {
    embed.addFields({ name: '💡 Astuce', value: activity.astuce, inline: false });
  }

  embed.setFooter({
    text: live?.season?.label
      ? `${live.season.label} · Pas convaincu ? Relance le dé.`
      : 'Pas convaincu ? Relance le dé.',
  });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(id('reroll', mode.id, section.id, activity.id, tout))
        .setLabel('Une autre !')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Success),
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
      ...(progress?.ok ? [boutonToutVoir(mode, section, tout)] : []),
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

    await interaction.editReply(modeScreen(progress, false));
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: TIMEOUT_MS,
    });

    collector.on('collect', async (i) => {
      // Seul l'auteur de la commande pilote sa propre proposition
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: '🚫 Cette proposition n\'est pas la tienne — lance ta propre `/que-faire` !',
          ephemeral: true,
        });
      }

      const [, action, modeId, sectionId, activityId, toutFlag] = i.customId.split(':');
      const tout = toutFlag === '1';

      if (action === 'home') return i.update(modeScreen(progress, tout));

      const mode = getMode(modeId);

      // La bascule renvoie sur l'écran d'où elle a été actionnée
      if (action === 'bascule') {
        if (!mode) return i.update(modeScreen(progress, tout));
        const section = getSection(sectionId);
        if (!section) return i.update(sectionScreen(mode, progress, tout));
        const live     = fetchWowSeason.read(bot.settings);
        const activity = pickActivity(mode.id, section.id, null, { progress, inclureFaits: tout });
        if (!activity) return i.update(emptyScreen(mode, section, tout));
        return i.update(activityScreen(mode, section, activity, live, progress, tout));
      }

      if (!mode) return i.update(modeScreen(progress, tout));
      if (action === 'mode' || action === 'back') return i.update(sectionScreen(mode, progress, tout));

      const section = getSection(sectionId);
      if (!section) return i.update(sectionScreen(mode, progress, tout));

      const activity = pickActivity(mode.id, section.id, action === 'reroll' ? activityId : null,
        { progress, inclureFaits: tout });
      if (!activity) return i.update(emptyScreen(mode, section, tout));

      // Relu à chaque tirage : la veille tourne en tâche de fond, on prend
      // toujours le dernier état sans avoir à redémarrer le bot.
      const live = fetchWowSeason.read(bot.settings);

      return i.update(activityScreen(mode, section, activity, live, progress, tout));
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
