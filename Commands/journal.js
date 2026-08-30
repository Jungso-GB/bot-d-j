'use strict';

/**
 * Le journal de quêtes : ce qu'on a promis de faire, et où on en est.
 *
 * `/que-faire` propose et engage, `/journal` se souvient. Entre les deux il n'y
 * avait rien : une quête prise disparaissait de l'écran et ne réapparaissait
 * qu'au moment où elle tombait, des semaines plus tard. Elle n'existait donc
 * que dans la tête du joueur — ce qui est exactement ce qu'un journal est censé
 * éviter.
 *
 * Tout est éphémère : c'est le carnet du joueur, pas une annonce. Le classement
 * fait exception au principe mais pas à l'affichage — il reste éphémère lui
 * aussi, la fierté publique étant déjà servie par l'annonce automatique quand
 * une quête tombe.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const objectifsSuivi = require('../Helpers/objectifsSuivi');

// Durée pendant laquelle les boutons restent cliquables. Un éphémère ne se
// modifie plus au-delà d'un quart d'heure : on s'arrête avant le mur.
const TIMEOUT_MS = 10 * 60 * 1000;

// customId : journal:<action>:<quête>
const PREFIX = 'journal';
const NONE   = '-';

const id = (action, cle = NONE) => `${PREFIX}:${action}:${cle}`;

const COULEUR = 0xc8a165;

/** Depuis combien de jours la quête est-elle ouverte ? Au moins 1. */
function joursDepuis(iso) {
  const pris = Date.parse(iso);
  if (Number.isNaN(pris)) return null;
  return Math.max(1, Math.round((Date.now() - pris) / 86400000));
}

/** « il y a 4 jours », ou rien si la date est illisible. */
function anciennete(iso) {
  const j = joursDepuis(iso);
  if (j == null) return null;
  return `pris il y a ${j} jour${j > 1 ? 's' : ''}`;
}

// ── Écrans ────────────────────────────────────────────────────────────

/**
 * Comment et quand une quête se valide, dit au joueur.
 *
 * La cadence vient du réglage et non d'un texte écrit en dur : changer
 * `objectifsSchedule` sans changer cette phrase en ferait un mensonge. Les
 * vingt-quatre heures, elles, ne dépendent pas de nous — c'est Blizzard qui
 * ne republie la fiche d'un personnage qu'après sa déconnexion, et qui prend
 * son temps. Mieux vaut l'annoncer que laisser croire à une panne.
 */
function commentCaSeValide(settings) {
  const h = settings.objectifsSchedule?.heures;
  const cadence = h ? `toutes les ${h} h` : 'régulièrement';

  return `*Tu n'as rien à déclarer : je relis ton profil ${cadence} et je coche tout seul. `
       + 'Compte jusqu\'à **24 h** entre ton exploit et la validation — Blizzard ne '
       + 'republie ta fiche qu\'une fois déconnecté.*';
}

/** Écran 1 — la liste des quêtes en cours. */
function journalScreen(quetes, settings) {
  const embed = new EmbedBuilder()
    .setColor(COULEUR)
    .setTitle('📓 Ton journal de quêtes');

  if (!quetes.length) {
    embed.setDescription(
      'Pas une seule quête en cours, mon jambonneau. Ton carnet est vierge et ' +
      'ta chope est vide.\n\nLance `/que-faire`, prends un objectif, et reviens ' +
      'me voir — j\'en tiendrai le compte.'
    );
  } else {
    const reste = objectifsSuivi.JOURNAL_MAX - quetes.length;
    embed.setDescription(
      `**${quetes.length}** quête${quetes.length > 1 ? 's' : ''} en cours` +
      (reste ? ` · ${reste} place${reste > 1 ? 's' : ''} libre${reste > 1 ? 's' : ''}` : ' · journal plein') +
      `\n\n${commentCaSeValide(settings)}`
    );

    embed.addFields(quetes.map((q, n) => {
      const lignes = [];
      if (q.lien) lignes.push(`[📖 Voir la fiche](${q.lien})`);

      const etat = [q.progression ? `${q.progression} à la prise` : null, anciennete(q.priseLe)]
        .filter(Boolean).join(' · ');
      if (etat) lignes.push(`*${etat}*`);

      lignes.push(`Tirée sur *${q.titreActivite}*`);

      return {
        name: `${n + 1}. ${q.cible}`.slice(0, 256),
        value: lignes.join('\n'),
        inline: false,
      };
    }));
  }

  embed.setFooter({ text: 'Une quête oubliée s\'efface d\'elle-même au bout de 90 jours' });

  const rows = [];

  if (quetes.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(id('detail'))
        .setPlaceholder('Voir le détail d\'une quête…')
        .addOptions(quetes.map((q, n) => ({
          label: `${n + 1}. ${q.cible}`.slice(0, 100),
          description: (q.progression || q.titreActivite || '').slice(0, 100) || undefined,
          value: q.id,
        })))
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id('classement'))
      .setLabel('Classement de la guilde')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [embed], components: rows };
}

/** Écran 2 — tout ce qu'on sait d'une quête. */
function detailScreen(quete, settings) {
  const embed = new EmbedBuilder()
    .setColor(COULEUR)
    .setAuthor({ name: '📓 Journal de quêtes' })
    .setTitle(quete.cible.slice(0, 256));

  // Un titre d'embed devient cliquable dès qu'on lui donne une URL : c'est
  // l'endroit le plus naturel pour la fiche, et ça n'entame aucun budget.
  if (quete.lien) embed.setURL(quete.lien);
  if (quete.contexte) embed.setDescription(quete.contexte.slice(0, 4096));

  const etat = [
    quete.progression ? `**${quete.progression}** au moment de la prise` : null,
    anciennete(quete.priseLe),
  ].filter(Boolean);

  if (etat.length) {
    embed.addFields({ name: '📈 Où tu en étais', value: etat.join('\n'), inline: false });
  }

  // Les étapes affichées ici sont les faits vérifiés côté Blizzard, pas la
  // rédaction de l'IA : celle-ci n'est pas conservée, et la relire des semaines
  // plus tard n'apprendrait rien de plus que ce qui est écrit là.
  if (quete.etapes?.length) {
    const lignes = [];
    let budget = 1024;
    for (const [n, e] of quete.etapes.entries()) {
      const ligne = `\`${n + 1}.\` ${e}`;
      if (ligne.length + 1 > budget) break;
      budget -= ligne.length + 1;
      lignes.push(ligne);
    }
    if (lignes.length) {
      embed.addFields({ name: '✅ Ce qu\'il te manquait', value: lignes.join('\n'), inline: false });
    }
  }

  if (quete.recompense) {
    embed.addFields({ name: '🎁 Récompense', value: quete.recompense.slice(0, 1024), inline: false });
  }

  embed.addFields({ name: '🎲 Tirée sur', value: quete.titreActivite, inline: true });
  if (quete.personnage) {
    embed.addFields({ name: '🧍 Suivie sur', value: quete.personnage, inline: true });
  }

  const h = settings.objectifsSchedule?.heures;
  embed.setFooter({
    text: `Relu ${h ? `toutes les ${h} h` : 'régulièrement'} · jusqu'à 24 h entre l'exploit et la validation`,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id('retour'))
      .setLabel('Retour au journal')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('abandon', quete.id))
      .setLabel('Abandonner')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Écran 3 — confirmation d'abandon.
 *
 * Un clic de trop efface l'ancienneté de la quête, et c'est la seule chose
 * qu'on ne peut pas reconstituer : la reprendre demain repart de zéro jour.
 * D'où la question, qui coûte un clic et évite un regret.
 */
function abandonScreen(quete) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🗑️ Abandonner cette quête ?')
    .setDescription(
      `**${quete.cible}**\n\n` +
      'Elle sort de ton journal et je cesse de la surveiller. Tu pourras la ' +
      'reprendre plus tard si elle ressort d\'un tirage, mais l\'ancienneté ' +
      `repartira de zéro — celle-ci était ouverte depuis ${joursDepuis(quete.priseLe) ?? '?'} jour(s).`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id('retour'))
      .setLabel('Non, je continue')
      .setEmoji('💪')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('abandon-ok', quete.id))
      .setLabel('Oui, j\'abandonne')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

const MEDAILLES = ['🥇', '🥈', '🥉'];

/** Une colonne de classement, ou une ligne d'excuse si elle est vide. */
function colonne(lignes, vide) {
  if (!lignes.length) return vide;

  return lignes.slice(0, 10)
    .map((l, n) => `${MEDAILLES[n] || `\`${n + 1}.\``} <@${l.discordId}> — **${l.n}**`)
    .join('\n');
}

/** Écran 4 — le palmarès de la guilde. */
function classementScreen(palmares) {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 Classement de la guilde')
    .setDescription('Une quête compte le jour où je constate qu\'elle est bouclée, pas le jour où tu la prends.')
    .addFields(
      {
        name: `📅 ${palmares.libelleMois}`,
        value: colonne(palmares.mois, '*Personne n\'a encore rien bouclé ce mois-ci. La place est libre.*'),
        inline: false,
      },
      {
        name: '⚒️ Total à vie',
        value: colonne(palmares.vie, '*Aucune quête bouclée pour l\'instant. Il faut bien un premier.*'),
        inline: false,
      },
    )
    .setFooter({ text: 'Le mois se remet à zéro, le total à vie ne redescend jamais' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id('retour'))
      .setLabel('Retour au journal')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

// ── Commande ──────────────────────────────────────────────────────────

module.exports = {
  name: 'journal',
  description: 'Tes quêtes en cours : le détail, l\'abandon, et le classement de la guilde.',
  permission: 'Aucune',
  dm: false,
  options: [],

  async run(bot, interaction) {
    // Éphémère : c'est ton carnet. Personne d'autre n'a à lire ce que tu as
    // promis de faire, et ça évite d'encombrer le salon à chaque consultation.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const mesQuetes = () => objectifsSuivi.enCours(bot.settings, interaction.user.id);

    await interaction.editReply(journalScreen(mesQuetes(), bot.settings));
    const message = await interaction.fetchReply();

    // Le message n'étant visible que par son destinataire, il n'y a personne
    // d'autre pour cliquer : pas de contrôle d'auteur à faire ici.
    const collector = message.createMessageComponentCollector({ time: TIMEOUT_MS });

    collector.on('collect', async (i) => {
      const [, action, cle] = i.customId.split(':');

      try {
        if (action === 'retour') {
          return i.update(journalScreen(mesQuetes(), bot.settings));
        }

        if (action === 'classement') {
          return i.update(classementScreen(objectifsSuivi.classement(bot.settings)));
        }

        // La quête est relue à chaque écran plutôt que gardée en mémoire : le
        // joueur peut très bien avoir un second /journal ouvert dans un autre
        // salon, et l'écran qui affiche une quête déjà abandonnée ailleurs
        // proposerait de l'abandonner une seconde fois.
        const cible = mesQuetes().find(q => q.id === (action === 'detail' ? i.values?.[0] : cle));

        if (!cible) {
          await i.update(journalScreen(mesQuetes(), bot.settings));
          return i.followUp({
            content: '📓 Cette quête n\'est plus dans ton journal.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (action === 'detail') return i.update(detailScreen(cible, bot.settings));
        if (action === 'abandon') return i.update(abandonScreen(cible));

        if (action === 'abandon-ok') {
          objectifsSuivi.abandonner(bot.settings, interaction.user.id, cible.id);
          await i.update(journalScreen(mesQuetes(), bot.settings));
          return i.followUp({
            content: `🗑️ **${cible.cible}** est sortie de ton journal.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (err) {
        console.warn(`[journal] ${action} : ${err.message}`);
      }
    });

    collector.on('end', async () => {
      // Les composants ne répondent plus : on les retire plutôt que de les
      // laisser tromper le monde. Un éphémère périmé n'est plus modifiable,
      // d'où le silence en cas d'échec.
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Interaction expirée : rien à faire
      }
    });
  },
};
