# Deadlock Blueprint (Auto-Build & Overlay) — Guide pour Agents IA (`AGENTS.md`)

Ce document résume l'architecture, les coordonnées HUD 2026 de Deadlock, le fonctionnement du scanner de vision temps réel et les conventions du projet afin que toute IA intervenant sur ce dépôt puisse travailler immédiatement sans régression.

---

## 1. Vue d'ensemble du Projet

Application **Electron + React + TypeScript + Vite + TailwindCSS** servant d'assistant tactique temps réel et d'overlay en jeu pour **Deadlock (édition 2026 — 38 héros)** :
- **Détection automatique ultra-rapide (`350 ms`)** sans lecture mémoire (100 % capture d'écran via `desktopCapturer`).
- **Reconnaissance automatique** :
  1. **Mon Héros** : d'abord le **portrait surligné** (fond couleur d'équipe) dans la barre des alliés en haut, reconnu par comparaison de portraits (fonctionne pour les 38 héros) ; en secours, l'empreinte binaire (`IoU`) des icônes de sorts (seulement les 18 héros qui ont des icônes de sorts locales, et trompée par les chiffres de recharge), avec verrouillage anti-faux-positif pendant l'écran de mort.
  2. **Mes 5 Alliés & les 6 Ennemis** : détectés via les portraits de la barre supérieure (`y = 10..56`) par comparaison RGB + chrominance normalisée multi-portraits (`_mm`, `_card`, `.png`).
  3. **Mes 12 Slots d'Inventaire (en bas à gauche)** : scannés toutes les **350 ms** (`< 3 ms` CPU par frame), même lorsque la Boutique (`B`) est ouverte.
  4. **Mon Compteur d'Âmes (Souls)** : lu en arrière-plan (non-bloquant) par **Tesseract.js OCR** avec filtre de couleur Mint-Cyan.
- **Recommandations dynamiques (« À Acheter Tout de Suite — Prochains Objets »)** :
  - Ne propose **jamais** les objets déjà possédés (`ownedItems`), ni les composants consommés par un objet amélioré possédé (`upgradesFrom`).
  - `ownedItems` **reflète l'inventaire à l'écran** (il ne doit jamais s'accumuler : 84 objets « possédés » vidaient la liste) :
    - ajout après 3 scans ; retrait après 6 scans d'absence (`ItemAbsence`), uniquement sur un inventaire lisible (fenêtre Deadlock ou barre du haut visible **et** ≥ 1 slot occupé), et pas tant que les slots non reconnus suffisent à expliquer les absents (objet actif en recharge) ;
    - vidé à chaque nouvelle partie : changement de héros, ou composition ennemie stable avec moins de la moitié des héros en commun ;
    - les objets marqués à la main (« Passer » / clic) sont dans `dl_manualOwned` (`localStorage`, partagé avec l'overlay) et ne sont jamais retirés par le scan.
  - **Héros verrouillé pour la partie** (`dl_heroLocked`, 🔒 à côté du nom) : verrouillé dès que le **portrait surligné** est stable (les sorts seuls peuvent changer un héros non verrouillé, jamais le verrouiller). Ensuite il ne change plus, même mort. Déverrouillé à la nouvelle partie (composition ennemie différente), re-verrouillé par un choix manuel.
  - **Mort / spectateur** : si l'écran montre un autre héros que le mien verrouillé (portrait surligné ; ou sorts, si mon héros fait partie de `ABILITY_TEMPLATE_HERO_IDS`), inventaire, âmes, partenaire et lane ne sont pas mis à jour. Un inventaire « étranger » (≥ 2 de mes objets absents **et** ≥ 2 objets inconnus, hors améliorations et slots non reconnus) est aussi ignoré, au plus ~90 s (`FOREIGN_INVENTORY_MAX_SCANS`).
  - **Inventaire plein** (`occupés + verrouillés >= 12`, état `dl_inventoryStatus` partagé avec l'overlay) : chaque recommandation affiche « ⇄ Vendre X ». X est choisi parmi les objets de l'inventaire, le moins utile d'abord : hors build et hors contres, puis palier le plus bas, puis phase la plus précoce. Le #1 reçoit le plus faible, le #2 le suivant, etc. Une amélioration affiche « ⬆ Remplace <composant> » (pas besoin de slot libre). Plein, un objet n'est plus proposé s'il est d'un palier inférieur à l'objet le plus faible.
  - Dès que les slots de début de partie sont remplis (`>= 4` objets équipés ou `>= 3` objets Tier 1), la file d'attente bascule automatiquement sur la **suite du build** (**Milieu de Partie Tier 2 — 1 600 Âmes** puis **Fin de Partie Tier 3-4 — 3 200–6 400 Âmes**) et intègre les **Contres Prioritaires** contre les ennemis détectés. Les seuils se basent sur `item.tier`, jamais sur le prix.
  - **Le #1 est verrouillé** (`dl_lockedNext` dans `localStorage`) jusqu'à son achat / « Passer », ou un changement de héros/build. La fenêtre principale écrit le verrou, l'overlay le lit.

### Builds méta (statistiques réelles) — `npm run update-builds`

- [`scripts/update-builds.mjs`](scripts/update-builds.mjs) interroge `api.deadlock-api.com` (30 derniers jours, rang Oracle+ puis repli Archon+/Ritualist+/tous) et génère :
  - `src/data/generated/itemsCatalog.json` : les 156 objets de la boutique (noms FR/EN officiels, prix 800/1600/3200/6400, palier, composants, icône). **Fait autorité** sur `LEGACY_ITEMS_DB` (textes écrits à la main conservés si l'objet n'a pas été renommé).
  - `src/data/generated/metaBuilds.json` : par héros, **Build #1 « Méta »** (objets les plus achetés en haut rang, triés par moment d'achat moyen) et **Build #2 « Meilleur build publié »** (meilleur taux de victoire bayésien parmi les builds publiés avec ≥ 100 parties), plus l'ordre de maximisation des sorts le plus joué.
  - `public/icons/items/api/<id>.png` : icônes officielles (les PNG historiques de `public/icons/items/` ne sont jamais écrasés et restent chargés comme 2e modèle du scanner).
- **À relancer après chaque patch Deadlock.** Les ids locaux historiques sont reliés aux `class_name` Valve via `LOCAL_ID_BY_CLASS` dans le script.
- `withMetaBuilds()` dans `deadlockData.ts` place ces builds en tête de `hero.builds` (les builds écrits à la main restent ensuite ; pour les héros génériques, ils remplacent le build inventé et apportent les vrais noms de sorts).
- Héros présents dans l'API mais absents de `HEROES_DB` (portraits manquants) : listés par le script, non affichés.

---

## 2. Structure des Fichiers Clés

| Fichier | Rôle |
| :--- | :--- |
| [`electron/main.cjs`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/electron/main.cjs) | Processus principal Electron, gestion de la fenêtre principale et de la fenêtre Overlay transparente Always-On-Top, raccourcis globaux (`Alt+O`, `Alt+L`, `Alt+S`), IPC `find-capture-source` (choix de la source à capturer, sans miniature) et `capture-screen` (repli par miniature, voir § 4). |
| [`src/services/screenCapture.ts`](src/services/screenCapture.ts) | Flux vidéo unique de la fenêtre Deadlock (`getUserMedia` + `ImageCapture`) lu à chaque scan ; repli sur `capture-screen`. |
| [`electron/preload.cjs`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/electron/preload.cjs) | Pont `contextBridge` (`window.electronAPI`) pour la capture d'écran, la synchronisation d'état vers l'overlay et le contrôle du mode click-through. |
| [`src/App.tsx`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/App.tsx) | Interface principale + vue Overlay (`?overlay=1`), boucle de scan temps réel (`350 ms`), calcul de `nextToBuyQueue` (prochains achats filtrés sans aucun doublon possédé), et synchronisation `localStorage`. |
| [`src/services/visionScanner.ts`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/services/visionScanner.ts) | Moteur de vision par ordinateur sur Canvas HTML5 (`1920x1080`) : scan des 12 slots d'inventaire, détection du héros par les 4 compétences, détection des équipes 6v6 et OCR Tesseract non-bloquant des Âmes. |
| [`src/data/deadlockData.ts`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/data/deadlockData.ts) | Base de données complète des **38 héros**, de leurs builds multi-styles (FR/EN), de l'ordre des compétences et du catalogue d'objets (`ITEMS_DB`). |
| [`src/services/counterEngine.ts`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/services/counterEngine.ts) | Moteur de calcul des contres tactiques en fonction des ennemis de lane (`laneEnemyIds`) et de l'équipe adverse (`teamEnemyIds`). |
| [`src/components/DeadlockIcons.tsx`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/components/DeadlockIcons.tsx) | Composants d'icônes officielles hors-ligne (`HeroAvatar`, `ItemArtworkIcon`, `PowerIcon`). |
| `public/icons/` | Assets locaux hors-ligne : `heroes/` (portraits `.png`, `_mm.png`, `_card.png`), `items/` (icônes d'objets + variantes `_ingame.png`), `abilities/` (sorts des héros). |

---

## 3. Coordonnées Exactes du HUD Deadlock 2026 (Base `1920×1080`)

Toutes les coordonnées dans [`src/services/visionScanner.ts`](file:///c:/Users/pedro/OneDrive/Documents/vandicta%20auto%20build/src/services/visionScanner.ts) sont exprimées sur une grille de référence `1920×1080` et mises à l'échelle dynamiquement (`scaleX`, `scaleY`) :

1. **Grille d'Inventaire 12 Slots (Bas-Gauche)** :
   - **2 lignes × 6 colonnes** :
     - `x = 26 + col * 62` (`col = 0..5`)
     - `y = 944 + row * 62` (`row = 0..1` → Ligne 0 à `y = 944`, Ligne 1 à `y = 1006`)
     - Taille d'un slot : `52 × 52 px`
   - **Détection d'occupation d'un slot** :
     - Un slot vide est gris-olive uniforme (`meanLum ≈ 40–66`, `variance < 350`).
     - Un slot occupé est détecté si :
       - Le **triangle de catégorie en haut à droite** du slot (`dx = 34..49, dy = 2..16`) est coloré : **Orange** (`weapon`), **Vert** (`vitality`) ou **Violet** (`spirit`), **OU**
       - `meanLum > 45 && variance > 600` (permet de détecter aussi les icônes à fond sombre comme *Healbane / Châtiment curatif* où `meanLum ≈ 78.9`), **OU**
       - Plus de 18 % des pixels du centre sont saturés.
   - **Slots verrouillés (cadenas)** : seuls 9 slots sur 12 étaient disponibles à 3:51 sur une vraie capture. Un slot non occupé est testé contre `LOCK_MASK` : masque de contraste local (pixel > moyenne voisine + 12) sur `x, y = 8..43` du slot. IoU mesurée entre cadenas 0.80–0.96, contre un slot vide ≤ 0.08 → seuil `0.5`. Nécessaire pour savoir quand l'inventaire est plein.
   - **Important** : L'inventaire en bas à gauche (`x = 26..388, y = 944..1058`) reste **100 % visible même quand la Boutique (`B`) est ouverte**. Le scan d'inventaire s'exécute donc **à chaque frame (`350 ms`)** sans jamais être bloqué par l'ouverture de la boutique.
   - **Reconnaissance de l'objet** (calibrée sur une vraie capture 1920×1080) : l'icône se trouve dans une boîte **décalée de 2 px vers le bas et de 54 px** (`x = 26 + col * 62`, `y = 946 + row * 62`), différente de la boîte 52 px qui sert à l'occupation et au triangle de catégorie. Les modèles et les slots passent tous par `areaDownsample()` (moyenne par zone vers 20×20). Ne jamais réduire avec `drawImage` : les backends GPU et CPU du canvas filtrent différemment et l'erreur des bons objets montait jusqu'au seuil. Erreur mesurée : bons objets 4-9, meilleur mauvais candidat ≥ 29 → seuil `ITEM_MATCH_MAX_MAE = 20`. Chaque slot écrit son meilleur candidat et le 2e dans les logs de Diagnostic.
   - Un seul modèle par objet : l'icône officielle actuelle (`item.icon`). L'ancien `rapid_rounds_ingame.png` était en réalité une icône de **Tir véloce (Swift Striker)** étiquetée « Rapid Rounds » ; il n'est plus chargé.
   - **Slot occupé non reconnu = inconnu** (`unmatchedSlotsCount`). Ne **jamais** le deviner à partir de la file d'achat : l'ancien fallback marquait le #1 recommandé comme possédé à chaque scan et vidait la liste en cascade. Le départage `-4.5 MAE` utilise la liste **statique** des objets du build actif (`buildItemIds`), jamais `nextToBuyQueue`.


2. **Compteur d'Âmes (Souls — Bas-Gauche)** :
   - `x = 110..208`, `y = 892..924` (`98 × 32 px`).
   - Texte couleur Mint-Cyan (`G > 175`, `B > 135`, `G - R > 20`).
   - L'OCR Tesseract tourne en tâche de fond non-bloquante uniquement lorsque l'empreinte des pixels change.

3. **Barre des Compétences du Joueur (Bas-Centre)** — détection de secours du héros :
   - 3 boîtes `54 × 54 px` : `x = 798 + i * 90` (`i = 0..2`), `y = 979` (vérifié sur une vraie capture : elles tombent sur les sorts 1 à 3).
   - **Règle anti-faux-positif (Écran de mort / Cooldowns)** : il faut au moins **2 compétences reconnues simultanément** (`sc.slots.size >= 2` ou `maxIoU >= 0.78`), classées par `sumIoU`, et `maxIoU >= 0.62`.
   - ⚠️ Peu fiable : sur une vraie capture Infernus avec « 8 » de recharge sur les sorts 1-2, *Paradox* (Σ 1.84) battait *Infernus* (Σ 1.24). Le portrait surligné passe donc en premier. Le classement des 3 meilleurs héros est écrit dans les logs de Diagnostic (`Sorts : …`).

4. **Barre du haut & Portraits des Équipes 6v6** :
   - **Barre visible** (`isDeadlockTopBarVisible`, condition de toute la détection des héros) : cases de score à `x = 855..905` et `x = 1015..1065`, `y = 44..68`. **Ton équipe est toujours à gauche, dans sa couleur** : bleu | ambre en Saphir, **ambre | bleu en Ambre**. Les deux dispositions sont acceptées (l'ancien test n'acceptait que bleu | ambre et coupait toute détection dans la moitié des parties).
   - Portraits : boîtes `70 × 95 px` à `y = 0`, alliés `x = 339 + i * 88`, ennemis `x = 1071 + i * 88` (`i = 0..5`).
   - **Mon slot** : les 2 coins supérieurs (`12 × 30 px` à `dx = 0` et `dx = 58`) sont remplis de couleur d'équipe (ambre ou bleu) à ≥ 50 %. Mesuré : mon slot 0.87–0.97, coéquipiers ≤ 0.11. Sert au héros, au partenaire de lane et aux ennemis de lane (`Portraits alliés : … 3:infernus★ …` dans les logs).

5. **Anti-scintillement ([`src/services/detectionStabilizer.ts`](src/services/detectionStabilizer.ts))** :
   - Héros : appliqué après **3 scans** identiques consécutifs (~1 s).
   - Ennemis (lane + équipe, listes triées) et allié/couleur de lane : après **4 scans** identiques.
   - Objets d'inventaire : ajoutés à `ownedItems` après **3 scans** consécutifs, retirés après **6 scans** d'absence sur un inventaire lisible (voir § 1).

---

## 4. Détails Critiques de Capture (`electron/main.cjs`)

- **Suppression des erreurs WGC (`wgc_capturer_win.cc`)** :
  - `app.commandLine.appendSwitch('disable-features', 'WinrtGeolocationImplementation,WebRtcAllowWgcDesktopCapturer,WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer,ScreenCaptureKit')`
  - `app.commandLine.appendSwitch('log-level', '3')`
  - ⚠️ Testé (Electron 33) : ni ces switches, ni `--log-level=3` / `--disable-features` passés au démarrage ne suppriment le message. Il vient d'une fenêtre **tierce** non capturable (miniature vide), pas de Deadlock (capturé normalement). C'est sans conséquence : [`Lancer_Deadlock_AutoBuild.bat`](Lancer_Deadlock_AutoBuild.bat) lance donc `node_modules\electron\dist\electron.exe` directement (application fenêtrée, sans console) au lieu de `npx electron .`.
- **Priorité à la fenêtre `Deadlock`** :
  - `desktopCapturer.getSources({ types: ['window', 'screen'] })` cherche d'abord la fenêtre exacte `/^deadlock$/i.test(s.name.trim())`.
  - Pourquoi ? Capturer directement la fenêtre du jeu évite que la barre des tâches Windows 11 ou une fenêtre superposée ne masque la Ligne 1 de l'inventaire (`y = 1006..1058`), tout en éliminant les barres noires sur les écrans 16:10 (`1920×1200`).
- **Capture par flux vidéo unique** ([`src/services/screenCapture.ts`](src/services/screenCapture.ts)) — ne **jamais** revenir aux miniatures à chaque scan :
  - L'ancienne capture appelait `desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: 1920x1080 })` toutes les 350 ms : une miniature 1920×1080 de **chaque** fenêtre et écran (~45 Mo par appel avec 9 fenêtres, ~270 ms). Cette mémoire native n'est libérée qu'au GC du processus principal, que V8 ne déclenche pas : 600 Mo mesurés chez nous, **12 Go** signalés sur un PC avec plus de fenêtres.
  - Maintenant : IPC `find-capture-source` (même ordre de priorité : choix utilisateur → fenêtre `Deadlock` → écran de jeu) avec `thumbnailSize: 0` (aucune capture), relancé en arrière-plan toutes les 3 s. Le renderer ouvre **un seul** `getUserMedia` (`chromeMediaSource: 'desktop'`, max 1920×1080, 5 fps) et lit l'image courante avec `ImageCapture.grabFrame()` (~5 ms). L'`ImageBitmap` est fermée dès l'analyse (`releaseGameFrame`). Timeout de 1,5 s si aucune image (fenêtre réduite).
  - Mesuré (2 min de capture continue) : processus principal ~130 Mo stable au lieu de 560–666 Mo, GPU ~400 Mo stable (coût fixe du pipeline de capture Chromium). Couleurs flux vs miniature JPEG : écart moyen 2,7/255 par bloc de 24 px, donc les seuils du scanner restent valables.
  - Repli si `getUserMedia` échoue : l'ancienne IPC `capture-screen` (miniatures + `toJPEG(92)`), avec un `gc()` explicite au plus toutes les 2 s dans `main.cjs`.
  - Le flux donne la taille native de la fenêtre (une miniature était agrandie à 1920×1080). Le scanner met déjà toutes ses coordonnées à l'échelle (`w / 1920`, `h / 1080`).

---

## 5. Commandes de Build & Relance Silencieuse (Windows)

Pour compiler et relancer l'application Electron sur la session interactive de l'utilisateur **sans ouvrir de fenêtre `cmd.exe` noire** qui gênerait sa partie :

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
npm run build
$vbs = "C:\Users\pedro\.gemini\antigravity\brain\a09d8cd0-2360-45ad-a852-2b064cdb816d\scratch\launch.vbs"
schtasks /Create /TN "LaunchDeadlockAutoBuild" /TR "wscript.exe `"$vbs`"" /SC ONCE /ST 00:00 /F | Out-Null
schtasks /Run /TN "LaunchDeadlockAutoBuild" | Out-Null
Start-Sleep -Seconds 2
schtasks /Delete /TN "LaunchDeadlockAutoBuild" /F | Out-Null
```
*(Si `launch.vbs` n'existe plus, créez un script VBS contenant `CreateObject("WScript.Shell").Run "cmd /c cd /d ""c:\Users\pedro\OneDrive\Documents\vandicta auto build"" && npx electron .", 0, False`).*

### Exécutable Windows (`.exe` portable)

- `npm run dist` → `vite build` puis `electron-builder` (config dans le champ `build` de `package.json`) → **`release/Deadlock-Blueprint-<version>.exe`** (un seul fichier, sans installation).
- Nom affiché : **Deadlock Blueprint** (`build.productName`, `<title>` de `index.html`, titre de la `BrowserWindow`). Logo : `public/icons/upscalemedia-transformed.png` → icône de la fenêtre (`APP_ICON` dans `main.cjs`) ; l'icône de l'exe est `build/icon.png` (le même logo recadré en 256×256).
- L'`app.asar` ne contient que `dist/`, `electron/` et `package.json` : toutes les dépendances front (`react`, `lucide-react`, `tesseract.js`) sont bundlées par Vite et restent donc en `devDependencies`.
- Le `name` npm reste `deadlock-tactical-autobuild` (ne pas le changer) et le `package.json` embarqué n'a pas de `productName` → même dossier `%APPDATA%\deadlock-tactical-autobuild` (et même `localStorage`) que `npm start`.
- Si `electron-builder` échoue avec `Cannot create symbolic link` (archive `winCodeSign`, liens macOS non créables sans mode développeur) : extraire `winCodeSign-2.6.0.7z` avec `node_modules\7zip-bin\win\x64\7za.exe x` dans `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (ignorer les 2 erreurs `darwin/…/*.dylib`), puis relancer.
- Tesseract.js charge toujours son worker et `eng.traineddata` depuis le CDN au premier OCR : l'exe a besoin d'Internet pour lire les Âmes (comme `npm start`).
