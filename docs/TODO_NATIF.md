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

### 23 août 2026 — audit natif iOS + zones sûres

Audit demandé sur `ios/` (AppDelegate, Info.plist, Podfile, entitlements) au
regard des 12 plugins installés.

#### 🔴 Push iOS impossible — relais APNs absent de l'AppDelegate

`ios/App/App/AppDelegate.swift` était resté le **gabarit Capacitor d'origine**.
Or `@capacitor/push-notifications` n'écoute pas iOS directement : son
`load()` observe `capacitorDidRegisterForRemoteNotifications` sur le
NotificationCenter, et c'est à l'AppDelegate de poster cette notification depuis
`didRegisterForRemoteNotificationsWithDeviceToken`. Sans ce relais, la chaîne
casse en silence : `register()` part bien, iOS répond bien, mais personne ne
transmet — l'événement `registration` n'est jamais émis (`messaging.js:73`),
aucun token FCM n'est stocké, et les appels concernés échouent sur
« event capacitorDidRegisterForRemoteNotifications not called ».

Vérifié dans le code du plugin (`PushNotificationsPlugin.swift:40` pour
l'observateur, `:126` pour le rejet) et dans son README, pas déduit. Android
n'était pas concerné : son token vient du SDK Firebase, pas d'APNs.

Les deux méthodes ont été ajoutées. **À valider sur iPhone physique** : c'est le
seul moyen de confirmer qu'un token arrive (pas de push sur simulateur).

#### Le reste de l'audit iOS : conforme

| Point | État |
|---|---|
| `App.entitlements` | `aps-environment: development` — correct pour le dev. À passer en `production` pour la soumission (ou laisser Xcode le gérer via la capability). |
| `CFBundleURLTypes` | Schéma inversé du client iOS présent et **cohérent** avec `iosClientId` de `capacitor.config.ts`. |
| Descriptions d'usage | Caméra, micro, reconnaissance vocale, photothèque : les quatre présentes et rédigées en français. Le micro et la reconnaissance vocale sont bien ceux qu'exige `@capacitor-community/speech-recognition`. |
| `UIBackgroundModes` | **Non requis** : les Cloud Functions envoient une charge `notification` (alerte), affichée par APNs sans réveiller l'app. `remote-notification` ne servirait qu'à des pushs silencieux. |
| `Podfile` / `Podfile.lock` | Les 12 plugins déclarés, versions alignées sur `package.json`. `platform :ios, '13.0'` cohérent avec `IPHONEOS_DEPLOYMENT_TARGET`. |
| `CFBundleLocalizations` | `fr` déclaré — les menus système restent en français. |
| `ios/App/App/capacitor.config.json` | Copie générée par `cap sync`, à jour. Régénérée depuis `capacitor.config.ts` désormais. |

Deux points cosmétiques laissés en l'état, volontairement : `UIRequiredDeviceCapabilities`
vaut `armv7` (valeur du gabarit Capacitor, obsolète depuis iOS 11 mais sans
effet néfaste — la modifier juste avant une release toucherait au filtrage
d'appareils de l'App Store pour rien), et les orientations paysage sont
déclarées alors qu'aucun écran n'est dessiné pour le paysage. Ce second point
est une décision produit : à trancher, pas à supposer.

#### 🔴 Trois défauts de zones sûres, invisibles en test

Signalés à l'usage sur device. Tous les trois échappaient à la garde visuelle
pour la même raison : **Chrome headless n'a aucun inset**, donc
`env(safe-area-inset-*)` valait 0 et les 57 captures étaient toutes justes.

`Emulation.setSafeAreaInsetsOverride` (CDP) permet de forcer de vrais insets.
D'où `tests/screenshots/safe-area.mjs`, qui simule un iPhone 15 (393×852,
insets 59/34) et **mesure la géométrie** au lieu de comparer des pixels.

| Défaut | Cause | Mesure avant → après |
|---|---|---|
| Barre d'onglets écrasée en bas, boutons sur l'indicateur d'accueil | Ionic pose la safe area via `padding-bottom` sur le `:host` de `ion-tab-bar`, mais le reset `* { padding: 0 }` de `styles.css` matche l'élément hôte — et **un style d'auteur sur l'hôte bat `:host`**, quelle que soit la spécificité. L'ancienne barre maison posait ce padding à la main pour cette raison ; la migration a retiré le garde-fou en croyant qu'Ionic le remplaçait. | hauteur 51 → **87** px, `padding-bottom` 0 → **34** px, hauteur utile 51 → **53** px |
| Accueil et Repas collés à l'heure du téléphone | `renderPageHeader` renvoie `null` pour accueil / listes / repas premium / recettes. Les pages **à** en-tête reçoivent l'inset via le `padding-top` qu'Ionic met sur `ion-header` ; celles sans en-tête n'avaient rien. | premier élément à 0 → **59** px |
| — | `.mrd-shell` porte bien `padding-top: env(safe-area-inset-top)`, mais il ne protège pas ces écrans : les `.ion-page` de l'outlet sont en `position: absolute` et ne se calent pas sur sa boîte de padding. Il protège en revanche les écrans hors outlet (réglages, connexion, onboarding), qui sont dans le flux normal. | — |


### 8 août 2026 — chantier natif complet

- **SHA-1 debug déclarée dans Firebase** (via CLI) + `google-services.json`
  régénéré : il contient désormais un `oauth_client` de type 1
  (`certificate_hash: 079c5c…d0bb`). Google Sign-In Android débloqué en dev.
- **Notifications multi-plateforme** : nouvel adaptateur `src/app/plugins/notifications.js`
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
- **Status bar synchronisée au thème** : `src/app/plugins/statusBar.js`
  (`setStyle` + `setBackgroundColor` Android), appelé au boot (`App.js`) et à
  chaque bascule (`SettingsView.js`).
- **Persistance auth durcie** : `indexedDBLocalPersistence` avec fallback
  `browserLocalPersistence` (localStorage purgeable par iOS).
- **`getRedirectResult` sauté en natif** (`useAuth.js`) — le flux redirect
  n'existe pas avec le dialog Google natif.
- **Firestore** : ~~`experimentalForceLongPolling` → `experimentalAutoDetectLongPolling`~~
  **ANNULÉ le 9 août — ne pas retenter.** En WKWebView les streams WebChannel
  échouent et l'auto-détection met 30-60 s à basculer en long polling : constaté
  sur device, ~1 min bloqué sur « créer/rejoindre un foyer » après login. Le
  long polling forcé est le bon réglage pour cette app. En complément, le
  fallback 6 s de `useAuth` ne promeut plus un profil provisoire **sans foyer**
  (il routerait vers créer/rejoindre, avec risque de foyer en doublon).
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
  `capacitor.config.ts`.
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

`viewport-fit=cover` · `resolveFirebaseAuthDomain()` (fallback `localhost` →
domaine Firebase) · service worker sous détection de fonctionnalité · pas de
`window.open`/`_blank` · `alert/confirm/prompt` natifs via Capacitor iOS ·
versions cohérentes (Capacitor 6.2.1, GoogleSignIn 6.2.4) · `AppDelegate`
forwarde `open url` (callback OAuth) · `MainActivity` standard · Firestore
`persistentLocalCache()` (hors ligne OK) · photo de recette compressée (plafond
80 Ko) · rattrapage `visibilitychange` · `100vh` sans risque en natif ·
`.mrd-statusbar` = CSS mort.

> **Deux items retirés de cette liste le 23 août 2026.** « Safe areas » y
> figurait sans avoir pu être vérifié : Chrome headless n'expose **aucun** inset,
> donc ni les tests e2e ni les 57 captures ne pouvaient voir quoi que ce soit.
> Trois défauts étaient en réalité actifs (voir la section du 23 août).
> « `AppDelegate` » était vrai pour `open url` mais masquait l'absence du relais
> d'inscription APNs, alors que la même liste mentionnait push-notifications
> comme installé.
