'use strict';

/**
 * Catalogue des activités proposées par /que-faire.
 *
 * Deux axes de classement :
 *   MODE     comment on joue     → 'solo' | 'groupe' (groupe de 5)
 *   SECTION  temps qu'on y met   → 'soiree' | 'jours' | 'defi'
 *
 * D'où 6 cases à remplir : ACTIVITIES[mode][section].
 *
 * Format d'une activité :
 *   id      identifiant unique (kebab-case) — sert à éviter la répétition au re-roll
 *   titre   nom court affiché en titre d'embed
 *   resume  1 à 3 phrases qui donnent envie
 *   duree   estimation lisible ('1 à 2 h', '3 soirées', '4 à 6 semaines'…)
 *   gain    ce qu'on en retire (monture, ilvl, haut fait, souvenirs…)
 *   astuce  (optionnel) conseil pratique pour se lancer
 *
 * L'effectif n'est pas stocké par activité : il découle du mode choisi.
 *
 * ── Le champ `objectif` ───────────────────────────────────────────────
 * Une activité reste volontairement large. Le champ `objectif` dit à quel
 * endroit du profil du joueur aller chercher une cible nominative, pour
 * transformer « Chasse aux rares d'une zone » en « il te manque Griseveille » :
 *
 *   { type: 'hautFaitCriteres', categories: [97] }
 *        un haut fait entamé de ces catégories, avec ses critères manquants
 *        nommés. `categories` omis = toutes catégories confondues.
 *   { type: 'reputation' }        la faction la plus proche de son palier suivant
 *   { type: 'collection', quoi: 'montures' | 'mascottes' | 'jouets' }
 *   { type: 'mplusDonjon' }       le donjon de la saison le plus en retard
 *
 * Catégories racines Blizzard :
 *   96 Quêtes · 97 Exploration · 81 Tours de force · 201 Réputation · 95 PvP
 *   92 Personnages · 168 Donjons et raids · 169 Métiers · 155 Évènements
 *   15076 Guilde · 15117 Combats de mascottes · 15234 Héritage
 *   15246 Collections · 15301 Contenu d'extension · 15522 Gouffres · 15606 Logis
 *
 * Le champ est facultatif. Une activité sans `objectif` — celles qu'on fait
 * pour le plaisir, comme l'atelier tenue — s'affiche telle quelle, sans bloc
 * d'objectif : toutes les soirées n'ont pas à être productives.
 *
 * Le résolveur vit dans Helpers/objectifs.js, la vérification différée dans
 * Helpers/objectifsSuivi.js.
 */

const MODES = [
  {
    id: 'solo',
    label: 'Solo',
    emoji: '🧍',
    color: 0x1abc9c,
    tagline: 'Personne à attendre, on se connecte et c\'est parti.',
  },
  {
    id: 'groupe',
    label: 'Groupe de 5',
    emoji: '🛡️',
    color: 0x3498db,
    tagline: 'Un tank, un soigneur, trois DPS.',
  },
];

const SECTIONS = [
  {
    id: 'soiree',
    label: "Le temps d'une soirée",
    emoji: '🌙',
    color: 0x5865f2,
    tagline: 'Une session, un objectif, et au lit.',
  },
  {
    id: 'jours',
    label: 'Quelques jours',
    emoji: '📅',
    color: 0xe67e22,
    tagline: 'De quoi occuper deux ou trois connexions.',
  },
  {
    id: 'defi',
    label: 'Défi de plusieurs semaines !',
    emoji: '🏆',
    color: 0xf1c40f,
    tagline: 'Un projet de longue haleine, pour les têtus.',
  },
];

const ACTIVITIES = {
  // ══ SOLO ═══════════════════════════════════════════════════════════
  solo: {
    // ── Le temps d'une soirée ────────────────────────────────────────
    soiree: [
      {
        id: 'solo-transmog-legacy',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Soirée transmogrification',
        resume: 'Retour dans les vieux raids en solo pour ramasser les sets qui manquent à la garde-robe. On y entre à un niveau où plus rien ne résiste.',
        duree: '1 à 3 h',
        gain: 'Apparences, or de revente et parfois une monture rare',
        astuce: 'Choisissez une extension entière plutôt que de sauter de raid en raid.',
      },
      {
        id: 'solo-expeditions',
        objectif: { type: 'hautFaitCriteres', categories: [15522] },
        titre: 'Sprint d\'Expéditions',
        resume: 'On enchaîne les Expéditions en solo pour remplir la barre de la semaine et faire monter la clé du coffre.',
        duree: '1 à 2 h',
        gain: 'Équipement rapide et progression du Grand Coffre',
        astuce: 'Parfait quand il n\'y a personne de connecté pour monter un groupe.',
      },
      {
        id: 'solo-tournee-montures',
        objectif: { type: 'collection', quoi: 'montures' },
        titre: 'Tournée des montures rares',
        resume: 'La tournée classique : boss de monde, raids soloables et rares à monture. Tous les persos y passent, chacun relance les dés.',
        duree: '1 à 2 h',
        gain: 'Une chance de drop par personnage, et beaucoup d\'espoir',
        astuce: 'Notez votre parcours quelque part, la tournée se refait chaque semaine en pilote automatique.',
      },
      {
        id: 'solo-metiers',
        objectif: { type: 'hautFaitCriteres', categories: [169] },
        titre: 'Session métiers et récolte',
        resume: 'On se concentre sur un seul métier : farm des composants, montée des points de connaissance, craft pour la guilde.',
        duree: '1 à 2 h',
        gain: 'Or, spécialisations et crafts utiles au roster',
        astuce: 'Annoncez vos crafts sur Discord, la guilde fournit souvent les matériaux.',
      },
      {
        id: 'solo-exploration-zone',
        objectif: { type: 'hautFaitCriteres', categories: [97] },
        titre: 'Exploration d\'une zone jamais visitée',
        resume: 'On pique une zone qu\'on n\'a jamais pris le temps de faire, et on la termine : quêtes, trésors, rares, tout.',
        duree: '1 à 2 h',
        gain: 'Exploration, mascottes, jouets et un peu de lore',
        astuce: 'Coupez les add-ons de guidage, l\'exploration reprend tout son sel.',
      },
      {
        id: 'solo-chasse-aux-rares',
        objectif: { type: 'hautFaitCriteres', categories: [81, 15301] },
        titre: 'Chasse aux rares d\'une zone',
        resume: 'Une zone, sa liste de rares, et on les coche un par un jusqu\'au dernier.',
        duree: '1 à 2 h',
        gain: 'Butin de rares, jouets, mascottes et hauts faits de zone',
        astuce: 'Un canal de groupe communautaire fait apparaître les rares beaucoup plus vite.',
      },
      {
        id: 'solo-soiree-detente',
        objectif: { type: 'hautFaitCriteres', categories: [169, 81] },
        titre: 'Soirée pêche et détente',
        resume: 'Pêche, archéologie, cueillette : les activités qu\'on fait en écoutant autre chose, sans jamais mourir.',
        duree: '1 à 2 h',
        gain: 'Or, matériaux, et une soirée où le jeu ne demande rien',
        astuce: 'Les mares de pêche spéciales cachent des montures et des jouets.',
      },
      {
        id: 'solo-tour-quetes-hebdo',
        objectif: { type: 'hautFaitCriteres', categories: [96] },
        titre: 'Le tour des quêtes hebdomadaires',
        resume: 'Toutes les quêtes mondiales et hebdomadaires du perso principal, bouclées en une passe propre.',
        duree: '1 à 2 h',
        gain: 'Réputations, or, équipement d\'appoint et coffre rempli',
        astuce: 'Filtrez par récompense : inutile de tout faire, ciblez ce qui manque.',
      },
      {
        id: 'solo-atelier-mog',
        titre: 'Atelier tenue',
        resume: 'Zéro farm : on ouvre la garde-robe et on compose une vraie tenue pour chacun de ses persos, arme comprise.',
        duree: '1 h',
        gain: 'Des persos qui ont enfin l\'air de quelque chose',
        astuce: 'Postez le résultat sur Discord, ça lance toujours un concours improvisé.',
      },
      {
        id: 'solo-grand-rangement',
        titre: 'Le grand rangement',
        resume: 'Sacs, banque, banque de guilde, hôtel des ventes : on trie, on vend, on jette. La corvée qu\'on repousse depuis six mois.',
        duree: '1 h',
        gain: 'De la place, de l\'or, et une paix intérieure certaine',
        astuce: 'Mettez en vente ce qui traîne depuis une extension, ça part souvent très cher.',
      },
      {
        id: 'solo-grand-coffre',
        titre: 'Remplir le Grand Coffre',
        resume: 'Une soirée entièrement dédiée à débloquer un maximum de choix au coffre hebdomadaire, par le chemin le plus court.',
        duree: '1 à 2 h',
        gain: 'Un choix d\'équipement de plus mardi prochain',
        astuce: 'Regardez ce qui manque le lundi soir : c\'est là qu\'on rattrape en une session.',
      },
      {
        id: 'solo-boss-de-monde',
        objectif: { type: 'hautFaitCriteres', categories: [15301] },
        titre: 'Le boss de monde de la semaine',
        resume: 'Le boss hebdomadaire de {{extension}}, fait sur le principal puis sur tous les rerolls qui peuvent le tenter.',
        duree: '30 min à 1 h',
        gain: 'Une pièce d\'équipement par perso, et une chance de monture',
        astuce: 'Enchaînez les rerolls dans la foulée, le groupe public est déjà formé.',
      },
      {
        id: 'solo-farm-or',
        titre: 'Une heure de farm d\'or',
        resume: 'Pas d\'objectif de jeu, juste de la rentabilité : récolte, revente, vieux raids vidés pour le butin gris.',
        duree: '1 h',
        gain: 'De quoi financer les crafts et les consommables du mois',
        astuce: 'Les vieux raids en solo rapportent souvent plus que la récolte, à temps égal.',
      },
      {
        id: 'solo-hauts-faits-en-attente',
        objectif: { type: 'hautFaitCriteres' },
        titre: 'Le ménage dans les hauts faits',
        resume: 'On ouvre l\'onglet des hauts faits incomplets et on termine tous ceux qui sont à une ou deux cases de la fin.',
        duree: '1 à 2 h',
        gain: 'Un paquet de points ramassés pour presque rien',
        astuce: 'Triez par pourcentage d\'avancement, les plus proches sautent aux yeux.',
      },
      {
        id: 'solo-essayer-une-spe',
        titre: 'Essayer une spécialisation jamais jouée',
        resume: 'On bascule sur la spé qu\'on n\'a jamais touchée, on lit le guide, et on va la roder en Expédition ou sur des rares.',
        duree: '1 à 2 h',
        gain: 'Un rôle de plus dans la manche pour dépanner le groupe',
        astuce: 'Les Expéditions sont le terrain d\'essai idéal : on peut mourir sans gêner personne.',
      },
    ],

    // ── Quelques jours ───────────────────────────────────────────────
    jours: [
      {
        id: 'solo-monter-un-reroll',
        objectif: { type: 'hautFaitCriteres', categories: [92] },
        titre: 'Monter un reroll au niveau maximum',
        resume: 'Un nouveau perso, une classe jamais jouée, du niveau 1 jusqu\'au cap. On découvre un autre rôle pour le roster.',
        duree: '2 à 4 soirées',
        gain: 'Un perso de plus, et un rôle de secours pour les raids',
        astuce: 'Demandez un porteur en donjon à la guilde, ça divise le temps par deux.',
      },
      {
        id: 'solo-race-alliee',
        objectif: { type: 'hautFaitCriteres', categories: [92] },
        titre: 'Débloquer une race alliée',
        resume: 'Réputation, campagne d\'extension et quête de déblocage : on vise une race alliée précise et son armure d\'apparat.',
        duree: '3 à 5 jours',
        gain: 'Une nouvelle race jouable et son ensemble de patrimoine',
        astuce: 'Montez ensuite le perso du 10 au cap sans boost pour décrocher l\'ensemble.',
      },
      {
        id: 'solo-campagne-oubliee',
        objectif: { type: 'hautFaitCriteres', categories: [96] },
        titre: 'Terminer une campagne d\'extension oubliée',
        resume: 'La campagne qu\'on a abandonnée au milieu : on la reprend du début et on va jusqu\'au générique de fin.',
        duree: '3 à 4 soirées',
        gain: 'Lore, hauts faits de campagne et souvent une monture',
        astuce: 'Les campagnes anciennes se traversent très vite au niveau maximum.',
      },
      {
        id: 'solo-reputation-exaltee',
        objectif: { type: 'reputation' },
        fait: { achievement: 521 },
        titre: 'Exalté avec une faction',
        resume: 'On choisit une faction — ancienne ou actuelle — et on la pousse jusqu\'au dernier palier pour la récompense au bout.',
        duree: '3 à 7 jours',
        gain: 'Monture, tabard, recettes ou mascotte selon la faction',
        astuce: 'Vérifiez d\'abord la récompense finale, certaines factions ne valent pas le trajet.',
      },
      {
        id: 'solo-metier-zero-max',
        objectif: { type: 'hautFaitCriteres', categories: [169] },
        titre: 'Un métier de zéro au maximum',
        resume: 'On repart d\'un métier vierge et on le monte à fond, spécialisations comprises, pour couvrir un besoin de la guilde.',
        duree: '3 à 5 jours',
        gain: 'Crafts haut niveau, revenus réguliers et un service rendu au roster',
        astuce: 'Regardez ce qui manque à la guilde avant de choisir le métier.',
      },
      {
        id: 'solo-tour-des-mages',
        objectif: { type: 'hautFaitCriteres', categories: [96] },
        titre: 'La Tour des Mages',
        resume: 'Le défi solo emblématique, à réussir avec une spécialisation choisie. Ça demande de la préparation et quelques essais.',
        duree: '2 à 4 soirées',
        gain: 'Apparence d\'arme légendaire et une vraie fierté',
        astuce: 'Consommables, macros et un guide de spé : ne partez pas à l\'aveugle.',
      },
      {
        id: 'solo-quete-monture-longue',
        objectif: { type: 'collection', quoi: 'montures' },
        titre: 'Une monture à quête longue',
        resume: 'Une des montures qui demandent une chaîne de quêtes ou de collecte étalée sur plusieurs jours. On en choisit une et on la termine.',
        duree: '3 à 6 jours',
        gain: 'Une monture que peu de monde a pris la peine de faire',
        astuce: 'Beaucoup de ces chaînes ont une étape quotidienne : connectez-vous chaque jour.',
      },
      {
        id: 'solo-mascottes-campagne',
        objectif: { type: 'collection', quoi: 'mascottes' },
        fait: { achievement: 5877 },
        titre: 'Campagne de combats de mascottes',
        resume: 'Monter une équipe de mascottes solide et battre les maîtres apprivoiseurs d\'une extension entière.',
        duree: '3 à 5 jours',
        gain: 'Mascottes rares, hauts faits et une monture au bout de certaines lignes',
        astuce: 'Une bonne équipe polyvalente suffit à passer 90 % des dresseurs.',
      },
      {
        id: 'solo-remonter-ilvl',
        titre: 'Remise à niveau de l\'équipement',
        resume: 'Objectif chiffré : gagner un palier d\'ilvl complet via les crafts, les Expéditions et les améliorations, sans dépendre de personne.',
        duree: '1 semaine',
        gain: 'Un perso enfin prêt à suivre le rythme du groupe',
        astuce: 'Fixez le chiffre à l\'avance et annoncez-le, ça motive.',
      },
      {
        id: 'solo-hauts-faits-exploration',
        objectif: { type: 'hautFaitCriteres', categories: [97] },
        titre: 'Hauts faits d\'exploration d\'une extension',
        resume: 'Trésors, points d\'exploration, secrets et énigmes d\'une extension complète, méthodiquement.',
        duree: '4 à 6 jours',
        gain: 'Points de hauts faits, jouets et raccourcis que personne ne connaît',
        astuce: 'Prenez l\'extension où vous avez le plus de zones grises sur la carte.',
      },
      {
        id: 'solo-decrocher-un-titre',
        objectif: { type: 'hautFaitCriteres', categories: [81] },
        titre: 'Décrocher un titre',
        resume: 'On choisit un titre qu\'on aimerait porter, on remonte à sa source, et on fait ce qu\'il faut pour l\'obtenir.',
        duree: '2 à 5 jours',
        gain: 'Un titre qui dit quelque chose de vous, au lieu de celui par défaut',
        astuce: 'Certains titres oubliés demandent une soirée, d\'autres six mois : vérifiez avant de vous lancer.',
      },
      {
        id: 'solo-objectif-or',
        titre: 'Objectif or',
        resume: 'Une somme à atteindre, fixée à l\'avance, par les moyens qu\'on veut : hôtel des ventes, crafts, farm, revente.',
        duree: '4 à 7 jours',
        gain: 'De quoi ne plus jamais hésiter devant un craft ou une monture à acheter',
        astuce: 'Suivez deux ou trois marchandises précises plutôt que de tout regarder.',
      },
      {
        id: 'solo-preparer-la-saison',
        titre: 'Préparer la saison suivante',
        resume: 'Il reste {{joursRestants}} jours à {{saison}} : on solde ce qui va disparaître et on met de côté matériaux et or pour le redémarrage.',
        duree: '3 à 5 jours',
        gain: 'Un départ de saison sans course-poursuite',
        astuce: 'Les récompenses de saison partent avec la saison — vérifiez la liste avant qu\'il soit trop tard.',
      },
      {
        id: 'solo-collection-tabards',
        objectif: { type: 'hautFaitCriteres', categories: [15246] },
        titre: 'La collection oubliée',
        resume: 'Tabards, chemises, sacs à dos, armes d\'apparat : les collections que personne ne regarde, complétées d\'un coup.',
        duree: '3 à 5 jours',
        gain: 'Des hauts faits faciles et des tenues enfin finies',
        astuce: 'Beaucoup s\'achètent chez des vendeurs de réputation déjà exaltés.',
      },
      {
        id: 'solo-hauts-faits-pvp',
        objectif: { type: 'hautFaitCriteres', categories: [95] },
        titre: 'Les hauts faits PvP oubliés',
        resume: 'Les vieux hauts faits de champs de bataille, ceux qui demandent de gagner un objectif précis plutôt que le match.',
        duree: '4 à 6 jours',
        gain: 'Des titres rares et un compteur qui bouge enfin',
        astuce: 'Prévenez votre équipe en début de match, la plupart des joueurs jouent le jeu.',
      },
    ],

    // ── Défi de plusieurs semaines ───────────────────────────────────
    defi: [
      {
        id: 'solo-maitre-du-savoir',
        objectif: { type: 'hautFaitCriteres', categories: [96] },
        titre: 'Maître du savoir d\'une extension',
        resume: 'Toutes les quêtes de toutes les zones d\'une extension complète. Un marathon de lore, zone après zone.',
        duree: '3 à 6 semaines',
        gain: 'Le titre, les hauts faits et une connaissance du monde que personne n\'a',
        astuce: 'Une zone par soirée, sans se disperser : c\'est le seul rythme qui tient.',
      },
      {
        id: 'solo-monture-ultra-rare',
        objectif: { type: 'collection', quoi: 'montures' },
        titre: 'Farm d\'une monture ultra-rare',
        resume: 'On choisit une monture au taux de drop dérisoire et on y retourne chaque semaine, sur tous ses persos, jusqu\'à ce qu\'elle tombe.',
        duree: 'Indéterminée (des mois, parfois)',
        gain: 'La monture, et le droit de s\'en vanter pendant des années',
        astuce: 'Automatisez : une routine hebdomadaire courte tient bien plus longtemps qu\'un gros farm.',
      },
      {
        id: 'solo-cap-montures',
        objectif: { type: 'collection', quoi: 'montures' },
        fait: { monturesAuMoins: 400 },
        titre: 'Franchir un cap de collection de montures',
        resume: 'Un palier de collection à atteindre (100, 250, 400…), en piochant partout : réputations, raids, métiers, PvP.',
        duree: '4 à 10 semaines',
        gain: 'Les montures offertes aux paliers de collection',
        astuce: 'Listez d\'abord les montures les plus faciles qui vous manquent, le compteur monte vite.',
      },
      {
        id: 'solo-une-classe-de-chaque',
        objectif: { type: 'hautFaitCriteres', categories: [92] },
        titre: 'Un personnage de chaque classe',
        resume: 'Monter au niveau maximum un représentant de chaque classe du jeu. Le projet reroll ultime.',
        duree: '2 à 4 mois',
        gain: 'Le haut fait, et surtout la polyvalence pour dépanner n\'importe quel groupe',
        astuce: 'Comptez celles que vous avez déjà : le projet est souvent moins loin qu\'il en a l\'air.',
      },
      {
        id: 'solo-une-vie-un-perso',
        titre: 'Une vie, un personnage',
        resume: 'Un perso monté du niveau 1 au cap sans jamais mourir. Une seule mort et tout repart de zéro.',
        duree: '3 à 8 semaines',
        gain: 'Rien du tout, sauf la tension la plus intense que le jeu puisse offrir',
        astuce: 'Annoncez-le sur Discord : la pression du public fait partie du jeu.',
      },
      {
        id: 'solo-garde-robe-complete',
        objectif: { type: 'hautFaitCriteres', categories: [15246] },
        titre: 'Garde-robe complète d\'une extension',
        resume: 'Toutes les apparences d\'une extension : raids, donjons, PvP, quêtes, métiers. On coche l\'onglet jusqu\'au bout.',
        duree: '4 à 8 semaines',
        gain: 'Des tenues que plus personne ne peut obtenir facilement',
        astuce: 'Faites une passe par mode de difficulté, les apparences diffèrent souvent.',
      },
      {
        id: 'solo-exalte-extension',
        objectif: { type: 'reputation' },
        fait: { achievement: 518 },
        titre: 'Exalté avec toutes les factions d\'une extension',
        resume: 'Chaque faction de l\'extension choisie, jusqu\'au dernier palier de réputation. Long, mais très rentable.',
        duree: '4 à 6 semaines',
        gain: 'Montures, recettes, mascottes et un paquet de hauts faits',
        astuce: 'Repérez les quêtes journalières qui donnent de la réput à plusieurs factions à la fois.',
      },
      {
        id: 'solo-collection-jouets',
        objectif: { type: 'collection', quoi: 'jouets' },
        fait: { jouetsAuMoins: 400, mascottesAuMoins: 1000 },
        titre: 'Chasse aux jouets et aux mascottes',
        resume: 'Deux collections qu\'on néglige toujours : on liste ce qui manque et on va tout chercher, jusqu\'au palier suivant.',
        duree: '4 à 8 semaines',
        gain: 'Paliers de collection, hauts faits et un sac plein de bêtises',
        astuce: 'Beaucoup de jouets s\'achètent simplement, commencez par ceux-là.',
      },
      {
        id: 'solo-defi-absurde',
        titre: 'Le défi que personne ne demande',
        resume: 'Une règle absurde tenue jusqu\'au niveau maximum : aucun équipement au-dessus du gris, aucun sort d\'attaque, aucun point de talent… À vous de choisir votre punition.',
        duree: '4 semaines et plus',
        gain: 'Absolument rien, et c\'est magnifique',
        astuce: 'Tenez un journal sur Discord, c\'est ce qui rend le défi suivable par les autres.',
      },
      {
        id: 'solo-tous-les-raids-retro',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Vider tous les raids d\'avant',
        resume: 'Extension par extension, chaque raid ancien nettoyé en solo jusqu\'au dernier boss. Vingt ans de contenu, méthodiquement.',
        duree: '2 à 3 mois',
        gain: 'Transmog, montures, or et hauts faits par charretées',
        astuce: 'Une extension à la fois, du plus ancien au plus récent : la difficulté monte au bon rythme.',
      },
      {
        id: 'solo-tous-les-metiers',
        objectif: { type: 'hautFaitCriteres', categories: [169] },
        titre: 'Couvrir tous les métiers',
        resume: 'Répartir les métiers du jeu sur ses personnages jusqu\'à ce que la guilde n\'ait plus jamais besoin de chercher un crafteur.',
        duree: '2 à 3 mois',
        gain: 'L\'autonomie totale, et un service que toute la guilde utilisera',
        astuce: 'Commencez par ce qui manque au roster, pas par ce qui rapporte le plus.',
      },
      {
        id: 'solo-la-fortune',
        titre: 'La fortune',
        resume: 'Un objectif d\'or à sept chiffres, atteint par le commerce, le craft et la patience. Un vrai métier parallèle.',
        duree: '2 à 6 mois',
        gain: 'Le haut fait, et le luxe de ne plus jamais compter',
        astuce: 'Spécialisez-vous sur un marché unique — l\'éparpillement est ce qui fait perdre de l\'or.',
      },
      {
        id: 'solo-tous-les-titres-extension',
        objectif: { type: 'hautFaitCriteres', categories: [81] },
        titre: 'Tous les titres d\'une extension',
        resume: 'Chaque titre obtenable dans une extension donnée : exploration, réputations, hauts faits, PvP. Aucun laissé de côté.',
        duree: '6 à 10 semaines',
        gain: 'Une liste de titres que personne d\'autre n\'a pris la peine de finir',
        astuce: 'Repérez le plus long dès le départ et avancez-le en fond de tâche.',
      },
      {
        id: 'solo-hauts-faits-legendaires',
        objectif: { type: 'hautFaitCriteres', categories: [81, 168] },
        titre: 'Les hauts faits que plus personne ne fait',
        resume: 'Les hauts faits d\'événements saisonniers et de contenu abandonné, ceux qui demandent d\'attendre la bonne période de l\'année.',
        duree: 'Plusieurs mois, par intermittence',
        gain: 'Montures d\'événement et titres devenus rares',
        astuce: 'Notez les dates dans un calendrier : rater la fenêtre coûte une année entière.',
      },
    ],
  },

  // ══ GROUPE DE 5 ════════════════════════════════════════════════════
  groupe: {
    // ── Le temps d'une soirée ────────────────────────────────────────
    soiree: [
      {
        id: 'grp-chaine-mplus',
        objectif: { type: 'mplusDonjon' },
        titre: 'Chaîne de clés Mythique+',
        resume: 'On monte un groupe et on enchaîne les clés jusqu\'à ce que quelqu\'un craque. Départ sur {{donjon}}, et on finit la soirée avec une clé plus haute qu\'au début.',
        duree: '2 à 3 h',
        gain: 'Score M+, équipement et une place au Grand Coffre',
        astuce: 'Affixes de la semaine : {{affixes}}. Commencez deux paliers sous votre meilleure clé pour chauffer le groupe.',
      },
      {
        id: 'grp-tour-mythique-zero',
        objectif: { type: 'mplusDonjon' },
        titre: 'Le tour des Mythique 0',
        resume: 'On enchaîne {{tousLesDonjons}} de {{saison}} en Mythique 0, à la suite, sans pression de chrono.',
        duree: '2 à 3 h',
        gain: 'Équipement de base et un groupe qui apprend les routes',
        astuce: 'Idéal pour préparer une soirée M+ sans découvrir les mécaniques sous le chrono.',
      },
      {
        id: 'grp-donjon-du-soir',
        objectif: { type: 'mplusDonjon' },
        titre: 'Le donjon du soir',
        resume: 'Un seul donjon, {{donjon}}, monté palier par palier jusqu\'à ce que le groupe cale. Chrono : {{chrono}}.',
        duree: '1 à 2 h',
        gain: 'Une clé maîtrisée à fond plutôt que huit survolées',
        astuce: 'C\'est en refaisant le même donjon que les routes rentrent vraiment.',
      },
      {
        id: 'grp-marche-du-temps',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Donjons Marche du Temps',
        resume: 'Quand l\'événement est actif : on enchaîne les donjons rétro pour la nostalgie et la caisse de fin de quête.',
        duree: '1 à 2 h',
        gain: 'Équipement, réputations anciennes et transmog',
        astuce: 'Pensez aux objets qui boostent l\'XP, ça fait monter les rerolls en même temps.',
      },
      {
        id: 'grp-raid-legacy-transmog',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Raid rétro à cinq',
        resume: 'Un vieux raid nettoyé à cinq pour le transmog et les montures. Tout le monde repart avec quelque chose.',
        duree: '1 à 2 h',
        gain: 'Apparences, montures rares et or',
        astuce: 'Répartissez les rôles de loot à l\'avance pour éviter les doublons inutiles.',
      },
      {
        id: 'grp-course-hauts-faits',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Course aux hauts faits de donjon',
        resume: 'On choisit un méta-haut fait de donjons et on le boucle en une soirée à cinq.',
        duree: '2 à 3 h',
        gain: 'Points de hauts faits et souvent une monture à la clé',
        astuce: 'Les hauts faits des anciennes extensions se plient très vite au niveau actuel.',
      },
      {
        id: 'grp-expeditions-equipe',
        objectif: { type: 'hautFaitCriteres', categories: [15522] },
        titre: 'Expéditions en équipe',
        resume: 'Les Expéditions poussées à haut niveau, à cinq : plus dur, plus rapide, et le coffre monte pour tout le monde.',
        duree: '1 à 2 h',
        gain: 'Équipement et progression hebdomadaire du groupe entier',
        astuce: 'Un groupe bien équipé passe des paliers infaisables en solo.',
      },
      {
        id: 'grp-pvp',
        objectif: { type: 'hautFaitCriteres', categories: [95] },
        titre: 'Soirée PvP en groupe',
        resume: 'Champs de bataille en groupe complet, ou arènes entre membres. Le but : gagner plus de matchs qu\'on n\'en perd.',
        duree: '1 à 3 h',
        gain: 'Honneur, conquête et fous rires garantis',
        astuce: 'Un groupe de guilde en BG aléatoire change complètement le taux de victoire.',
      },
      {
        id: 'grp-donjon-handicap',
        titre: 'Donjon à handicap',
        resume: 'Un donjon avec une règle idiote décidée à l\'avance : sans soigneur, en tenue de ville, un seul sort autorisé… On mesure la casse.',
        duree: '1 h',
        gain: 'Aucun. C\'est tout l\'intérêt.',
        astuce: 'À enregistrer, ça finit toujours en anecdote de guilde.',
      },
      {
        id: 'grp-speedrun',
        objectif: { type: 'mplusDonjon' },
        titre: 'Chrono en main',
        resume: 'Le même donjon refait en boucle, {{donjon}}, montre en main. Chrono : {{chrono}}. À chaque passage on rogne quelques secondes.',
        duree: '1 à 2 h',
        gain: 'Une route optimisée et un groupe qui joue vraiment ensemble',
        astuce: 'Une route dessinée avant la première tentative fait gagner plus qu\'une heure d\'essais.',
      },
      {
        id: 'grp-porter-un-nouveau',
        titre: 'Soirée parrainage',
        resume: 'On emmène un nouveau membre ou un reroll dans des donjons, on explique, on équipe. Formation accélérée.',
        duree: '1 à 2 h',
        gain: 'Un joueur de plus prêt pour le contenu de groupe',
        astuce: 'Laissez le nouveau tank ou soigner : c\'est là qu\'on apprend le plus vite.',
      },
      {
        id: 'grp-semaine-des-affixes',
        objectif: { type: 'mplusDonjon' },
        titre: 'Composer avec les affixes',
        resume: 'Cette semaine c\'est {{affixes}}. On adapte la composition et la route en conséquence, au lieu de subir.',
        duree: '2 à 3 h',
        gain: 'Des clés validées là où la semaine dernière ça passait mal',
        astuce: 'Un seul changement de route bien choisi vaut mieux que trois consommables.',
      },
      {
        id: 'grp-casser-son-record',
        objectif: { type: 'mplusDonjon' },
        titre: 'Casser son record',
        resume: 'Un seul but : valider une clé d\'un palier au-dessus de tout ce que le groupe a fait jusqu\'ici. On tente jusqu\'à ce que ça passe.',
        duree: '2 à 3 h',
        gain: 'Un plafond qui recule, et un groupe qui y croit',
        astuce: 'Choisissez le donjon le mieux maîtrisé, pas celui qui rapporte le plus.',
      },
      {
        id: 'grp-sans-guide',
        titre: 'Sans guide ni add-on',
        resume: '{{donjon}}, sans route préparée, sans add-on de timer, sans vidéo. On redécouvre le donjon en le jouant.',
        duree: '1 à 2 h',
        gain: 'Une compréhension du donjon que la route toute faite ne donne jamais',
        astuce: 'Interdisez aussi le vocal pendant les packs, si vous voulez corser.',
      },
      {
        id: 'grp-rotation-des-roles',
        titre: 'Tout le monde change de rôle',
        resume: 'Le tank passe DPS, le soigneur tank, et ainsi de suite. Un donjon dans cette configuration, à voir ce qu\'il en reste.',
        duree: '1 à 2 h',
        gain: 'Chacun comprend enfin ce que les autres subissent',
        astuce: 'Prenez un Mythique 0 : le but est d\'apprendre, pas de valider un chrono.',
      },
      {
        id: 'grp-double-donjon',
        objectif: { type: 'mplusDonjon' },
        titre: 'Le duel de donjons',
        resume: '{{donjon}} puis {{donjon2}}, le même palier, chronomètre en main. On compare, et le perdant paie la tournée de consommables.',
        duree: '1 à 2 h',
        gain: 'Deux clés validées et un classement interne à défendre',
        astuce: 'Notez les temps quelque part, la revanche est bien plus drôle avec des chiffres.',
      },
    ],

    // ── Quelques jours ───────────────────────────────────────────────
    jours: [
      {
        id: 'grp-palier-score-mplus',
        objectif: { type: 'mplusDonjon' },
        fait: { scoreMplusAuMoins: 2000 },
        titre: 'Franchir un palier de score M+',
        resume: 'On se fixe un score cible et on enchaîne les clés jusqu\'à l\'atteindre, en montant progressivement les paliers.',
        duree: '3 à 5 soirées',
        gain: 'Score, équipement et un groupe rodé',
        astuce: 'Gardez le même groupe d\'un soir à l\'autre, la progression est bien plus rapide.',
      },
      {
        id: 'grp-toutes-les-cles-en-temps',
        objectif: { type: 'mplusDonjon' },
        titre: 'Toute la rotation dans le temps',
        resume: 'Chacun des donjons de {{saison}} validé dans le chrono au même palier. Aucun laissé de côté, même {{donjon}} que la moitié du groupe déteste.',
        duree: '3 à 5 soirées',
        gain: 'Un score homogène et plus aucune clé « à éviter »',
        astuce: 'Commencez par le donjon le moins aimé, tant que la motivation est haute.',
      },
      {
        id: 'grp-gloire-donjons',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Gloire des donjons d\'une extension',
        resume: 'Le méta-haut fait de donjons d\'une extension : chaque boss avec sa condition spéciale, jusqu\'au dernier.',
        duree: '2 à 4 soirées',
        gain: 'Une monture et un paquet de hauts faits',
        astuce: 'Lisez les conditions avant d\'entrer, certaines se ratent dès le premier pull.',
      },
      {
        id: 'grp-equipe-de-rerolls',
        objectif: { type: 'hautFaitCriteres', categories: [92] },
        titre: 'L\'équipe de rerolls',
        resume: 'Cinq membres créent un perso neuf le même soir et ne les jouent qu\'ensemble, du premier donjon jusqu\'au cap.',
        duree: '4 à 6 soirées',
        gain: 'Cinq persos de plus et un groupe qui se connaît par cœur',
        astuce: 'Règle d\'or : personne ne monte son perso en dehors des sessions communes.',
      },
      {
        id: 'grp-equiper-le-groupe',
        titre: 'Équiper tout le groupe',
        resume: 'Objectif collectif : amener les cinq membres au même palier d\'ilvl, en priorisant à chaque run celui qui est en retard.',
        duree: '1 semaine',
        gain: 'Un groupe capable d\'attaquer le contenu difficile ensemble',
        astuce: 'Tenez la liste des besoins sur Discord, le loot se répartit tout seul ensuite.',
      },
      {
        id: 'grp-tour-extension-complete',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Tous les donjons d\'une extension',
        resume: 'On prend une extension et on refait l\'intégralité de ses donjons dans l\'ordre, du premier au dernier.',
        duree: '3 à 4 soirées',
        gain: 'Transmog, montures de donjon et une bonne dose de nostalgie',
        astuce: 'En Mythique 0 rétro, le loot et les apparences sont bien meilleurs qu\'en Normal.',
      },
      {
        id: 'grp-farm-montures-donjons',
        objectif: { type: 'collection', quoi: 'montures' },
        titre: 'Farm des montures de donjons',
        resume: 'La liste des montures qui tombent en donjon, et une passe hebdomadaire à cinq sur chacune d\'entre elles.',
        duree: '1 à 2 semaines',
        gain: 'Des montures pour plusieurs membres à la fois',
        astuce: 'À cinq, cinq dés sont lancés par boss : c\'est bien plus rentable qu\'en solo.',
      },
      {
        id: 'grp-marche-du-temps-complet',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Marche du temps intégrale',
        resume: 'Pendant l\'événement : tous les donjons de la rotation, plus la quête hebdomadaire, pour les cinq membres du groupe.',
        duree: '2 à 3 soirées',
        gain: 'Équipement, réputations anciennes et hauts faits d\'événement',
        astuce: 'L\'événement ne dure qu\'une semaine : planifiez les soirées dès son ouverture.',
      },
      {
        id: 'grp-la-cle-de-chacun',
        objectif: { type: 'mplusDonjon' },
        titre: 'La clé de chacun',
        resume: 'Cinq membres, cinq clés à monter. On tourne jusqu\'à ce que tout le monde ait fait progresser la sienne, pas seulement le porteur du jour.',
        duree: '3 à 4 soirées',
        gain: 'Cinq clés hautes au lieu d\'une, et un roulement qui tient',
        astuce: 'Fixez l\'ordre à l\'avance, sinon c\'est toujours la même clé qui passe.',
      },
      {
        id: 'grp-coffre-du-groupe',
        titre: 'Le Grand Coffre pour les cinq',
        resume: 'Objectif collectif : chacun des cinq membres débloque son maximum de choix au coffre avant la réinitialisation.',
        duree: '2 à 3 soirées',
        gain: 'Cinq coffres pleins le mardi, au lieu de deux',
        astuce: 'Commencez tôt dans la semaine, les fins de reset sont toujours dans la précipitation.',
      },
      {
        id: 'grp-fin-de-saison',
        titre: 'Le sprint de fin de saison',
        resume: 'Il reste {{joursRestants}} jours à {{saison}} : on liste ce qui va disparaître et on va le chercher pendant qu\'il est encore temps.',
        duree: '1 à 2 semaines',
        gain: 'Les récompenses de saison, qui ne reviendront pas',
        astuce: 'La monture et le titre de saison partent à la seconde où elle se termine.',
      },
      {
        id: 'grp-formation-tank-heal',
        titre: 'Former un tank et un soigneur',
        resume: 'Deux membres du groupe passent sur les rôles dont la guilde manque, et on les fait monter en donjon jusqu\'à ce qu\'ils tiennent une clé.',
        duree: '4 à 6 soirées',
        gain: 'Les deux rôles qui bloquent toujours la formation des groupes',
        astuce: 'Montez très progressivement : un tank cassé en trois soirées ne revient pas.',
      },
      {
        id: 'grp-hauts-faits-saison',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Les hauts faits de la rotation',
        resume: 'Chaque donjon de {{saison}} a ses hauts faits de boss, ceux qu\'on ne décroche jamais en jouant normalement. On les coche un par un.',
        duree: '3 à 5 soirées',
        gain: 'Des hauts faits que la plupart des groupes ignorent complètement',
        astuce: 'Faites-les en Mythique 0 : les conditions sont les mêmes, la pression en moins.',
      },
    ],

    // ── Défi de plusieurs semaines ───────────────────────────────────
    defi: [
      {
        id: 'grp-gloire-extension-complete',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Gloire d\'une extension entière',
        resume: 'Tous les méta-hauts faits de donjons d\'une extension, du premier au dernier, avec le même groupe.',
        duree: '4 à 8 semaines',
        gain: 'Plusieurs montures et un compteur de hauts faits qui explose',
        astuce: 'Constituez un groupe fixe : refaire les explications à chaque session tue le projet.',
      },
      {
        id: 'grp-groupe-fixe-saison',
        objectif: { type: 'mplusDonjon' },
        titre: 'Le groupe fixe de la saison',
        resume: 'Cinq joueurs, deux soirées par semaine, jusqu\'au bout de {{saison}}. On monte ensemble et on ne change personne en route.',
        duree: 'Il reste {{joursRestants}} jours de saison',
        gain: 'Le meilleur score que chacun ait jamais eu, sans exception',
        astuce: 'C\'est la régularité qui paie, pas le nombre d\'heures par soirée.',
      },
      {
        id: 'grp-pousser-la-cle-haut',
        objectif: { type: 'mplusDonjon' },
        fait: { scoreMplusAuMoins: 2500 },
        titre: 'Pousser la clé le plus haut possible',
        resume: 'Un objectif de palier ambitieux, atteint donjon par donjon, avec analyse des échecs entre les sessions.',
        duree: '6 semaines et plus',
        gain: 'Un niveau de jeu qui change durablement, et la monture de saison',
        astuce: 'Relisez les logs après chaque échec : c\'est là que se trouvent les vraies secondes perdues.',
      },
      {
        id: 'grp-tous-les-donjons-du-jeu',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Tous les donjons du jeu',
        resume: 'Le marathon total : chaque donjon existant, toutes extensions confondues, coché un par un avec le même groupe.',
        duree: '2 à 3 mois',
        gain: 'Un tour complet de vingt ans de jeu, et des hauts faits partout',
        astuce: 'Tenez le tableau de suivi sur Discord, c\'est ce qui fait tenir le projet jusqu\'au bout.',
      },
      {
        id: 'grp-toutes-montures-donjons',
        objectif: { type: 'collection', quoi: 'montures' },
        titre: 'Toutes les montures de donjon',
        resume: 'La liste intégrale des montures droppables à cinq, farmée chaque semaine jusqu\'à ce que chacun ait la sienne.',
        duree: '2 mois et plus',
        gain: 'Des montures que le groupe entier finit par obtenir',
        astuce: 'Une passe hebdomadaire fixe, courte : c\'est ce qui survit à la lassitude.',
      },
      {
        id: 'grp-cinq-memes-classes',
        titre: 'Le groupe mono-classe',
        resume: 'Cinq joueurs, la même classe, et tout le contenu de groupe fait dans cette configuration absurde.',
        duree: '4 à 8 semaines',
        gain: 'Une compréhension redoutable de la classe, et beaucoup de regards ahuris',
        astuce: 'Choisissez une classe qui peut couvrir tous les rôles, sinon ça s\'arrête au premier donjon.',
      },
      {
        id: 'grp-projet-guilde',
        objectif: { type: 'hautFaitCriteres', categories: [15076] },
        titre: 'Projet de guilde',
        resume: 'Un objectif que plusieurs groupes de cinq portent en parallèle : équiper tout le monde, boucler une extension, ou monter un événement de guilde de A à Z.',
        duree: '4 à 8 semaines',
        gain: 'Une guilde soudée et une soirée dont on reparle longtemps',
        astuce: 'Désignez un responsable et un canal Discord dédié, sinon le projet s\'éteint.',
      },
      {
        id: 'grp-record-de-guilde',
        objectif: { type: 'hautFaitCriteres', categories: [15076] },
        titre: 'Le record de la guilde',
        resume: 'Aller chercher la clé la plus haute jamais validée par un groupe de Donjons & Jambons, et inscrire les cinq noms au tableau.',
        duree: '6 à 10 semaines',
        gain: 'Le record, affiché, et un objectif que les suivants voudront battre',
        astuce: 'Publiez le record actuel sur Discord : c\'est ce qui donne envie à d\'autres de s\'y mettre.',
      },
      {
        id: 'grp-former-un-second-groupe',
        titre: 'Former le groupe suivant',
        resume: 'Le groupe expérimenté prend cinq membres moins avancés et les amène jusqu\'à être autonomes en clés. On se rend remplaçable.',
        duree: '6 à 8 semaines',
        gain: 'Deux groupes au lieu d\'un, et une guilde qui ne dépend plus de cinq personnes',
        astuce: 'Laissez-les échouer seuls de temps en temps, c\'est là qu\'ils deviennent autonomes.',
      },
      {
        id: 'grp-marathon-extension',
        objectif: { type: 'hautFaitCriteres', categories: [168] },
        titre: 'Le marathon d\'une extension',
        resume: 'Une extension ancienne prise en entier : tous ses donjons, tous ses hauts faits, toutes ses montures à cinq, jusqu\'à épuisement du contenu.',
        duree: '2 mois',
        gain: 'Une extension vidée de fond en comble, à cinq',
        astuce: 'Tenez la liste des restes à faire, c\'est ce qui évite de tourner en rond les dernières semaines.',
      },
      {
        id: 'grp-toutes-les-cles-au-plafond',
        objectif: { type: 'mplusDonjon' },
        titre: 'La rotation entière au plafond',
        resume: 'Non plus valider {{tousLesDonjons}} dans le temps, mais les valider tous au palier le plus haut que le groupe sache tenir.',
        duree: '8 semaines et plus',
        gain: 'Un score que très peu de groupes de guilde atteignent',
        astuce: 'Le donjon le plus faible tire tout le reste vers le bas : c\'est lui qu\'il faut travailler.',
      },
    ],
  },
};

// ── Gabarits ──────────────────────────────────────────────────────────

/**
 * Les textes du catalogue peuvent contenir des jetons résolus au moment du
 * tirage avec les données de la veille (data/wow-season.json) :
 *
 *   {{donjon}}          un donjon de la rotation, tiré au sort
 *   {{donjon2}}         un second donjon, différent du premier
 *   {{chrono}}          le chrono de {{donjon}} — « 28 minutes »
 *   {{tousLesDonjons}}  « les 8 donjons » de la rotation
 *   {{saison}}          « Midnight — Saison 1 »
 *   {{extension}}       « Midnight »
 *   {{affixes}}         les affixes de la semaine
 *   {{joursRestants}}   jours avant la fin de la saison
 *
 * Sans veille disponible (clés Blizzard absentes, API en panne, premier
 * démarrage), chaque jeton retombe sur une formulation générique : le texte
 * reste lisible, il perd juste en précision. Aucune accolade ne doit jamais
 * atteindre l'affichage.
 *
 * Les jetons portent leur article et leur unité (« les 8 donjons », « 28
 * minutes ») plutôt que la valeur nue : c'est ce qui permet au repli de rester
 * grammatical dans la phrase d'accueil.
 */

const REPLIS = {
  donjon:         'un donjon de la rotation',
  donjon2:        'un autre donjon',
  chrono:         'le temps imparti',
  tousLesDonjons: 'tous les donjons',
  saison:         'la saison en cours',
  extension:      'l\'extension actuelle',
  affixes:        'les affixes de la semaine',
  joursRestants:  'quelques',
};

/**
 * Construit le jeu de valeurs d'un rendu. Les deux donjons sont tirés une seule
 * fois par activité pour que {{donjon}} et {{timer}} restent cohérents entre eux.
 */
function contexteRendu(live) {
  if (!live?.dungeons?.length) return { ...REPLIS };

  const pool = live.dungeons;
  const d1   = pool[Math.floor(Math.random() * pool.length)];
  const restants = pool.filter(d => d.challengeModeId !== d1.challengeModeId);
  const d2   = restants.length
    ? restants[Math.floor(Math.random() * restants.length)]
    : d1;

  return {
    donjon:         d1.name,
    donjon2:        d2.name,
    chrono:         `${d1.timerMinutes} minutes`,
    tousLesDonjons: `les ${pool.length} donjons`,
    saison:         live.season?.label   || REPLIS.saison,
    extension:      live.expansion?.name || REPLIS.extension,
    affixes:        live.affixes?.names?.join(', ') || REPLIS.affixes,
    joursRestants:  live.season?.daysLeft != null ? String(live.season.daysLeft) : REPLIS.joursRestants,
  };
}

/** Remplace les jetons d'une chaîne. Un jeton inconnu est retiré proprement. */
function appliquerGabarit(texte, ctx) {
  if (typeof texte !== 'string') return texte;
  return texte.replace(/\{\{(\w+)\}\}/g, (_, cle) => ctx[cle] ?? REPLIS[cle] ?? '');
}

/**
 * Rend une activité avec les données de la veille.
 * @param {object} activity   activité brute du catalogue
 * @param {object|null} live  contenu de wow-season.json, ou null
 * @returns {object} copie de l'activité, jetons résolus
 */
function renderActivity(activity, live) {
  const ctx = contexteRendu(live);
  return {
    ...activity,
    titre:  appliquerGabarit(activity.titre,  ctx),
    resume: appliquerGabarit(activity.resume, ctx),
    duree:  appliquerGabarit(activity.duree,  ctx),
    gain:   appliquerGabarit(activity.gain,   ctx),
    astuce: appliquerGabarit(activity.astuce, ctx),
  };
}

// ── Ce qui est déjà fait ──────────────────────────────────────────────

/**
 * Une activité peut porter un critère `fait` qui dit à quoi on reconnaît
 * qu'un joueur l'a déjà accomplie :
 *
 *   { achievement: 5877 }            haut fait obtenu
 *   { quete: 31570 }                 quête terminée
 *   { monturesAuMoins: 400 }         seuil de collection atteint
 *   { mascottesAuMoins: 1000 }       idem mascottes
 *   { jouetsAuMoins: 400 }           idem jouets
 *   { scoreMplusAuMoins: 2000 }      score Mythique+ de la saison
 *   { reputationsExalteesAuMoins: 30 }
 *
 * Plusieurs clés dans le même objet doivent TOUTES être satisfaites.
 *
 * Les identifiants de hauts faits ne se devinent pas : chacun de ceux présents
 * dans ce fichier a été relevé dans l'export wago.tools puis confirmé contre
 * /data/wow/achievement/{id} de l'API officielle. Pour en ajouter, refaire ce
 * chemin — un identifiant inventé filtrerait silencieusement une activité.
 *
 * Règle de sûreté : dans le doute, on ne filtre pas. Une donnée absente (profil
 * privé, appel en échec) vaut « pas fait », jamais « fait ».
 */
function estFait(activity, progress) {
  const c = activity.fait;
  if (!c || !progress?.ok) return false;

  const tests = [];
  if (c.achievement != null) tests.push(progress.hautsFaits?.has(c.achievement) === true);
  if (c.quete != null)       tests.push(progress.quetes?.has(c.quete) === true);
  if (c.monturesAuMoins != null)  tests.push(progress.montures  != null && progress.montures  >= c.monturesAuMoins);
  if (c.mascottesAuMoins != null) tests.push(progress.mascottes != null && progress.mascottes >= c.mascottesAuMoins);
  if (c.jouetsAuMoins != null)    tests.push(progress.jouets    != null && progress.jouets    >= c.jouetsAuMoins);
  if (c.scoreMplusAuMoins != null) tests.push(progress.scoreMplus != null && progress.scoreMplus >= c.scoreMplusAuMoins);
  if (c.reputationsExalteesAuMoins != null) tests.push(progress.exaltees != null && progress.exaltees >= c.reputationsExalteesAuMoins);

  return tests.length > 0 && tests.every(Boolean);
}

/** Sépare une case en « reste à faire » et « déjà fait ». */
function trierParEtat(modeId, sectionId, progress) {
  const faits = [], aFaire = [];
  for (const a of getActivities(modeId, sectionId)) {
    (estFait(a, progress) ? faits : aFaire).push(a);
  }
  return { aFaire, faits };
}

/** Retourne la définition d'un mode par son id. */
function getMode(id) {
  return MODES.find(m => m.id === id) || null;
}

/** Retourne la définition d'une section par son id. */
function getSection(id) {
  return SECTIONS.find(s => s.id === id) || null;
}

/** Liste des activités d'une case (mode × section). */
function getActivities(modeId, sectionId) {
  return ACTIVITIES[modeId]?.[sectionId] || [];
}

/**
 * Tire une activité au hasard dans une case.
 *
 * Par défaut, ce que le joueur a déjà accompli est écarté du tirage. Si tout est
 * fait — ou si `inclureFaits` est demandé — on repioche dans la liste complète
 * plutôt que de ne rien renvoyer : mieux vaut une redite qu'un écran vide.
 *
 * @param {string} modeId      'solo' | 'groupe'
 * @param {string} sectionId   'soiree' | 'jours' | 'defi'
 * @param {string} [excludeId] activité à éviter (celle déjà proposée, pour un re-roll)
 * @param {object} [options]   { progress, inclureFaits }
 */
function pickActivity(modeId, sectionId, excludeId, options = {}) {
  const { progress = null, inclureFaits = false } = options;
  const list = getActivities(modeId, sectionId);
  if (!list.length) return null;

  const { aFaire } = trierParEtat(modeId, sectionId, progress);
  let pool = (inclureFaits || !aFaire.length) ? list : aFaire;

  if (pool.length > 1 && excludeId) {
    const sansDoublon = pool.filter(a => a.id !== excludeId);
    if (sansDoublon.length) pool = sansDoublon;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Compte les activités d'une case.
 * Sans progression : un simple total. Avec : { total, faits, restants }.
 */
function countActivities(modeId, sectionId, progress = null) {
  const total = getActivities(modeId, sectionId).length;
  if (!progress?.ok) return { total, faits: 0, restants: total };
  const { faits, aFaire } = trierParEtat(modeId, sectionId, progress);
  return { total, faits: faits.length, restants: aFaire.length };
}

/** Cumul d'un mode, toutes durées confondues. */
function countMode(modeId, progress = null) {
  return SECTIONS.reduce((acc, s) => {
    const c = countActivities(modeId, s.id, progress);
    return { total: acc.total + c.total, faits: acc.faits + c.faits, restants: acc.restants + c.restants };
  }, { total: 0, faits: 0, restants: 0 });
}

module.exports = {
  MODES,
  SECTIONS,
  ACTIVITIES,
  getMode,
  getSection,
  getActivities,
  pickActivity,
  countActivities,
  countMode,
  renderActivity,
  estFait,
  trierParEtat,
};
