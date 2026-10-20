/** Textes de l'interface en français. en.ts doit avoir exactement les mêmes clés (vérifié par TypeScript). */
export const MESSAGES_FR = {
  // Unités, formats
  'souls': (n: string) => `${n} Âmes`,
  'souls.unit': 'Âmes',
  'souls.inPocket': (n: string) => `💰 ${n} Âmes en poche`,
  'souls.detected': (n: string) => `Âmes détectées : ${n}`,
  'category.weapon': 'Arme',
  'category.vitality': 'Vitalité',
  'category.spirit': 'Spirit',
  'item.active': 'Actif',

  // Boutique
  'shop.prefix': 'BOUTIQUE : ',
  'shop.tab.weapon': 'ONGLET ARME (Orange)',
  'shop.tab.vitality': 'ONGLET VITALITÉ (Vert)',
  'shop.tab.spirit': 'ONGLET ESPRIT (Violet)',
  'shop.tier': (roman: string, cost: string) => `Palier ${roman} (${cost} Âmes)`,

  // Inventaire plein / amélioration
  'slot.fullSellFirst': "⇄ Inventaire plein : vends un objet avant d'acheter",
  'slot.upgradeTitle': "Amélioration : l'objet prend la place de son composant, pas besoin de slot libre",
  'slot.sellTitle': 'Inventaire plein : vends cet objet (le moins utile pour ton build) pour libérer un slot',
  'slot.replaces': '⬆ Remplace',
  'slot.sell': '⇄ Vendre',
  'inv.label': (occupied: number, available: number, full: boolean) =>
    `inventaire ${occupied}/${available}${full ? ' — PLEIN' : ''}`,
  'inv.ownedCount': (n: number) => `${n} objets possédés`,

  // Overlay
  'overlay.clickThroughTitle': 'Verrouiller/Déverrouiller la souris (Alt+L)',
  'overlay.hideTitle': "Masquer l'Overlay (Alt+O)",
  'overlay.ghostActive': '🔒 Mode Fantôme actif —',
  'overlay.abilities': 'Sorts :',
  'overlay.buyNow': 'À Acheter Tout de Suite',
  'overlay.buy': 'ACHETER !',
  'overlay.toggleTitle': "Afficher/Masquer le HUD Overlay transparent sur l'écran de jeu (Alt+O)",
  'overlay.label': 'Overlay',

  // Barre du haut
  'hero.lockedTitle': 'Héros verrouillé pour cette partie : il ne change plus (même mort). Re-détecté à la partie suivante.',
  'hero.pick': 'Choisir Mon Héros',
  'ally.title': 'Allié sur ma lane',
  'ally.add': '+ Allié',
  'ally.pick': 'Allié en Lane',
  'build.n': (n: number) => `Build #${n}`,
  'enemies.button': (lane: number, team: number) => `VS Lane (${lane})${team > 0 ? ` +${team} Team` : ''}`,
  'enemies.title': (n: number) => `Ennemis (${n}/6)`,
  'enemies.clear': 'Tout vider',
  'enemies.myLane': (n: number, max: number) => `🎯 Ma Lane (${n}/${max})`,
  'enemies.otherLanes': (n: number, max: number) => `🌐 Autres Lanes (${n}/${max})`,
  'enemies.laneBadge': 'Lane',
  'enemies.teamBadge': 'Team',
  'autoscan.title': 'Activer/Désactiver la détection automatique silencieuse',
  'autoscan.label': 'Auto',
  'scan.title': 'Scanner maintenant (Alt+S)',
  'scan.label': 'Scan',
  'settings.open': 'Réglages',

  // Onglets
  'tabs.essential': 'Build Actif',
  'tabs.powers': 'Sorts (1-4)',
  'tabs.builds': 'Détails Objets',
  'tabs.matchups': (n: number) => `Conseils (${n})`,
  'tabs.logs': 'Diagnostic',

  // Objets possédés
  'owned.resetTitle': 'Réinitialiser les objets achetés',
  'owned.reset': (n: number) => `Reset (${n})`,
  'owned.title': (n: number) => `🎒 Objets possédés (${n}, ignorés des recommandations) :`,
  'owned.removeTitle': 'Cliquer pour remettre cet objet dans les recommandations',

  // À acheter
  'buy.title': (inventory: string) => `À Acheter Tout de Suite — Prochains Objets (${inventory})`,
  'buy.help':
    "Seuls vos prochains achats s'affichent ici (les objets déjà achetés passent automatiquement à la suite). Le #1 reste fixe jusqu'à son achat. Cliquez sur un objet si vous voulez le passer manuellement.",
  'buy.unmatched': (n: number) =>
    `⚠ ${n} objet(s) de ton inventaire non reconnu(s) : si un objet proposé est déjà acheté, clique dessus pour le passer.`,
  'buy.next1': '★ PROCHAIN ACHAT #1',
  'buy.nextN': (n: number) => `Suite #${n}`,
  'buy.affordable': '✅ ACHETABLE !',
  'buy.missing': (n: string) => `Manque ${n} Âmes`,
  'buy.skip': 'Passer →',
  'buy.whyTitle': 'Pourquoi cet objet ?',

  // Raisons des recommandations
  'reason.earlyPriority': 'Priorité Début de Lane',
  'reason.laneCounter': 'Contre Prioritaire Lane',
  'reason.earlyEnd': 'Fin de phase Début de Lane',
  'reason.midSpike': 'Pic de puissance Mid Game',
  'reason.teamfightCounter': 'Contre Teamfight',
  'reason.midCore': 'Core Mid Game',
  'reason.lateCore': 'Core Fin de Partie',
  'why.meta': (pick: string, rank: string, hero: string) =>
    `Acheté dans ${pick} des parties ${rank} ${/^[aeiou]/i.test(hero) ? 'd’' : 'de '}${hero}`,
  'why.winRate': (wr: string) => `${wr} de victoires quand il est acheté`,
  'why.buyTime': (time: string) => `acheté vers ${time} en moyenne`,
  'why.published': 'Dans le build publié au meilleur taux de victoire',
  'why.handBuild': 'Dans le build choisi',

  // Sorts, contres, phases
  'abilities.order': 'Ordre Sorts :',
  'counters.title': (names: string, team: number) => `Prochains Contres VS ${names}${team > 0 ? ` (+${team} Team)` : ''}`,
  'phases.early': '1. Début de Lane — Restant à acheter',
  'phases.mid': '2. Milieu de Partie (1 600) — Suite',
  'phases.late': '3. Fin de Partie (3 200-6 400) — Suite',
  'phases.done': '✅ Phase complétée — passez à la colonne suivante !',
  'powers.max': (n: number, key: string) => `Max #${n} • Touche [${key}]`,
  'details.early': 'Début de Lane (800 Âmes)',
  'details.mid': 'Milieu de Partie (1 600 Âmes)',
  'details.late': 'Fin de Partie (3 200 - 6 400 Âmes)',
  'details.situational': 'Objets Situationnels',
  'matchups.lane': '🎯 Lane :',
  'matchups.team': '🌐 Team :',
  'danger.Low': 'Faible',
  'danger.Medium': 'Moyen',
  'danger.High': 'Élevé',
  'danger.Extreme': 'Extrême',

  // Diagnostic
  'diag.title': "Diagnostic & Choix de l'Écran",
  'diag.scanNow': 'Scanner Maintenant',
  'diag.target': 'Écran cible :',
  'diag.auto': '🎯 Auto (fenêtre Deadlock, sinon écran principal)',
  'diag.screen': (name: string, w: number, h: number) => `🖥️ ${name} — ${w}x${h}`,
  'diag.captured': 'Écran capturé',
  'diag.hud': 'HUD analysé',
  'diag.noScan': 'Aucun scan effectué',
  'diag.waiting': 'En attente de capture...',
  'diag.source': 'Source analysée',
  'diag.gameWindow': (name: string) => `Jeu : ${name}`,
  'diag.frame': 'Image capturée',
  'diag.mode': 'Écran reconnu',
  'diag.mode.hud': 'HUD de partie',
  'diag.mode.shop': 'Boutique ouverte',
  'diag.mode.other': 'Pas de HUD de partie',
  'diag.allies': 'Portraits alliés',
  'diag.enemies': 'Portraits ennemis',
  'diag.inventory': 'Inventaire',
  'diag.details': 'Détails du dernier scan',
  'diag.logsButton': 'Journaux de parties',
  'diag.logsTitle': 'Un dossier par partie (les 5 dernières) : journal.log + images du HUD',
  'diag.reportButton': 'Signaler un problème',

  // Résolution / HUD
  'resolution.title': 'Format d’écran non pris en charge',
  'resolution.body': (w: number, h: number, ratio: string) =>
    `Deadlock est capturé en ${w}×${h} (${ratio}). La détection prend en charge tous les écrans paysage (1080p, 2K, 4K, 16:9, 16:10, 21:9, 32:9, 4:3) : elle est en pause sur ce format.`,
  'resolution.help':
    'Passe Deadlock en plein écran ou fenêtré sans bordure sur un écran paysage. En attendant, choisis ton héros et les ennemis à la main.',
  'resolution.report': 'Signaler mon format',
  'hud.notFoundTitle': 'Aucun HUD de partie reconnu',
  'hud.notFoundBody':
    "Deadlock est ouvert mais aucun HUD de partie n'a été reconnu depuis plusieurs minutes. Si tu es en partie : vérifie l'échelle du HUD (100 %), le plein écran ou fenêtré sans bordure, et qu'aucun filtre de couleur n'est actif.",

  // Mises à jour
  'update.available': (v: string) => `Version ${v} disponible`,
  'update.download': 'Télécharger',
  'update.downloading': (v: string) => `Téléchargement de la version ${v}…`,
  'update.ready': (v: string) => `Version ${v} prête`,
  'update.restart': 'Redémarrer pour installer',
  'update.dismiss': 'Plus tard',
  'update.check': 'Rechercher une mise à jour',
  'update.checking': 'Recherche…',
  'update.upToDate': 'Tu as la dernière version.',
  'update.failed': 'Impossible de vérifier les mises à jour (hors ligne ?).',
  'update.portable': 'Version portable : télécharge la nouvelle version sur GitHub.',

  // Réglages
  'settings.title': 'Réglages',
  'settings.close': 'Fermer',
  'settings.language': 'Langue',
  'settings.gameLogs': 'Journaux de parties',
  'settings.gameLogsDesc':
    "Enregistre, sur ton PC uniquement, ce que le scanner voit pendant une partie : un fichier texte et des captures du HUD (inventaire, barre du haut) toutes les 2 s, environ 30 Mo par partie, les 5 dernières parties gardées. Rien n'est envoyé : ces fichiers ne quittent ton PC que si tu les joins toi-même à un signalement.",
  'settings.gameLogsOn': 'Activés',
  'settings.gameLogsOff': 'Désactivés',
  'settings.openLogs': 'Ouvrir le dossier',
  'settings.deleteLogs': 'Supprimer les journaux',
  'settings.logsDeleted': 'Journaux supprimés.',
  'settings.updates': 'Mises à jour',
  'settings.version': (v: string) => `Version ${v}`,
  'settings.data': 'Builds et objets :',
  'settings.dataInfo': (date: string, online: boolean) =>
    `Données du ${date}${online ? ' (mises à jour en ligne)' : ' (incluses dans l’application)'} — deadlock-api.com`,
  'settings.about': 'À propos',
  'settings.aboutBody':
    "Projet de fan open source (licence MIT), non affilié à Valve Corporation ni approuvé par elle. Deadlock, ses noms, images et icônes de héros et d'objets appartiennent à Valve. Statistiques et données de jeu : deadlock-api.com.",
  'settings.github': 'Code source et aide',
  'settings.privacy':
    "L'application lit uniquement l'image de la fenêtre du jeu, comme un logiciel de streaming : pas de lecture de mémoire, pas d'injection, pas de touches simulées.",

  // Premier lancement
  'onboarding.title': 'Bienvenue dans Deadlock Blueprint',
  'onboarding.intro':
    "L'application lit l'image de la fenêtre Deadlock (comme OBS) pour reconnaître ton héros, les ennemis et ton inventaire, puis te dit quoi acheter. Elle ne lit pas la mémoire du jeu et n'envoie aucune donnée de partie.",
  'onboarding.language': 'Langue de l’interface',
  'onboarding.logsTitle': 'Aider à améliorer la détection ?',
  'onboarding.logsBody':
    "Si tu l'actives, l'application garde sur ton PC un journal de tes 5 dernières parties (texte + captures du HUD, ~30 Mo par partie). Il ne quitte ton PC que si tu cliques sur « Signaler un problème » et joins toi-même le fichier. Modifiable à tout moment dans les Réglages.",
  'onboarding.enableLogs': 'Activer les journaux',
  'onboarding.noLogs': 'Non merci',
  'onboarding.resolutionNote': 'Calibré sur le 16:9 (1080p, 1440p, 4K). Le 16:10, l’ultra-large et le fenêtré avec bordures sont expérimentaux.',

  // Signalement
  'report.title': 'Signaler un problème',
  'report.body':
    "Crée une archive .zip (infos système, état de l'application et, si tu le souhaites, le journal de ta dernière partie), puis ouvre une page GitHub pré-remplie : glisse le .zip dans la page avant d'envoyer.",
  'report.includeLog': 'Joindre le journal de la dernière partie (texte + captures du HUD)',
  'report.noLog': "Aucun journal de partie (désactivés dans les Réglages) : le signalement ne contiendra que les infos système.",
  'report.create': "Créer l'archive et ouvrir GitHub",
  'report.creating': 'Création…',
  'report.created': (file: string) => `Archive créée : ${file} (le dossier s'est ouvert). Glisse-la dans la page GitHub.`,
  'report.failed': (error: string) => `Échec : ${error}`,
  'report.cancel': 'Annuler',
} satisfies Record<string, string | ((...args: never[]) => string)>;

export type Messages = typeof MESSAGES_FR;
