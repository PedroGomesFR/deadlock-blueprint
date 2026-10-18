<div align="center">

<img src="public/icons/upscalemedia-transformed.png" alt="Logo Deadlock Blueprint" width="128" />

# Deadlock Blueprint

**Ton coach de build en temps réel pour Deadlock.**
Il lit ton écran, reconnaît ta partie et te dit quoi acheter, maintenant.

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

[**📥 Télécharger**](https://github.com/PedroGomesFR/deadlock-blueprint/releases/latest) · [Fonctionnalités](#-fonctionnalités) · [Utilisation](#-utilisation) · [FAQ](#-faq) · [Développement](#%EF%B8%8F-développement)

</div>

---

<table>
  <tr>
    <td width="74%"><img src="docs/app.png" alt="Fenêtre principale : prochains achats, objet à vendre quand l'inventaire est plein, contres" /></td>
    <td width="26%"><img src="docs/overlay.png" alt="Overlay en jeu" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Fenêtre principale : prochains achats, contres et objet à vendre quand l'inventaire est plein</sub></td>
    <td align="center"><sub>Overlay par-dessus le jeu</sub></td>
  </tr>
</table>

## ✨ Fonctionnalités

### 👁️ Détection automatique, sans rien toucher au jeu
Toutes les 350 ms, l'application lit l'image de la fenêtre Deadlock et reconnaît :

- **Ton héros** grâce à ton portrait surligné dans la barre du haut (les 38 héros). Il est **verrouillé pour toute la partie** : quand tu es mort et que tu regardes un coéquipier, rien ne bouge.
- **Tes alliés, les 6 ennemis, ta lane et ton partenaire de lane**, que tu joues côté Ambre ou Saphir.
- **Ton inventaire** (12 slots, y compris ceux encore verrouillés), même boutique ouverte.
- **Tes âmes**, lues par OCR.

### 🛒 Recommandations d'achat
- **Builds méta issus de vraies statistiques** : les objets les plus achetés en haut rang (Oracle+, 30 derniers jours) et le build publié avec le meilleur taux de victoire, via [deadlock-api.com](https://deadlock-api.com).
- **« À acheter tout de suite »** : les prochains objets dans l'ordre, avec l'onglet de la boutique et ce qu'il te manque en âmes. Le **#1 reste fixe** jusqu'à ce que tu l'achètes.
- **Contres automatiques** contre tes adversaires de lane et l'équipe ennemie (anti-soin, résistances...).
- **Jamais un objet que tu as déjà**, ni un composant déjà amélioré.
- **Inventaire plein ?** Chaque recommandation indique **quel objet vendre** (le moins utile pour ton build), ou **lequel sera remplacé** s'il s'agit d'une amélioration.

### 🎯 Overlay en jeu
Un panneau transparent, toujours au premier plan, affiche ton ordre de sorts et tes 3 prochains achats. En **mode fantôme**, les clics le traversent et il ne gêne jamais ta visée.

## 📥 Installation

1. Télécharge **`Deadlock-Blueprint-<version>.exe`** dans les [**Releases**](https://github.com/PedroGomesFR/deadlock-blueprint/releases/latest).
2. Lance-le. C'est un exécutable portable : aucune installation, aucun prérequis.

> [!NOTE]
> L'exécutable n'est pas signé. Au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## 🎮 Utilisation

1. Lance **Deadlock Blueprint**, puis Deadlock (l'ordre n'a pas d'importance).
2. Entre en partie : le héros, la lane, les ennemis et l'inventaire se remplissent tout seuls en 1 à 2 secondes.
3. Achète le **#1** affiché : il disparaît de la liste dès qu'il apparaît dans ton inventaire.

Pour de meilleurs résultats, joue en **1920×1080**. C'est la résolution sur laquelle le scanner est calibré ; les autres résolutions 16:9 sont mises à l'échelle.

### ⌨️ Raccourcis (utilisables en jeu)

| Raccourci | Action |
| :---: | :--- |
| <kbd>Alt</kbd> + <kbd>O</kbd> | Afficher / masquer l'**overlay** par-dessus le jeu |
| <kbd>Alt</kbd> + <kbd>L</kbd> | **Mode fantôme** : les clics traversent l'overlay |
| <kbd>Alt</kbd> + <kbd>S</kbd> | Forcer un scan immédiat |

### 🖱️ Corriger à la main
- **Clic sur ton héros** (en haut à gauche) : choisis-le dans la liste ; il est alors verrouillé pour la partie.
- **Clic sur un objet proposé** (« Passer ») : marque-le comme déjà acheté, utile si un objet de ton inventaire n'est pas reconnu.
- **Reset** : vide la liste des objets possédés.
- L'onglet **Diagnostic** montre ce que le scanner voit : portraits reconnus (★ = toi), inventaire, sorts.

## 🔒 Sécurité et vie privée

- L'application **lit uniquement l'image affichée**, comme un logiciel de streaming ou de partage d'écran.
- Elle **ne lit pas la mémoire du jeu**, n'injecte rien et ne modifie aucun fichier de Deadlock.
- Aucune donnée de partie n'est envoyée nulle part. Les seuls appels réseau téléchargent les fichiers de l'OCR (Tesseract.js, depuis un CDN) et les polices de l'interface.

## ❓ FAQ

<details>
<summary><b>Le héros détecté n'est pas le bon</b></summary>

Clique sur le héros en haut à gauche et choisis le bon : il est verrouillé pour la partie, puis re-détecté automatiquement à la partie suivante (quand la composition ennemie change).
</details>

<details>
<summary><b>Rien n'est détecté</b></summary>

- Vérifie que la fenêtre du jeu s'appelle bien « Deadlock » et qu'elle n'est pas réduite.
- La détection des héros a besoin de la barre du haut (scores des deux équipes). Les modes sans cette barre, comme l'entraînement, ne sont pas reconnus.
- L'onglet **Diagnostic** indique la source capturée et ce qui est reconnu.
</details>

<details>
<summary><b>Un objet que j'ai déjà est encore proposé</b></summary>

Son icône n'a pas été reconnue dans ton inventaire : l'application l'indique (« ⚠ objet non reconnu »). Clique sur l'objet proposé pour le passer.
</details>

<details>
<summary><b>Combien de RAM utilise l'application ?</b></summary>

Environ 650 Mo au total, stable dans le temps, dont environ 400 Mo pour le pipeline de capture vidéo (processus GPU). Les versions antérieures à la 1.2.0 capturaient toutes les fenêtres ouvertes à chaque scan et pouvaient monter à plusieurs Go : mets à jour si c'est ton cas.
</details>

## 🛠️ Développement

**Prérequis :** [Node.js](https://nodejs.org) 18 ou plus, Windows.

```bash
git clone https://github.com/PedroGomesFR/deadlock-blueprint.git
cd deadlock-blueprint
npm install
```

| Commande | Rôle |
| :--- | :--- |
| `npm run dev` | Interface avec rechargement à chaud (Vite) + Electron |
| `npm run build` puis `npm start` | Version compilée, lancée avec Electron |
| `npm run dist` | Génère l'exécutable portable dans `release/` |
| `npm run update-builds` | Met à jour les builds méta et le catalogue d'objets depuis deadlock-api.com (**à relancer après chaque patch de Deadlock**) |

**Stack :** Electron · React · TypeScript · Vite · Tailwind CSS · Tesseract.js

```
electron/            Processus principal : fenêtres, overlay, raccourcis, choix de la source capturée
src/App.tsx          Interface, boucle de scan, file des prochains achats
src/services/
  screenCapture.ts   Flux vidéo unique de la fenêtre Deadlock
  visionScanner.ts   Vision : portraits, sorts, inventaire, cadenas, âmes (OCR)
  counterEngine.ts   Contres selon les ennemis
src/data/            Héros, builds, objets (dont generated/ : données de deadlock-api.com)
scripts/             update-builds.mjs
```

Les coordonnées du HUD, les seuils calibrés et les choix techniques sont documentés dans [`AGENTS.md`](AGENTS.md).

## ⚠️ Avertissement

Projet de fan, **non affilié à Valve Corporation ni approuvé par elle**. Deadlock ainsi que ses noms, images et icônes de héros et d'objets sont la propriété de Valve.
