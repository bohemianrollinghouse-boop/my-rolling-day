# TODO — Portage natif iOS / Android

Audit du 6 août 2026, gros chantier codé le 8 août 2026.
Contexte : l'app était une PWA (Vite + React/htm + Firebase JS SDK) sur laquelle
Capacitor 6 a été ajouté.

Légende : 🔴 bloquant · 🟠 fonctionnalité · 🟡 confort / robustesse

---

## Reste à faire

### 🔴 1. Valider sur device (les deux plateformes)

Tout est codé mais rien n'est validé sur device. Dans l'ordre :

- [ ] iOS : `npm run build:ios:fast` → connexion Google, notifications locales
      (rappel d'agenda/tâche), demande de permission, status bar en thème sombre.
- [ ] Android : `npm run build:android:fast` → connexion Google (SHA-1 debug
      déclarée le 8 août), bouton retour, notifications.
- [ ] Push de bout en bout : **iPhone physique requis** (pas de push en
      simulateur). Vérifier la réception app fermée + tap → ouverture.
- [ ] Comportement du clavier sur les formulaires (connexion, ajout de tâche,
      modales de recette) — champs potentiellement masqués (`overflow:hidden` +
      bottom nav en absolute). Installer `@capacitor/keyboard` **seulement si**
      un problème est constaté.

### 🟠 2. Notifications programmées (amélioration de fond)

Les rappels agenda/tâches passent par des vérifications périodiques (30/60 s)
**quand l'app est au premier plan** — c'était déjà le cas en PWA, et c'est
inchangé. En natif on peut faire mieux : programmer les rappels à la création
de l'événement (`LocalNotifications.schedule({ at: date })`), pour qu'ils
sonnent même app fermée. Refactor plus lourd (annulation/reprogrammation à
chaque édition d'événement) — à faire dans un second temps.

### ~~🟡 3. Reset de mot de passe in-app (deep links)~~ — obsolète

Réglé autrement par le commit `3beeeb0` (mergé le 8 août) : le reset passe
désormais par une page statique autonome (`site/reset-password.html`) hors du
bundle React/Capacitor — l'écran in-app `ResetPasswordScreen.js` a été supprimé.
Plus besoin d'Universal Links / App Links pour ce flux. (Les deep links
resteraient utiles un jour pour les invitations, mais rien d'ouvert.)

### 🟡 4. Divers

- [ ] `aps-environment` vaut `development` dans `ios/App/App/App.entitlements` —
      passer à `production` pour les builds App Store (ou laisser Xcode le faire
      à l'archive, comportement par défaut).
- [ ] Bundle JS 1,46 Mo en un chunk — code-splitting à envisager.
- [ ] 2 tests smoke (cache-buster `?v=` disparu avec Vite) + 1 test Settings en
      échec — préexistants, sans lien avec le natif.
- [ ] `scripts/run-tests.ps1` : reliquat Windows à supprimer.

---

## Actions manuelles (Steve)

### Fait

- [x] **A. APNs** : clé créée et uploadée dans Firebase (7-8 août).

### Reste

- [ ] **B. Keystore d'upload Android** (release uniquement) :
      `keytool -genkeypair -v -keystore ~/keys/my-rolling-day-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`,
      remplir `android/keystore.properties`, puis ajouter la SHA-1 de cette clé
      (et plus tard celle de Play App Signing) dans Firebase et régénérer
      `google-services.json`.
- [ ] **C. Tests interactifs** : identifiants Google sur simulateur/émulateur,
      iPhone physique pour le push, un œil sur le clavier.
- [ ] **D. Optionnel release** : clé API App Store Connect + `.env.ios`
      (`archive:ios`) ; compte de service Google Play + `.env.android`
      (`upload:android`).

---

## ✅ Fait

### 8 août 2026 — chantier natif complet

- **SHA-1 debug déclarée dans Firebase** (via CLI) + `google-services.json`
  régénéré : il contient désormais un `oauth_client` de type 1
  (`certificate_hash: 079c5c…d0bb`). Google Sign-In Android débloqué en dev.
- **Notifications multi-plateforme** : nouvel adaptateur `src/utils/notify.js`
  (web `Notification` / natif `@capacitor/local-notifications`, cache de
  permission synchrone, listener de tap centralisé). Branché dans
  `AgendaView.js`, `useTaskNotifications.js`, `storage.js`
  (`shouldShowNotifPrompt`), `SettingsUI.js` (ré-export). Init au boot dans
  `App.js` (`initNotifications`).
- **Dédup partagée local ↔ push** : les deux canaux de rappels (checks locaux
  30-60 s app ouverte, `sendScheduledNotifications` toutes les 5 min côté
  serveur) s'ignoraient → doublon possible app ouverte. La fonction saute
  désormais tout rappel dont la clé cliente figure déjà dans le planner state
  (`notification.sentKeys` agenda, `task.notificationLog` tâches) — 5 gardes :
  agenda ponctuel, récurrent, fin de journée, urgent, échéances. App ouverte =
  local seul (précis) ; app fermée = push seul. **À déployer** :
  `npm run deploy:functions`.
- **Push natif FCM** : `messaging.js` branche sur `@capacitor/push-notifications`
  en natif — `syncPushToken` (permission + `register()` + attente du token avec
  timeout 15 s), `bindForegroundPushMessages` (réception premier plan + tap,
  payload normalisé au format FCM web), `clearPushToken` (`unregister()`).
  Les tokens natifs se stockent dans les mêmes documents Firestore et la Cloud
  Function `sendEachForMulticast` fonctionne telle quelle (le bloc `webpush`
  est ignoré par APNs/Android). `POST_NOTIFICATIONS` ajouté au manifest,
  `App.entitlements` créé (`aps-environment: development` — le
  `CODE_SIGN_ENTITLEMENTS` était déjà câblé par le template).
- **Bouton retour Android** : listener dans `App.js` — sous-page Réglages →
  Réglages → onglet home → sortie. (Les modales gardent leur fermeture par
  backdrop.)
- **Export JSON du foyer** : chemin natif `Filesystem` (cache) + `Share` ;
  l'annulation de la feuille de partage n'est pas traitée comme une erreur.
- **Coller le code d'invitation** : `readClipboardText()` dans
  `OnboardingFlow.js` — `@capacitor/clipboard` en natif, fallback web.
- **Status bar synchronisée au thème** : `src/utils/statusBar.js`
  (`setStyle` + `setBackgroundColor` Android), appelé au boot (`App.js`) et à
  chaque bascule (`SettingsView.js`).
- **Persistance auth durcie** : `indexedDBLocalPersistence` avec fallback
  `browserLocalPersistence` (localStorage purgeable par iOS).
- **`getRedirectResult` sauté en natif** (`useAuth.js`) — le flux redirect
  n'existe pas avec le dialog Google natif.
- **Firestore** : `experimentalForceLongPolling` → `experimentalAutoDetectLongPolling`.
- **Polices embarquées** : Cormorant Garamond 700 + DM Sans variable (latin,
  woff2 auto-hébergés), plus aucune requête `fonts.googleapis.com`.
- **Plugins installés** : app, local-notifications, push-notifications,
  filesystem, share, clipboard, status-bar (v6, 8 plugins au total avec
  google-auth).
- Validé : build web ✓, `xcodebuild` simulateur ✓, `compileDebugJavaWithJavac` ✓,
  tests 103/129 (3 échecs préexistants).

### 6 août 2026 — correctifs de l'audit initial

- Crash Google Sign-In (`initialize()` jamais appelé, `load()` natif vide) →
  `ensureGoogleAuthInitialized()` + `iosClientId`/`androidClientId` dans
  `capacitor.config.json`.
- Crash « Prendre une photo » (recettes) → `NSCameraUsageDescription` +
  `NSPhotoLibraryUsageDescription`.
- Logo absent (5 chemins `./src/assets/…` non réécrits par Vite) → imports.
- Icônes PWA en 404 (`manifest.json` non réécrit par Vite) → `public/`.
- Splash + icônes d'app par défaut Capacitor (iOS **et** Android) → régénérés
  depuis la marque (terracotta `#B85F4A` / crème `#FAF4ED`, variante sombre iOS).
- `backgroundColor` Capacitor (anti flash noir).
- Build Android sur macOS (JDK Windows en dur, `gradlew` non exécutable,
  `ANDROID_HOME` mort → `local.properties`).

### Vérifié comme déjà correct

Safe areas · `viewport-fit=cover` · `resolveFirebaseAuthDomain()` (fallback
`localhost` → domaine Firebase) · service worker sous détection de
fonctionnalité · pas de `window.open`/`_blank` · `alert/confirm/prompt` natifs
via Capacitor iOS · versions cohérentes (Capacitor 6.2.1, GoogleSignIn 6.2.4) ·
`AppDelegate` forwarde `open url` (callback OAuth) · `MainActivity` standard ·
Firestore `persistentLocalCache()` (hors ligne OK) · photo de recette
compressée (plafond 80 Ko) · rattrapage `visibilitychange` · `100vh` sans
risque en natif · `.mrd-statusbar` = CSS mort.
