# Deadlock Blueprint

Application Desktop & Overlay In-Game pour **Deadlock** (avec édition spéciale **Vindicta** et tous les héros du jeu), dotée d'une capture d'écran intelligente par **OCR / Vision locale (Tesseract.js)** et d'un moteur tactique qui adapte votre build selon votre **Lane (Jaune, Orange, Bleue, Violette)** et les **Ennemis en face de vous**.

## 🚀 Lancement rapide

- **Exécutable autonome** : `release/Deadlock-Blueprint-<version>.exe` (à régénérer avec `npm run dist`)
- **Double-cliquez** sur [`Lancer_Deadlock_AutoBuild.bat`](./Lancer_Deadlock_AutoBuild.bat)
- Ou via un terminal dans ce dossier :
  ```bash
  npm start
  ```
- Pour le mode développement avec rechargement à chaud :
  ```bash
  npm run dev
  ```

## ⌨️ Raccourcis Clavier en Jeu (Global Hotkeys)

| Raccourci | Action |
| :--- | :--- |
| **`Alt + S`** | **Scanner l'écran Deadlock** (Détecte votre héros, la couleur de Zipline/Lane et les ennemis affichés). *Astuce : Maintenez `TAB` en jeu pendant `Alt + S` pour une lecture OCR instantanée des noms sous les portraits !* |
| **`Alt + O`** | **Basculer entre Fenêtre Bureau et Mode Overlay HUD** (Panneau transparent toujours au premier plan par-dessus Deadlock). |
| **`Alt + L`** | **Verrouiller / Déverrouiller la souris (Click-Through)** en mode Overlay pour cliquer à travers l'interface sans gêner votre visée. |
