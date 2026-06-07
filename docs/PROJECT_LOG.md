# PROJECT_LOG — Planning Famille (My Rolling Day)

---

## [2026-06-07] — Migration Capacitor (Vite + Android + iOS)

Ajout de Vite comme bundler et intégration Capacitor pour produire des apps natives Android et iOS.

| Fichier / Dossier | Changement |
|---|---|
| `package.json` | Ajout deps : `react`, `react-dom`, `htm`, `firebase`, `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` ; devDeps : `vite`, `@capacitor/cli` ; scripts : `dev`, `build`, `preview`, `cap:sync`. |
| `vite.config.js` | Nouveau fichier — configuration Vite minimale (`publicDir: "public"`, `build.outDir: "dist"`). |
| `capacitor.config.json` | Nouveau fichier — `appId: "com.myrollingday.app"`, `webDir: "dist"`, `androidScheme: "https"`. |
| `src/lib.js` | Imports CDN esm.sh → npm `react`, `react-dom/client`, `htm`. |
| `src/firebase/*.js` (7 fichiers) | Imports CDN gstatic.com → npm `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/messaging`. |
| Tous les `.js` de `src/` (32 fichiers) | Suppression des suffixes `?v=xxx` sur les imports locaux (Vite gère le versioning à la build). |
| `index.html` | Suppression des `?v=xxx` sur les attributs `href` / `src`. |
| `android/` | Projet Android Studio généré par `npx cap add android`. |
| `ios/` | Projet Xcode généré par `npx cap add ios` (CocoaPods à installer sur macOS). |

**Notes :**
- Build actuel : `dist/assets/index-*.js` ~1,4 MB — code-splitting à envisager plus tard.
- iOS : `pod install` doit être relancé depuis macOS (`npx cap sync ios` sur Mac).
- Auth Google (`signInWithPopup`) à remplacer par `@capacitor/google-auth` ou `signInWithRedirect` pour le contexte natif WebView.

---

## [2026-05-28] — Notification : tâche hebdomadaire non effectuée après 3 jours

Si une tâche de l'onglet **Semaine** (non récurrente) n'est pas cochée 3 jours après sa création, tous les membres du foyer reçoivent une push.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | Ajout du helper `extractTimestampFromId` (extrait le timestamp du champ `id` de la forme `task-{ms}`). Section 4 dans `checkTasksForFamily` : filtre `type === "weekly"` + `taskKind !== "recurring"` + non terminée + âge ≥ 3 jours. Anti-spam `srv-task-weekly-3d-{taskId}` (expire 3 jours → relance si toujours en attente). Contrôlé par `settings.weeklyReminder !== false`. |
| `src/utils/state.js` | `normalizeState` → `taskNotifications.weeklyReminder: state.taskNotifications?.weeklyReminder !== false` (activé par défaut). Version `?v=2026-05-28-weekly-notif-1`. |
| `src/components/settings/SettingsView.js` | Ajout de `weeklyReminder` dans l'objet `notif` et dans `activeNotificationItems`. Nouveau toggle 📆 "Taches hebdomadaires en attente" dans la section "Types d'alertes" (en dernier, avec `last`). Version `?v=2026-05-28-weekly-notif-1`. |
| `src/App.js` | Mise à jour des versions d'import `state.js` et `SettingsView.js`. |

---

## [2026-05-27] — Notification foyer : nouvelle tâche ajoutée

Chaque fois qu'une tâche est créée dans le planner, tous les membres du foyer qui ont accordé la permission de notification reçoivent une push.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | Ajout de `exports.onTaskCreated` : trigger `onDocumentUpdated` sur `families/{familyId}/planner/state`. Compare les tableaux `tasks` avant/après pour détecter les IDs nouveaux. Envoie via `sendToFamily` à **tous** les membres du foyer. Titre : `{emoji} Nouvelle tâche` (ou `Nouvelle tâche` si pas d'emoji). Corps : texte de la tâche. Anti-spam via `serverNotificationLog` avec clé `srv-task-created-{taskId}`. |

---

## [2026-05-26] — Fix : re-génération de code + email lié affiché dans la modal membre

| Fichier | Changement |
|---------|------------|
| `src/firebase/clientFamily.js` | `createHouseholdInvitation` : supprime la garde `if (person.linkedAccountId)` qui bloquait la création d'un code pour un membre dont le compte était déjà lié. La sécurité reste assurée côté `acceptHouseholdInvitation` : seul le même uid peut ré-accepter le code. Utile quand un membre perd l'accès au foyer (ex. `currentFamilyId` réinitialisé ou document membre manquant) — le ré-accept recrée le document membre et remet `currentFamilyId` à jour. Version `?v=2026-05-26-reinvite-linked-1`. |
| `src/firebase/client.js` | Mise à jour du numéro de version de `clientFamily.js`. |
| `src/components/settings/SettingsView.js` | (1) `editModalCanInvite` : retire `!editModalPerson.linkedAccountId` → bouton visible même si compte déjà lié. (2) Passe `linkedAccount={editModalLinkedAccount}` à `EditMemberModal`. Version `?v=2026-05-26-reinvite-linked-1`. |
| `src/components/settings/SettingsModals.js` | `EditMemberModal` : (1) nouveau prop `linkedAccount` ; (2) affiche l'email du compte lié sous le nom dans l'en-tête de la modal ; (3) label du bouton → `"Recréer l'accès"` si compte déjà lié, sinon `"Recreer un code"` / `"Creer un code"`. |
| `src/styles.css` | Ajout de `.foyer-modal-member-info`, `.foyer-modal-member-email`, `.foyer-modal-member-email--unknown` pour l'affichage de l'email sous le nom. |
| `src/App.js` | Mise à jour du numéro de version de `SettingsView.js`. |

---

## [2026-05-26] — Manifest : short_name changé en "Rappel"

Chrome affiche "from Rolling Day" sous les notifications push — texte tiré du `short_name` du manifest. Changé en "Rappel" pour que Chrome affiche désormais "from Rappel".

| Fichier | Changement |
|---------|------------|
| `manifest.json` | `"short_name": "Rolling Day"` → `"short_name": "Rappel"` |

---

## [2026-05-26] — Agenda : toggle 🔔 visible et fonctionnel pour les événements récurrents

Le formulaire de création/édition d'événement masquait complètement la section rappel quand "Répéter" était activé (`!form.repeatWeekly`), et le payload forçait `enabled: false` pour les récurrents. Le rappel ne pouvait donc jamais être sauvegardé sur un événement récurrent.

| Fichier | Changement |
|---------|------------|
| `src/components/agenda/AgendaView.js` | Suppression du `!form.repeatWeekly ?` qui cachait le toggle 🔔 ; `enabled: agendaNotifEnabled && !repeatWeekly` → `enabled: agendaNotifEnabled` ; `sentKeys` lookup utilise `recurringItems` quand `editing.entryKind === "recurring"` |

---

## [2026-05-26] — Notifications : événements récurrents du calendrier

Les événements récurrents (hebdomadaires, quotidiens, mensuels) avec une notification activée ne déclenchaient aucune push ni aucune notif locale — ils étaient complètement ignorés côté Cloud Function et côté client.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | `checkAgendaForFamily` accepte maintenant `recurringEvents` en paramètre. Pour chaque récurrent avec `notification.enabled`, calcule si l'événement se produit aujourd'hui (`daily` / `weekday` / `dayOfMonth`), puis applique la même logique de fenêtre 5 min et d'anti-spam que les événements ponctuels. Clé anti-spam : `srv-recur-{id}-{dateKey}-{start}-{min}`. Appel mis à jour pour passer `recurringEvents`. |
| `src/components/agenda/AgendaView.js` | Ajout de `recurringRef` + `onUpdateRecurringRef`. Le `checkAgendaNotifications` (vérifié toutes les 30 s) parcourt maintenant aussi les récurrents, calcule si l'occurrence est aujourd'hui, et stocke la `sentKey` dans `event.notification.sentKeys` via `onUpdateRecurring` pour l'anti-spam. |

---

## [2026-05-26] — Notifications : rappel fin de journée amélioré

Rappel à 18 h (heure configurable dans les réglages) si des tâches du jour ne sont pas faites.

**Avant :** comptait uniquement les tâches de type `daily` — message « X tâche(s) du foyer encore en attente »
**Après :** compte toutes les tâches du jour (`daily` + tâches dont `dueDate` = aujourd'hui) — message « Il vous reste X tâche(s) avant la fin de journée » + liste des 3 premières tâches en corps de notif.

La notification est active par défaut. L'heure se règle dans Réglages → Notifications → Rappel fin de journée.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | `checkTasksForFamily` : filtre `t.type === "daily"` → `daily OU dueDate === aujourd'hui` ; nouveau message |
| `src/hooks/useTaskNotifications.js` | Même correctif pour la notif client (app ouverte) |

---

## [2026-05-26] — Notifications : rejoindre un foyer déclenche une push même app fermée

### Contexte

La Cloud Function `onMemberJoined` et le `joinEvent` côté client existaient déjà, mais deux bugs bloquants empêchaient toute notification de s'envoyer.

### Bugs corrigés

**Bug 1 — Règle Firestore bloquait l'écriture du `joinEvent`** :
La règle `allow write: if false` pour `families/{id}/joinEvents` refusait silencieusement l'écriture du client après qu'un utilisateur accepte une invitation (erreur absorbée par un `console.warn`). La Cloud Function ne se déclenchait donc jamais.
→ Remplacé par `allow create: if isFamilyMember(familyId) && request.resource.data.joinerUid == request.auth.uid` : seul le nouvel entrant peut créer son propre événement.

**Bug 2 — Service worker sans SDK Firebase** :
Le service worker `firebase-messaging-sw.js` n'utilisait qu'un gestionnaire `push` brut sans le SDK Firebase Messaging. Firebase ne pouvait pas router les messages en arrière-plan vers `onBackgroundMessage`.
→ Ajout de `importScripts` pour `firebase-app-compat` et `firebase-messaging-compat`, initialisation du SDK, gestionnaire `onBackgroundMessage` propre.

### ⚠️ Action requise — Clé VAPID incorrecte

La clé dans `constants.js` (`FIREBASE_WEB_VAPID_KEY`) ne fait que **44 caractères** alors qu'une vraie clé VAPID Firebase (P-256 non compressée) en fait **87–88**. La validation dans `messaging.js` refuse les clés < 80 caractères → aucun token FCM n'est jamais enregistré → aucune push ne peut être livrée.

**Récupérer la vraie clé** : Firebase Console → projet `my-rolling-day` → Paramètres du projet → Cloud Messaging → Web Push certificates → copier la clé publique (87–88 chars, commence par `B`). La coller dans `constants.js` ligne 23.

| Fichier | Changement |
|---------|------------|
| `firestore.rules` | `joinEvents` : `allow write: if false` → `allow create: if isFamilyMember && joinerUid == auth.uid` |
| `public/firebase-messaging-sw.js` | Remplacement du gestionnaire `push` brut par le SDK Firebase Messaging compat + `onBackgroundMessage` |

---

## [2026-05-26] — Feature : tâche agendée aujourd'hui → remonte dans les tâches quotidiennes

| Fichier | Changement |
|---------|------------|
| `src/App.js` | `taskAppearsInTab` : si `tab === "daily"` et que la tâche a une entrée agenda (`planning.dateKey`) correspondant à la date du jour (`localDateKey(getCurrentAppDate())`), la tâche apparaît dans l'onglet quotidien quelle que soit son `type` (hebdo, mensuel, etc.). Les tâches "daily" restent toujours visibles. Les tâches deadline gardent leur section dédiée. Pas d'impact sur l'onglet "Mes tâches". |

---

## [2026-05-26] — UI : boutons stylo/corbeille harmonisés avec les autres boutons foyer

| Fichier | Changement |
|---------|------------|
| `src/components/settings/SettingsView.js` | Suppression des boutons ronds ✏️ (dans l'en-tête) et 🗑️ (rond dans actions). Remplacement par deux boutons texte `households-switch-btn--edit` (« ✏️ Renommer » / « ✕ Annuler ») et `households-switch-btn--danger` (« Supprimer ») dans une nouvelle div `.households-row-actions-right`, cohérents avec « Changer de foyer » / « + Ajouter un membre ». |
| `src/styles.css` | Suppression de `.households-row-edit-btn` et `.households-delete-btn`. Ajout de `.households-row-actions-right`, `.households-switch-btn--edit`, `.households-switch-btn--danger` et leurs variantes dark mode. |

---

## [2026-05-26] — Fix : renommage de foyer inline non fonctionnel (input écrasé à 0px)

| Fichier | Changement |
|---------|------------|
| `src/styles.css` | Dans `.households-rename-row` (flex row), le bouton Valider héritait de `.settings-valider-btn { width: 100% }` prévu pour les contextes flex-column. Cela écrasait l'input (flex: 1) à une largeur quasi nulle, rendant la saisie impossible. Ajout de `.households-rename-input { min-width: 0 }` et override `.households-rename-row .settings-valider-btn { width: auto; flex-shrink: 0; padding-left/right: 16px }` pour que l'input prenne tout l'espace disponible et le bouton sa taille naturelle. |

---

## [2026-05-25] — Fix : auto-fallback si le foyer courant est inaccessible après reconnexion

| Fichier | Changement |
|---------|------------|
| `src/hooks/useAuth.js` | Nouvel effet `auto-fallback` : quand `familiesReady = true`, que `currentFamilyId` est défini, mais que `currentFamily === null` (foyer introuvable dans la liste chargée — accès refusé, document supprimé, etc.), bascule automatiquement sur le premier foyer accessible dans `safeFamilies`. Évite qu'un utilisateur ayant rejoint un nouveau foyer soit bloqué en mode onboarding après déconnexion/reconnexion si son `currentFamilyId` pointait encore sur l'ancien foyer. Version `?v=2026-05-25-auto-fallback-1`. |
| `src/App.js` | Mise à jour du numéro de version de `useAuth.js`. |

---

## [2026-05-25] — Fix : switcher multi-foyers bloqué si un snapshot Firestore échoue

| Fichier | Changement |
|---------|------------|
| `src/firebase/clientFamily.js` | `watchFamilies` : (1) déduplique les IDs avec `[...new Set(...)]` pour éviter le stall si `familyIds` contient des doublons ; (2) dans le callback d'erreur de `onSnapshot`, appelle désormais `cacheStates.set(familyId, false)` puis `fireIfReady()` — sans ça, si un foyer renvoie une erreur Firestore (ex. règle de sécurité refusée), la garde `cacheStates.size < ids.length` restait bloquée et le callback principal n'était jamais appelé, laissant `families` figé sur l'ancien foyer unique. Version `?v=2026-05-25-watch-families-fix-1`. |
| `src/firebase/client.js` | Mise à jour du numéro de version de `clientFamily.js`. |
| `src/hooks/useAuth.js` | Mise à jour du numéro de version de `client.js`. |

---

## [2026-05-25] — Repas : vérification inventaire pour entrée/dessert + bouton "Marquer cuisiné" sur les extras

| Fichier | Changement |
|---------|------------|
| `src/utils/state.js` | Ajout de `lunchStarterCooked`, `lunchDessertCooked`, `dinnerStarterCooked`, `dinnerDessertCooked` dans `createMealShell` et `normalizeMeal`. Version `?v=2026-05-25-extras-inventory-cook-1`. |
| `src/App.js` | `computeMealCookState` accepte un 5e param `subSlot` (`"main"` / `"starter"` / `"dessert"`) pour choisir la bonne clé recette et cuisiné. `handleToggleCookWithInventory` accepte un 4e param `subSlot` et passe la bonne `cookedKey` dans l'annulation toast. Version `MealsView.js` et `state.js` → `?v=2026-05-25-extras-inventory-cook-1`. |
| `src/components/meals/MealsView.js` | Extraction de `checkInventoryAfterPick(recipe)` pour factoriser la vérification inventaire. `selectRecipe()` appelle cette fonction aussi pour entrée et dessert. `renderSlotExtras()` lit `starterCooked`/`dessertCooked` et passe un bouton 🍳 compact à `extraRecipeRow` qui appelle `onToggleCook(day, slot, wk, "starter"|"dessert")`. |
| `src/styles.css` | Ajout de `.mrd-meals-cook-btn--sm` et `.mrd-meals-cook-btn--sm.on` : variante compacte du bouton cuisiné pour les extras (entrée/dessert). |

---

## [2026-05-24] — "Mes foyers" : suppression réservée aux admins

| Fichier | Changement |
|---------|------------|
| `src/components/settings/SettingsView.js` | Bouton 🗑️ conditionnel : visible uniquement si `isActive && canManageHousehold` (foyer courant + rôle admin). Pour les autres foyers (rôle inconnu côté client), le bouton est masqué — l'utilisateur doit d'abord basculer sur ce foyer puis supprimer. |
| `src/App.js` | Version `SettingsView.js` → `?v=2026-05-24-households-manage-2`. |

---

## [2026-05-24] — "Mes foyers" : suppression par foyer + ajout de membres

| Fichier | Changement |
|---------|------------|
| `src/hooks/useAuth.js` | Ajout de `handleDeleteFamilyById(familyId)` : peut supprimer n'importe quel foyer de la liste (pas seulement le foyer actif), calcule le `nextFamilyId` automatiquement. Exporté. |
| `src/components/settings/SettingsView.js` | Prop `onDeleteFamilyById` ajoutée. Dans la page **"Mes foyers"** : pour le foyer actif → bouton "➕ Ajouter un membre" (ouvre `settingsPage === "household"`) + 🗑️ ; pour les autres foyers → bouton "Changer de foyer". Dans la page **"Gérer le foyer"** : section "Autres foyers" entièrement supprimée (wizard + code d'invitation). |
| `src/styles.css` | Ajout de `.households-row-actions`, `.households-row-actions-left`, `.households-delete-btn`, `.households-switch-btn`, `.households-switch-btn--add` + variantes dark. |
| `src/App.js` | Destructure `handleDeleteFamilyById` depuis `useAuth`, prop `onDeleteFamilyById` passée au `<SettingsView>`. Version `SettingsView.js` → `?v=2026-05-24-households-manage-1`. |

---

## [2026-05-24] — Page "Mes foyers" dans les Réglages

| Fichier | Changement |
|---------|------------|
| `src/components/settings/SettingsView.js` | Nouvelle page `settingsPage === "households"` : liste de tous les foyers avec statut actif, switch, renommage inline (foyer actif + admin). La section "Changer de foyer" (chips) est remplacée par un lien "Mes foyers (N) →". |
| `src/styles.css` | Ajout des classes `.households-row`, `.households-row--active`, `.households-row-name`, `.households-row-badge`, `.households-row-edit-btn`, `.households-rename-row`, `.households-switch-btn`, `.households-manage-link` + variantes dark. |
| `src/App.js` | Version `SettingsView.js` → `?v=2026-05-24-households-page-1`. |

---

## [2026-05-24] — Wizard création de foyer depuis les Réglages

| Fichier | Changement |
|---------|------------|
| `src/components/settings/NewHouseholdWizard.js` | **Nouveau fichier** — wizard multi-étapes (nom du foyer → membres → invitations). Réutilise les classes CSS de l'onboarding (`.onboarding-step`, `.onb-step-dots`, `.onb-kind-tab`, `.onb-member-*`, etc.). S'ouvre en modal overlay. |
| `src/components/settings/SettingsView.js` | Import de `NewHouseholdWizard`, nouvelle prop `onCreateFamilyWizard`, état `showNewHouseholdWizard`. Le bouton "Créer un nouveau foyer" remplace l'ancien champ texte + bouton. |
| `src/App.js` | Prop `onCreateFamilyWizard` → `handleCreateHouseholdOnboarding` (crée le foyer + membres + invitations). Version `SettingsView.js` → `?v=2026-05-24-household-wizard-1`. |

**Flux wizard :**
1. **Nom du foyer** — champ texte + 4 suggestions rapides
2. **Membres** — onglets Personne / Enfant / Animal, ajout à la liste, suppression
3. **Qui aura l'app ?** — sélection des membres qui recevront un code d'invitation *(étape visible seulement si des membres ont été ajoutés)*

---

## [2026-05-24] — Suppression de foyer

| Fichier | Changement |
|---------|------------|
| `src/firebase/clientFamily.js` | Ajout de `deleteFamily({ familyId, user, nextFamilyId })` : vérifie le rôle admin, charge members/people/invitations/joinEvents, met à jour chaque profil utilisateur membre (retire familyId, vide currentFamilyId, supprime linkedMemberIdsByHousehold), supprime tous les docs en batch. |
| `src/firebase/client.js` | Version `clientFamily.js` → `?v=2026-05-24-delete-household-1`. |
| `src/hooks/useAuth.js` | Import de `deleteFamily` + version → `?v=2026-05-24-delete-household-1`. Nouveau `handleDeleteFamily()` (vérifie admin, calcule nextFamilyId, appelle `deleteFamily`, affiche un message de confirmation). Exporté. |
| `src/components/settings/SettingsView.js` | Prop `onDeleteFamily` + handler `handleDeleteFamilyClick` avec double confirmation. Bouton "Supprimer le foyer" dans "Zone sensible", visible uniquement pour les admins (`canManageHousehold`). |
| `src/App.js` | Destructure `handleDeleteFamily` depuis `useAuth`, versions `useAuth.js` et `SettingsView.js` → `?v=2026-05-24-delete-household-1`, prop `onDeleteFamily` passée au `<SettingsView>`. |

---

## [2026-05-24] — Multi-foyers : picker enrichi + UX créer/rejoindre

| Fichier | Changement |
|---------|------------|
| `src/components/home/HomeView.js` | Picker de foyer entièrement revu : cartes avec nom + membres + avatars pour le foyer actif, boutons "Créer un foyer" / "Rejoindre un foyer" en bas avec formulaire inline (mode `create`/`join` avec `← Retour`). Le bouton ▾ est maintenant **toujours visible** (même avec un seul foyer). Nouveaux props : `onCreateFamily`, `onJoinFamily`. |
| `src/App.js` | Passage de `onCreateFamily` et `onJoinFamily` à `HomeView`. |
| `src/components/settings/SettingsView.js` | **Carte principale Foyer** : blocs "Créer" et "Rejoindre" désormais masqués si un foyer actif existe (gardés uniquement pour l'onboarding). **Sous-page "Gérer le foyer en détail"** : nouveau groupe "Autres foyers" (créer + rejoindre) ajouté juste avant "Zone sensible". |
| `src/styles.css` | Nouveaux styles : `.mrd-family-picker-card`, `.mrd-family-picker-action`, `.mrd-family-picker-back`, `.mrd-family-picker-form`, `.mrd-family-picker-input`, `.mrd-family-picker-submit`, etc. |
| `tests/unit/multi-family-source.test.js` | Test mis à jour pour refléter le nouveau comportement (create/join masqués dans la carte principale, présents dans la sous-page). |

**Tests :** 18/18 ✅

---

## [2026-05-24] — Tests E2E : module des tâches

| Fichier | Changement |
|---------|------------|
| `tests/e2e/tasks.test.js` | **Nouveau fichier** — suite complète pour le module des tâches. |
| `tests/e2e.test.js` | Ajout de `import "./e2e/tasks.test.js"`. |

**Section 1 — logique pure (37 tests, toujours exécutée) :** `reorderTasks` (tri daily < weekly < monthly < deadline, renumérotation), `taskPeriodFromTab`, `normalizeDuration` (allDay / none / preset / custom), `normalizeTaskReminderChoice` / `normalizeTaskNotificationChoice`, `defaultTaskForm` (valeurs par défaut par onglet), `getDueDateTime` (avec/sans heure, chaîne invalide), `isPastDue`, `isTaskLate`, `urgencyBadge`, `taskSortValue` (en retard=0, incomplète=1-3, complétée=10), `getDeadlineTasksForTab` (mine / daily / weekly / monthly).

**Section 2 — CDP browser (port 9226, 9 sous-tests, skippée si pas de navigateur headless) :** onboarding → onglet Tâches, FAB ouvre la modale, créer une tâche quotidienne, créer une tâche hebdomadaire, créer une tâche deadline avec date, basculer une tâche en terminé, fermer la modale sans créer, onglet "Mes tâches", tous les sous-onglets sans crash.

---

## [2026-05-24] — Bugfix : double initialisation Firebase → "Script error." au démarrage

| Fichier | Changement |
|---------|------------|
| `src/hooks/usePlannerSync.js` | Imports `firebase/client.js` mis à jour de `?v=2026-05-08-offline-cache-1` → `?v=2026-05-24-multi-family-1` (ligne 1 et 5 fusionnées en 1 import). |
| `src/hooks/usePushMessaging.js` | Idem. |
| `src/components/feedback/FeedbackWidget.js` | Idem. |
| `src/components/settings/SettingsSupportPage.js` | Idem. |
| `src/components/settings/SettingsView.js` | Import de `SettingsSupportPage.js` versionné (`?v=2026-05-24-multi-family-1`) pour invalider le cache. |
| `src/App.js` | Versions mises à jour pour `usePlannerSync`, `usePushMessaging`, `FeedbackWidget`, `SettingsView`. |

**Cause :** Lors de la refactorisation de `firebase/client.js` en sous-modules (`core.js`, `clientAuth.js`, etc.), `initializeApp(FIREBASE_CONFIG)` a été déplacé dans `core.js`. Mais plusieurs fichiers importaient encore `client.js` avec l'ancienne version `?v=2026-05-08-offline-cache-1`. Si le navigateur avait cette URL en cache avec l'**ancien** `client.js` monolithique (qui appelait aussi `initializeApp` directement), Firebase levait une erreur "App '[DEFAULT]' already exists" depuis gstatic.com (cross-origin) → `event.error` sans stack → handler bootstrap affichait **"Script error."** → écran "Démarrage bloqué" avant que React soit monté.

---

## [2026-05-24] — Bugfix : crash "Script error." + tâche + Google PWA

| Fichier | Changement |
|---------|------------|
| `src/components/auth/AuthScreen.js` | Suppression du blocage Google en mode PWA standalone. Le bouton "Continuer avec Google" est affiché sur toutes les pages (welcome, login, signup). `clientAuth.js` gère déjà le redirect vs popup automatiquement. |
| `index.html` | Handler `window.addEventListener("error")` : ajout du filtre "Script error." (erreurs cross-origin CDN Firebase/gstatic sans info diagnostic) et d'un guard `__APP_BOOT_STATE__ === "react-mounted"` (ne remplace plus l'UI React). Même correction pour `unhandledrejection` : ignore FirebaseError et messaging/\*. |
| `src/App.js` | `onAddTask` lambda : `(task) =>` → `(tab, form) =>` — passait seulement le 1er argument au lieu des 2 (`handleAddTask(type, form)`), causant `form = undefined` → crash à chaque création de tâche. |
| `src/hooks/useAuth.js` | Ajout de `setCurrentFamily` aux imports Firebase. Utilisé par `handleSwitchFamily` mais manquant dans la liste. |

**Cause "démarrage bloqué / Script error." :** Une erreur cross-origin levée par Firebase CDN pendant l'usage (p.ex. lors d'une sauvegarde Firestore) se propageait au handler HTML inline qui ne filtrait pas ces messages — remplaçait toute l'UI par la page d'erreur bootstrap même en plein milieu d'une session.

---

## [2026-05-24] — Inbox : formulaires de dispatch complets (modales complètes)

| Fichier | Changement |
|---------|------------|
| `src/components/inbox/InboxView.js` | Refonte des formulaires de dispatch : les mini-forms inline sont remplacés par des **modales complètes** identiques aux formulaires natifs. Tâche : emoji picker, texte, période (aujourd'hui/semaine/mois/avant…), type (unique/récurrente), urgence, attribué à. Agenda : emoji picker, titre, date+heure, durée, attribué à, personne concernée, répéter. Note : texte, visibilité (Foyer/Privée), partage avec membres. Nouvelles props : `people`, `childProfiles`. |
| `src/App.js` | Handlers `handleDispatchToTask`, `handleDispatchToAgenda`, `handleDispatchToNote` mis à jour pour accepter le payload complet (au lieu des paramètres individuels). `handleDispatchToAgenda` gère maintenant `repeatWeekly` → appelle `handleAddRecurring`. Props `people` et `childProfiles` ajoutées à `<InboxView>`. |

**Avant :** tap "→ Tâche" ouvrait 3 chips quotidien/semaine/mois. **Après :** ouvre une modale complète avec toutes les options de `TasksView`. Idem pour agenda (toutes les options de `AgendaView`) et notes (visibilité + partage comme dans `NotesView`).

---

## [2026-05-24] — Inbox : capture rapide avec dispatch vers tâches/agenda/notes

| Fichier | Changement |
|---------|------------|
| `src/utils/state.js` | Ajout de `state.inbox = []` dans `normalizeState()` avec normalisation des champs `id`, `text`, `hint`, `createdAt`, `createdBy`. |
| `src/constants.js` | Ajout de `{ id: "inbox", label: "Inbox", icon: "📥" }` dans `TABS`. |
| `src/components/inbox/InboxView.js` | **Nouveau composant.** Écran de capture rapide : textarea + chips de type optionnel (Tâche/Événement/Note) + liste d'items avec dispatch inline vers tâches (choix quotidien/semaine/mois), agenda (date picker + heure) ou notes (instantané). |
| `src/styles.css` | Ajout des styles `.ibx-*` : add card, hint chips, items list, dispatch buttons, inline forms, section home. Dark mode inclus. |
| `src/components/home/HomeView.js` | Nouveau prop `inbox`. Section "📥 Inbox" insérée entre "À venir" et "Accès rapide" — affiche jusqu'à 3 items avec badge de comptage et lien "Voir tout →". Masquée si inbox vide. |
| `src/App.js` | Import `InboxView`. Ajout de `"inbox"` dans `secondaryScreens` et dans la map des titres. Handlers : `handleAddInboxItem`, `handleDeleteInboxItem`, `handleDispatchToTask`, `handleDispatchToAgenda`, `handleDispatchToNote`. Rendu `<InboxView>` dans `plannerContent`. Prop `inbox` passée à `HomeView`. |

**Fonctionnement :** L'inbox est accessible depuis l'accueil (section dédiée visible dès le 1er item) et depuis `onNavigate("inbox")`. Chaque item peut être dispatchée en 2 taps (choisir destination → confirmer), puis est automatiquement retirée de l'inbox. Les données persistent via Firebase (sync `usePlannerSync`).

---

## [2026-05-24] — Fix Google Sign-in localhost + logs d'erreur complets

| Fichier | Changement |
|---------|------------|
| `src/constants.js` | `authDomain` corrigé : `"myrollingday.netlify.app"` → `"my-rolling-day.firebaseapp.com"`. L'ancienne valeur dirigeait le handler OAuth vers Netlify (404), ce qui cassait `signInWithPopup` en local. |
| `src/firebase/clientAuth.js` | `console.error` du bloc popup enrichi avec `error?.message` et `error?.customData` (en plus de `error?.code` et `error` déjà présents). |
| `src/hooks/useAuth.js` | Ajout de `console.error("[auth] runAuth error", ...)` avant `setAuthError(formatAuthError(error))` dans `runAuth()`. Ajout de `console.error("[auth] getGoogleRedirectResult error", ...)` avant `setAuthError` dans le catch du redirect. Les erreurs brutes ne sont plus masquées silencieusement par `formatAuthError`. |

**Note Firebase Console** (non vérifiable en code) : s'assurer que `localhost` et `127.0.0.1` sont dans *Authentication → Authorized domains* et que le provider Google est activé sur https://console.firebase.google.com/project/my-rolling-day/authentication

---

## [2026-05-23] — Notifications : re-proposition après "Plus tard" + nettoyage

| Fichier | Changement |
|---------|------------|
| `src/utils/storage.js` | Nouveau système `mrd_notif_prompt` (JSON) remplaçant le booléen `mrd_notifications_prompt_seen`. Fonctions : `shouldShowNotifPrompt()`, `markNotifPromptGranted()`, `markNotifPromptDismissed()`, `getNotifPromptDismissCount()`. Délais : 3j après 1er refus, 7j après 2e. Arrêt après 3 refus. Migration automatique de l'ancien booléen. |
| `src/App.js` | Import des nouvelles fonctions storage. Récupération de `pushPermission` depuis `usePushMessaging`. Remplacement des 3× `alreadySeen` par `shouldShowNotifPrompt()`. `onActivate` → `markNotifPromptGranted()`, `onLater` → `markNotifPromptDismissed()`. Ajout d'une vérification au lancement de l'app (re-proposition si délai écoulé). |
| `src/components/modals/AppModals.js` | `NotifPromptModal` reçoit `dismissCount` : titre et corps adaptés au 2e rappel, bouton "Non merci" au 3e. |
| `src/components/agenda/AgendaView.js` | Suppression de la fonction morte `requestNotificationPermission()` (jamais appelée, sans FCM). |

---

## [2026-05-23] — HistoryView : retour à la vue par personne + bouton + agrandi

| Fichier | Changement |
|---------|------------|
| `src/components/history/HistoryView.js` | Remplacement de la vue "feed de tâches" par la version originale à colonnes par personne. Props : `history`, `users`, `onClearHistory`. Affiche un colonne par membre avec ses entrées, bouton "Effacer" en haut. |
| `src/App.js` | Correction du rendu HistoryView : `tasks`/`people` remplacés par `history=${state.history}`, `users=${householdPeople}`, `onClearHistory=${handleClearHistory}`. Icône SVG du FAB agrandie de 22px → 26px. |
| `src/styles.css` | Bouton FAB "+" agrandi de 52×52px → 64×64px. |

---

## [2026-05-23] — TasksView : suppression de la fonctionnalité d'archivage

| Fichier | Changement |
|---------|------------|
| `src/components/tasks/TasksView.js` | Suppression du bouton 📦 "Archiver" par tâche, du bouton "Tout archiver" en titre de section, et de toute la section "Archives" (toggle + liste + bouton "Vider les archives" + bouton "Désarchiver"). Suppression de l'état `showArchived` et du `useMemo` `archivedTasks`. La section "Terminées" affiche maintenant les tâches directement sans wrapper ni bouton d'action. |

---

## [2026-05-23] — HistoryView : retour tâches uniquement

| Fichier | Changement |
|---------|------------|
| `src/components/history/HistoryView.js` | Suppression des notes, des courses et des onglets de filtre. Le feed n'affiche plus que les tâches complétées. Compteur unique "X tâches complétées". Props `notes` et `lists` retirées. |
| `src/App.js` | `HistoryView` ne reçoit plus que `tasks` et `people` (suppression de `notes` et `lists`). |

---

## [2026-05-23] — Restauration de ListsView à la version originale

| Fichier | Changement |
|---------|------------|
| `src/components/lists/ListsView.js` | Remplacé par la version originale fournie par l'utilisateur. Suppression de tous les ajouts : champ `price` dans `itemForm`, calcul de totaux, widget budget, `onClearCheckedItems`, `onCheckAllItems`, section "Achetés" (devenu "Cochés"). Version originale restaurée intégralement. |
| `src/App.js` | Suppression des props `onCheckAllItems` et `onClearCheckedItems` du render de `ListsView` (ces props n'existent plus dans le composant restauré). |

---

## [2026-05-21] — Tests E2E : navigation entre onglets

| Fichier | Changement |
|---------|------------|
| `tests/e2e/navigation.test.js` | Nouveau fichier. Section 1 (pure) : 5 tests sur `NAV_TABS`, `getBottomId` et les alias tâches. Section 2 (CDP, port 9225) : 3 sous-tests — atteindre la page d'accueil via stub Firebase, cliquer chaque onglet (Tâches/Agenda/Repas/Listes/Accueil) et vérifier absence de crash + `aria-current="page"` + élément caractéristique de chaque vue, puis test aller-retour sans écran fatal. |
| `tests/e2e.test.js` | Ajout de `import "./e2e/navigation.test.js"`. |

---

## [2026-05-21] — HistoryView : feed complet (tâches + notes + courses)

| Fichier | Changement |
|---------|------------|
| `src/components/history/HistoryView.js` | Onglet "Courses" ajouté aux filtres. `buildFeed` étendu : parcourt `lists[].items`, ajoute les articles `done + purchasedAt` (kind `"shopping"`, icon 🛒). Prop `lists = []` ajouté. Badge kind : "Courses" pour shopping. État vide adapté pour le filtre shopping. |
| `src/App.js` | `HistoryView` reçoit maintenant `lists=${state.lists}`. |

---

## [2026-05-21] — HomeView : recherche globale étendue (listes + inventaire)

| Fichier | Changement |
|---------|------------|
| `src/components/home/HomeView.js` | Ajout props `lists` et `inventory`. `searchResults` useMemo étendu : `listItemHits` (cherche dans `list.items[].text`, max 3, kind `"list-item"`, tab `"lists"`) et `inventoryHits` (cherche dans `item.name`, max 3, kind `"inventory"`, tab `"inventory"`). `KIND_EMOJI` mis à jour. Overlay de recherche : deux nouveaux groupes "Listes" et "Inventaire" rendus. |
| `src/App.js` | `HomeView` reçoit maintenant `lists=${state.lists}` et `inventory=${state.inventory}`. |

---

## [2026-05-21] — Activation renderShoppingSections + bouton Vider cochés

| Fichier | Changement |
|---------|------------|
| `ListsView.js` | `renderShoppingSections` maintenant appelé dans le rendu principal (remplace les deux appels `renderDetailSection`). Budget widget, total panier, barre de progression et état "tout coché" 🎉 désormais visibles. Bouton "Vider" ajouté aux deux sections "Cochés" (état normal + état tout coché). |

---

## [2026-05-21] — Vider les articles cochés dans une liste

| Fichier | Changement |
|---------|------------|
| `useLists.js` | Ajout `handleClearCheckedItems(listId)` : supprime tous les items `done: true` d'une liste donnée. Exposé dans le return du hook. |
| `App.js` | Destructure + passe `onClearCheckedItems=${handleClearCheckedItems}` à ListsView. |
| `ListsView.js` | Prop `onClearCheckedItems` ajouté. `renderDetailSection` accepte un 4e param `extraAction`. Section "Cochés/Achetés" : bouton "Vider" en rouge discret dans l'en-tête. |
| `styles.css` | `.ldv-section-clear-btn` : bouton pill discret, rouge au hover. |

---

## [2026-05-21] — État vide tâches : texte + ✨ + bouton

| Fichier | Changement |
|---------|------------|
| `TasksView.js` | État vide : "Pas de tâche pour le moment ✨" + bouton "Ajouter ma première tâche". Plus d'emoji géant séparé. |

---

## [2026-05-21] — Simplification états vides tâches + repas accueil

| Fichier | Changement |
|---------|------------|
| `TasksView.js` | État vide : ✅ → ⭐, suppression du sous-texte et du bouton "Créer la première". |
| `HomeView.js` | Repas vide : suppression du `+` et du hint "Appuyer pour planifier". Affiche uniquement "Non planifié". |

---

## [2026-05-21] — Fix "Mes tâches" : tâches non assignées masquées

| Fichier | Changement |
|---------|------------|
| `App.js` | `isMineTask` : suppression du `if (task.assignedWholeFamily) return true`. Les tâches créées sans assignation explicite reçoivent `assignedWholeFamily: true` (TasksView L.654) mais ne doivent pas apparaître dans "Mes tâches". Seules les tâches avec `assignedPersonIds` incluant l'utilisateur actif (ou `assignedPersonId` pour compatibilité) sont désormais visibles dans cet onglet. |

---

## [2026-05-21] — Fix champ prix dans renderDetailItem

| Fichier | Changement |
|---------|------------|
| `ListsView.js` | Le champ prix était dans `renderListItem` (non utilisé) mais pas dans `renderDetailItem` (la vraie fonction appelée). Ajout du bloc `lists-page-item-price-right` dans `renderDetailItem`, entre `ldv-item-body` et le menu ⋮. |

---

## [2026-05-21] — Fix prix article non sauvegardé + fix visibilité champ prix

| Fichier | Changement |
|---------|------------|
| `useLists.js` | `handleUpdateListItem` : ajout du champ `price` dans le mapping (était ignoré — seuls text/quantity/unit étaient traités). Le prix tapé dans l'input disparaissait à chaque re-render car jamais écrit dans le state. |

---

## [2026-05-21] — Fix visibilité champ prix dans les articles

| Fichier | Changement |
|---------|------------|
| `styles.css` | `.lists-page-item-price-right` : flex-direction row (€ et input côte à côte). `.lists-page-item-price` : bordure visible `var(--mrd-border)` au lieu de transparent, `align-self: center`, `color: var(--mrd-fg)`. Fix : le champ était invisible car bordure transparente + fond trop proche du fond item. |

---

## [2026-05-21] — Prix à droite de l'article + Note vocale

| Fichier | Changement |
|---------|------------|
| `ListsView.js` | Prix déplacé hors de `lists-page-item-controls` → nouvelle div `lists-page-item-price-right` (colonne flex, alignée à droite entre l'item et le bouton ×). Affiche le total ligne (prix × qté) en petit quand qté > 1. Input prix sans bordure par défaut, bordure accent au focus. |
| `NotesView.js` | Import `useRef`. États `addNoteText` (textarea contrôlé), `listening`. `recognitionRef` pour l'instance SpeechRecognition. Formulaire converti en contrôlé (`value=${addNoteText}`). Fonctions `startVoice`, `stopVoice`. Bouton 🎤 positionné en absolu dans le textarea : rouge pulsant quand actif, clic → démarre/arrête. Langue `fr-FR`. Résultats interimaires alimentent le textarea en temps réel. Bouton "Enregistrer" désactivé si textarea vide. Fallback silencieux si SpeechRecognition non supporté. |
| `styles.css` | `.lists-page-item-price-right`, `.lists-page-item-price-total`. `.note-voice-textarea-wrap`, `.note-voice-btn`, `.note-voice-btn.is-listening` (pulse rouge), `.note-voice-dot`, `@keyframes noteMicPulse`. |

---

## [2026-05-21] — Budget liste de courses

| Fichier | Changement |
|---------|------------|
| `ListsView.js` | Helpers `parsePrice`, `itemTotal`, `formatEuro` au niveau module. Champ `price` ajouté à `itemForm` (init, reset, `submitItem`, `openEditItem`). Champ prix inline (input € + symbole €) dans `renderListItem`, entre la quantité et la date d'achat. Champ prix dans le formulaire modal (sous la quantité, visible quand `showItemQuantityFields`). `renderShoppingSections` calcule `totalPending`, `totalPurchased`, `totalAll`. Widget budget : total panier, bouton "+ Budget" pour saisir un budget max (`onUpdateList(id, { budget })`, barre de progression colorée (verte/rouge si dépassé), détail "Déjà dans le panier / Reste". Totaux affichés dans les sous-titres de section (ex. "3 articles · 12,50 €"). État `budgetEdit` + `budgetDraft` pour l'édition inline du budget. |
| `styles.css` | Classes `.lists-page-item-price-wrap/symbol/price`, `.lists-budget-widget/row/label/total/set-btn/edit-wrap/input/save/bar-wrap/bar/bar-fill(.over)/pct(.over)/detail/spent/pending`. |

---

## [2026-05-19] — 5 nouvelles features

### 📌 Épingler une note
| Fichier | Changement |
|---------|------------|
| `NotesView.js` | Bouton 📌 dans `note-actions` : `onUpdateNote(id, { pinned: !note.pinned })`. Notes épinglées triées en premier dans `filteredNotes`. Badge 📌 visible en coin supérieur droit de la carte. Bouton actif mis en avant (classe `note-pin-btn--active`). |
| `styles.css` | `.note-pin-badge`, `.note-pinned` (bordure 2px), `.note-pin-btn--active`. |

### ⏰ Jours restants sur tâches deadline
| Fichier | Changement |
|---------|------------|
| `TaskCard.js` | Nouvelle fonction exportée `daysLeft(task)` : retourne `"Aujourd'hui"`, `"Demain"` ou `"J-X"` pour les tâches deadline non terminées. Badge `days-left-tag` affiché dans les badges de la carte, absent si la tâche est déjà en retard. |
| `styles.css` | `.days-left-tag` (fond bleu clair). |

### 🔔 Alertes péremption inventaire
| Fichier | Changement |
|---------|------------|
| `InventoryView.js` | `expiringItems` : items actifs avec `daysUntilExpiry <= 7`, triés du plus urgent. Section "⏰ À consommer bientôt" affichée en haut de la liste (hors recherche active), avec les mêmes cartes `ldv-item` que le reste. |
| `styles.css` | Classes `.inv-expiring-section`, `.inv-expiring-head`, `.inv-expiring-title`, `.inv-expiring-count`, `.inv-expiring-list` (bordure amber). |

### 🗂️ Archiver les tâches terminées
| Fichier | Changement |
|---------|------------|
| `TasksView.js` | État `showArchived`. `sortedTasks` et `safeAllTasks` filtrent désormais `t.archived !== true`. `archivedTasks` = tâches archivées. Dans la section "Terminées" : bouton 📦 "Archiver" sur chaque carte + bouton "Tout archiver". Section pliable "Archives (N)" en bas avec bouton ↩ "Restaurer" et "Vider les archives" (suppression définitive). |
| `styles.css` | `.task-archive-row/btn/all-btn/archives-toggle-row/toggle-btn/clear-btn`, `.task-group-archived` (opacité réduite). |

### 🔍 Recherche globale (tâches + recettes + notes)
| Fichier | Changement |
|---------|------------|
| `App.js` | Passe `notes=${state.notes}` à `HomeView`. |
| `HomeView.js` | Prop `notes`. État `searchOpen` / `searchQuery`. `searchResults` useMemo (tâches · recettes · notes, 5 résultats max par catégorie). Bouton 🔍 dans le header (à gauche du bouton ⚙️). Overlay `gs-backdrop` + panneau `gs-panel` : barre de saisie, résultats groupés par type, clic → `onNavigate(tab)`. Fermeture via Échap ou clic en dehors. |
| `styles.css` | Classes `.gs-backdrop`, `.gs-panel`, `.gs-bar`, `.gs-input`, `.gs-results`, `.gs-group`, `.gs-result-btn`, etc. Dark mode inclus. |

---

## [2026-05-19] — Notes : édition inline dans la carte

| Fichier | Changement |
|---------|------------|
| `NotesView.js` | Nouveaux états `inlineEditId` / `inlineEditText`. Fonctions `startInlineEdit`, `saveInlineEdit`, `cancelInlineEdit`. Clic sur une note dont on est l'auteur → le texte de la carte se transforme en `<textarea>` avec boutons Annuler / Enregistrer. `Ctrl+Entrée` pour sauvegarder, `Échap` pour annuler. Non-auteurs : clic → modale de visualisation (comportement inchangé). L'icône crayon devient une icône ⋮ (trois points) pour accéder aux options de visibilité via la modale complète. |
| `styles.css` | Classes `.note-inline-editing` (contour accent, pas de hover transform), `.note-inline-textarea`, `.note-inline-actions`, `.note-inline-cancel`, `.note-inline-save`. Dark mode du textarea inline. |

---

## [2026-05-19] — États vides avec guidance : InventoryView

| Fichier | Changement |
|---------|------------|
| `InventoryView.js` | État vide refactorisé : styles inline → classes CSS. Trois variantes selon le contexte : 🔍 "Aucun résultat" (recherche active), ✅ "Tout est rangé ✓" (onglet non-rangés vide), 📦 "Inventaire vide" (état initial). Bouton CTA "Ajouter un article" (appelle `openCreateModal()`) affiché uniquement quand l'inventaire est vide et sans filtre actif. |
| `styles.css` | Nouvelles classes `.inv-empty-state`, `.inv-empty-emoji`, `.inv-empty-title`, `.inv-empty-sub`, `.inv-empty-btn` — même pattern visuel que `lists-empty-*`, avec animation `mrdSlideUp`. |

---

## [2026-05-19] — Accueil : événements récurrents dans "À venir"

| Fichier | Changement |
|---------|------------|
| `HomeView.js` | Nouvelle fonction module-level `nextRecurringDateKey(ev, fromDate)` : calcule la prochaine date d'occurrence pour chaque type de récurrence (`daily`, `weekly`, `monthly`). Nouveau prop `recurringEvents`. Le `useMemo` "upcoming" fusionne désormais les événements ponctuels (depuis `agenda`) et les récurrents (depuis `recurringEvents`), dédupliqués par `text|dateKey`, triés par date, limités à 4. `renderEvent` affiche un badge `↺` (classe `.mrd-event-recur-badge`) sur les occurrences récurrentes. |
| `App.js` | Passe `recurringEvents=${state.recurringEvents}` à `HomeView`. |
| `styles.css` | Classe `.mrd-event-recur-badge` : badge `↺` en gris discret (`var(--mrd-fg3)`) aligné à droite dans la carte événement. |

---

## [2026-05-19] — Liste de courses : "Tout cocher" + célébration + toast fix home

| Fichier | Changement |
|---------|------------|
| `useLists.js` | Nouvelle fonction `handleCheckAllItems(listId)` : coche tous les articles non-cochés d'une liste en une seule mise à jour d'état (évite N updates séparés). Date d'achat `purchasedAt` mise à jour automatiquement. |
| `App.js` | Destructure + passe `onCheckAllItems=${handleCheckAllItems}` à `ListsView`. |
| `ListsView.js` | Nouveau prop `onCheckAllItems`. Bouton "Tout cocher" dans le header de la section "À acheter" (visible à partir de 2 articles en attente). État de célébration 🎉 quand tous les articles sont cochés et qu'il en restait au moins un. |
| `HomeView.js` | Toast tâche home : affiche désormais le nom de la tâche (`toast.taskText`) au lieu du texte générique "Tâche effectuée". |
| `styles.css` | Classes `.lists-check-all-btn`, `.lists-all-done/emoji/title/sub`. Ajustement de `align-items` sur `.lists-page-section-head` (baseline → center). |

---

## [2026-05-19] — Accueil : salutation horaire + badge courses sur accès rapide

| Fichier | Changement |
|---------|------------|
| `HomeView.js` | Salutation dynamique selon l'heure : 5h–11h → "Bonjour ☀️", 12h–17h → "Bon après-midi 🌤️", 18h+ → "Bonsoir 🌙". Nouveau prop `pendingShoppingCount` : badge coloré sur le bouton "Listes" dans la grille d'accès rapide quand des articles sont en attente. `aria-label` enrichi ("X articles en attente"). |
| `App.js` | Calcul de `pendingShoppingCount` : filtre `state.lists` pour la liste de courses principale (`isShoppingList`), compte les items non cochés. |
| `styles.css` | Nouvelles classes `.mrd-quick-btn-icon-wrap` (position relative) et `.mrd-quick-badge` (badge coloré accent, coin supérieur droit). |

---

## [2026-05-19] — Toasts généralisés : recettes, notes, agenda, suppression tâche

Tous les changements dans `App.js` — les callbacks sont wrappés pour afficher un toast après l'action :

| Action | Toast |
|--------|-------|
| Tâche supprimée | "Tâche supprimée" |
| Recette ajoutée | "✓ Recette ajoutée" |
| Recette mise à jour | "✓ Recette mise à jour" |
| Recette supprimée | "Recette supprimée" |
| Note enregistrée | "✓ Note enregistrée" |
| Note mise à jour | "✓ Note mise à jour" |
| Note supprimée | "Note supprimée" |
| Événement agenda ajouté | "✓ Événement ajouté" |
| Événement agenda mis à jour | "✓ Événement mis à jour" |
| Événement agenda supprimé | "Événement supprimé" |
| Événement récurrent ajouté | "✓ Événement récurrent ajouté" |
| Événement récurrent mis à jour / supprimé | idem |

---

## [2026-05-19] — Dark mode HistoryView + état vide repas incitatif

| Fichier | Changement |
|---------|------------|
| `styles.css` | Dark mode pour `.history-feed-item`, bordures colorées par type, badges de type adaptés. Séparateur de stats adapté. |
| `HomeView.js` | État vide des cards repas (déjeuner / dîner) enrichi : ajout d'un "+" et d'un sous-texte "Appuyer pour planifier". |
| `styles.css` | Nouvelles classes `.mrd-home-meal-empty-plus` et `.mrd-home-meal-empty-hint`. Overrides dans `.mrd-home-meal-grid` pour les tailles compactes. |

---

## [2026-05-19] — HistoryView : fil d'activité réel (tâches complétées + notes)

| Fichier | Changement |
|---------|------------|
| `HistoryView.js` | Refonte complète. Au lieu du pipeline `state.history` (jamais alimenté), le composant construit un fil d'activité depuis `tasks` et `notes` directement. `buildFeed()` collecte : tâches avec `completedAt` non vide + notes. Trie par date décroissante, limite à 40 éléments. Interface : compteurs "X tâches complétées / X notes" en haut, onglets filtre "Tout / Tâches / Notes", liste d'items avec icône, texte tronqué, avatars des membres et date relative ("Il y a 2h", "Hier", etc.). État vide enrichi selon le filtre actif. |
| `App.js` | `HistoryView` reçoit maintenant `tasks=${state.tasks}`, `notes=${state.notes}`, `people=${householdPeople}` au lieu du `history` inutilisé. |
| `styles.css` | Nouvelles classes `.history-feed-*` : section, header avec stats, liste d'items avec bordure colorée par type (vert = tâche, ambre = note), badge de type, avatar, date relative. |

---

## [2026-05-19] — Badge tâches en retard sur la BottomNav + perf AgendaView

| Fichier | Changement |
|---------|------------|
| `AgendaView.js` | `layoutTimedEntries` déplacée hors du composant (niveau module) — fonction pure qui n'utilise que `timeToMinutes`, évite de la recréer à chaque render. Correction de `useMemo(peopleMap)` : dépendance changée de `[activePeople]` (nouveau tableau à chaque render → memo jamais déclenché) vers `[people]` (prop stable). |
| `App.js` | Calcul de `stats.overdueTaskCount` ajouté dans le `useMemo` existant : compte les tâches deadline non complétées dont l'échéance est dépassée. Passé comme prop `overdueTaskCount` à `BottomNav`. |
| `BottomNav.js` | Nouveau prop `overdueTaskCount`. Badge rouge `mrd-bnav-badge` affiché sur l'icône Tâches quand `> 0`. Affiche le chiffre exact ou "9+" au-delà. `aria-label` enrichi avec "— N en retard" quand badge actif. |
| `styles.css` | Nouvelles classes `.mrd-bnav-icon-wrap` (position relative) et `.mrd-bnav-badge` (badge rouge absolu, coin supérieur droit). |

---

## [2026-05-19] — Fix : erreur silencieuse dans discardCurrentUserDraftAccount

| Fichier | Ligne | Changement |
|---------|-------|------------|
| `clientFamily.js` | L.695 | Suppression du `.catch(() => {})` sur `deleteDoc(doc(db, "users", uid))`. Avant : si la suppression Firestore échouait, `deleteUser` était quand même appelé → document utilisateur orphelin en base sans compte Auth associé. Après : l'erreur remonte naturellement → `handleCancelProfileSetup` → `runFamilyAction` → `setFamilyError` → message d'erreur affiché à l'utilisateur. Le `.catch(() => {})` sur `signOut` (après `deleteUser`) est conservé intentionnellement car Firebase Auth invalide déjà la session lors de `deleteUser`. |

---

## [2026-05-19] — Responsive desktop : grille repas 3 colonnes + notes masonry

| Fichier | Changement |
|---------|------------|
| `styles.css` | **Grille repas accueil** : ajout de `@media (min-width: 640px)` qui passe `.mrd-home-meal-grid` en `1fr 1fr 1fr !important` (tablette et desktop). Le bloc `@media (min-width: 960px)` existant mis à jour en conséquence (`1fr 1fr 1fr`). |
| `styles.css` | **Notes masonry** : seuil 1-colonne relevé de 360px → 400px (respiration sur petits téléphones). Ajout de `@media (min-width: 600px)` qui passe la masonry en 3 colonnes sur tablette/desktop. |

---

## [2026-05-19] — NotesView enrichie : recherche + filtre + état vide

| Fichier | Changement |
|---------|------------|
| `NotesView.js` | Ajout de 2 états : `search` (texte) et `filterVis` ("all" / "household" / "mine"). Calcul de `filteredNotes` : filtre par visibilité puis par texte (case-insensitive). Ajout de `renderToolbar()` — barre de recherche avec bouton ×  + onglets segmentés "Toutes / Foyer / Mes notes". La toolbar s'affiche uniquement quand il existe des notes. État vide enrichi : emoji 📝 + titre + sous-titre d'invitation à écrire. Si des notes existent mais aucune ne correspond au filtre : message "Aucune note ne correspond à ta recherche". |
| `styles.css` | Nouvelles classes `.notes-toolbar`, `.notes-search-wrap`, `.notes-search-input`, `.notes-search-clear`, `.notes-filter-tabs`, `.notes-empty-state/emoji/title/sub` |

---

## [2026-05-19] — Animations d'entrée sur les modales

| Fichier | Changement |
|---------|------------|
| `styles.css` | Ajout de `@keyframes mrdFadeIn` (opacité 0→1, 0.18s). Animation appliquée aux `.modal-backdrop` (global + `.mrd-shell`) pour un fondu d'entrée. Les `.modal-card` (global) reçoivent également `mrdSlideUp 0.22s ease` (déjà présent sur `.mrd-shell .modal-card`). Respect de `prefers-reduced-motion : reduce` — toutes les animations de modale sont désactivées via `animation: none !important`. |

---

## [2026-05-15] — Accessibilité : aria-labels BottomNav + bouton Paramètres

| Fichier | Changement |
|---------|------------|
| `BottomNav.js` | Ajout `type="button"`, `aria-label=${label}`, `aria-current="page"` sur le bouton actif. Le `<span>` du label passe à `aria-hidden="true"` (évite la double lecture par les lecteurs d'écran). |
| `HomeView.js` | Bouton engrenage : ajout `type="button"` + `aria-label="Paramètres"` |

---

## [2026-05-15] — Toasts de confirmation (App.js)

4 changements dans `App.js` :

| Endroit | Avant | Après |
|---------|-------|-------|
| Profil sauvegardé | `setAccountMessage("Ton profil a ete mis a jour.")` (faute + pas de toast) | `showToast("✓ Profil mis à jour")` |
| Tâche créée | Aucun feedback | `showToast("✓ Tâche créée")` sur `onAddTask` |
| Tâche modifiée | Aucun feedback | `showToast("✓ Tâche mise à jour")` sur `onUpdateTask` |
| Ingrédients → courses (×2) | "Ingrédients ajoutés à votre liste de courses." (sans compteur) | `"✓ N ingrédient(s) ajouté(s) à la liste de courses"` |

---

## [2026-05-15] — États vides avec guidance (Listes + Tâches)

| Fichier | Changement |
|---------|------------|
| `ListsView.js` L.1021 | Nouvel état vide quand aucune liste du tout : emoji 📋 + titre + description + bouton "Créer une liste". Si des listes existent mais aucune dans le filtre actif : message simple inchangé. |
| `TasksView.js` L.956 | Ajout d'un emoji ✅ et d'un sous-titre descriptif au-dessus du bouton "Créer la première" |
| `styles.css` | Nouvelles classes `.lists-empty-state/emoji/title/sub/btn` + `.task-empty-emoji/sub` ajoutées |

---

## [2026-05-15] — Fix "Régénérer le code d'invitation" (3 bugs)

4 fichiers modifiés pour corriger le bouton "Recréer un code" dans les Réglages.

| Fichier | Ligne | Correction |
|---------|-------|------------|
| `clientFamily.js` | L.347 | Avant de créer un nouveau code, expire tous les codes `pending` existants pour ce membre via un batch Firestore atomique (`status: "superseded"`) |
| `useAuth.js` | L.663 | `handleCreateInvitation` retourne maintenant `{ invitationCode, memberName }` au lieu d'appeler `setAccountMessage` |
| `SettingsModals.js` | L.52 | `EditMemberModal` : ajout prop `onInviteCreated`, click handler devenu `async`, `await` sur `onCreateInvitation`, ouverture de la modal de confirmation avec le nouveau code |
| `SettingsView.js` | L.327 | `pendingInvitationsByMember` : remplacement du `reduce` (prenait le plus vieux) par un `for...of` qui prend le premier (= le plus récent, liste déjà triée newest-first) + passage de `onInviteCreated` à `EditMemberModal` |

---

## [2026-05-15] — Fix picker repas : liste verticale + photo si disponible

- `styles.css` : `.recipes-page-rlist` scopée à `.recipes-page .recipes-page-rlist` → la grille 2 colonnes ne s'applique plus au picker de repas
- `MealsView.js` L.646 : le thumb du picker affiche désormais `recipe.photo` si disponible, sinon `CategoryIcon` (même logique que la page recettes)

---

## [2026-05-15] — Grille 2 colonnes avec photos dans la liste recettes

`src/styles.css` — passage de la liste horizontale compacte à une grille photo 2 colonnes.

- `.recipes-page-rlist` → `display: grid; grid-template-columns: 1fr 1fr`
- `.rcard.rcard-recipe` → `flex-direction: column; padding: 0; overflow: hidden`
- `.recipes-page .rcard-recipe-thumb` → `width: 100%; height: 110px; overflow: hidden` (scoped, n'affecte pas le picker de repas)
- `.recipes-page .rcard-recipe-info` → padding interne `8px 10px 10px`
- `.recipes-page .rcard-recipe-name` → 2 lignes max (`-webkit-line-clamp: 2`)

---

## [2026-05-15] — Fix scroll fiches recettes : ingrédients et condiments

`src/styles.css` — 5 ajouts `flex-shrink: 0` + onglets sticky.

**Problème** : `.recipe-sheet-body` est un flex-column avec `overflow-y: auto`. Le flex engine rétrécissait les enfants (flex-shrink par défaut = 1) pour qu'ils rentrent dans la hauteur disponible, au lieu de faire scroller le body. Le panel ingrédients se faisait clipper par `overflow: hidden`.

| Sélecteur | Changement |
|-----------|------------|
| `.recipe-sheet-hero.mrd-meal-card` | `flex-shrink: 0` |
| `.recipe-sheet .mrd-subtabs.recipe-sheet-tabs` | `flex-shrink: 0` + `position: sticky; top: 0; z-index: 2; background: var(--mrd-bg)` |
| `.recipe-sheet-panel-ingredients` | `flex-shrink: 0` |
| `.recipe-sheet-panel-method` | `flex-shrink: 0` |
| `.recipe-sheet-footer` | `flex-shrink: 0` |

**Résultat** : les panels ne se compriment plus → le body force le scroll → les tabs restent visibles (sticky) pendant le défilement.

---

## [2026-05-13] — Note : codes d'invitation legacy (8 chars)

Codes d'invitation legacy (8 chars) générés par une version antérieure — affichage `xxx-xxxxx` normal pour ces anciens codes. Nouveaux codes générés correctement en 6 chars (`xxx-xxx`). Solution : régénérer l'invitation via les Réglages pour obtenir un code propre.

Aucune modification de code effectuée — `randomCode(6)` génère déjà 6 chars correctement.

---

## [2026-05-13] — Format codes d'invitation : xxx-xxx unifié

5 modifications pour uniformiser l'affichage et la robustesse des codes d'invitation au format `ABC-123`.

| Fichier | Ligne | Changement |
|---------|-------|------------|
| `FamilyPanel.js` | 144 | Affichage de `inviteCode` avec tiret (`slice+"-"+slice`) |
| `SettingsView.js` | 983 | Placeholder `"Code d'invitation"` → `"ABC-123"` |
| `FamilyPanel.js` | 133 | Placeholder `"Code d'invitation"` → `"ABC-123"` |
| `OnboardingFlow.js` | 193 | Séparateur em dash `—` → tiret standard `-` |
| `useAuth.js` | 628 | Ajout de `.replace(/-/g, "")` à la normalisation du code |

---

## [2026-05-13] — Suppression de src/components/Tabs.js

Composant `Tabs.js` supprimé — ancien système de navigation v1, remplacé par `BottomNav` + `SegmentedTabs`, aucun import actif dans le projet.

---

## [2026-05-13] — Nettoyage styles.css round 2 : suppressions chirurgicales + variables CSS

`src/styles.css` : 74 lignes supplémentaires supprimées (6 181 → 6 107).

| Zone | Détail | Lignes |
|------|--------|--------|
| `--primary-color` HEX fallback | Doublon, version oklch conservée | 1 |
| `--surface3 / --text-secondary / --text-muted / --border-soft` | Variables définies mais jamais utilisées via `var()`, supprimées dans `:root` et dark mode | 8 |
| `calendar-month-grid/slot/head/day/count/list/item/more` | 11 règles de la vue mois (non utilisées — seule `calendar-slot-body` est vivante) | 11 |
| `recipes-advanced-*` (toggle, badge, chevron, panel) + commentaires | Bloc de filtres avancés recettes supprimé | 22 |
| `inv-tab-bar / inv-tabs / inv-tab / inv-tab-gear / inv-locmgmt / inv-loc-* / inv-ranger-*` | Chirurgie dans le bloc inv-* : inv-organiser-* et inv-selected-heading-* CONSERVÉS (vivants) | 25 |
| `ob-chip-group / ob-help-btn / ob-field-label-row / ob-tooltip / ob-tooltip-p` | Anciens composants onboarding | 7 |

**Faux positifs de l'audit écartés** (classes encore vivantes) :
- `lists-page-*` : 42 classes dans ListsView.js
- `mrd-home-meal-*` : 17 classes dans HomeView.js
- `meal-slot / hdr-* / tabs-w / .tab` : encore utilisés dans MealsView.js et AgendaView.js
- `settings-page / settings-card / settings-row` : utilisés dans SettingsView.js et MealsView.js
- `onboarding-*` : utilisés dans OnboardingFlow.js et SettingsSupportPage.js

---

## [2026-05-13] — Nettoyage styles.css : suppression de 3 blocs CSS morts

`src/styles.css` allégé de 386 lignes. Trois blocs de CSS mort supprimés.

| Bloc | Classes | Lignes supprimées | Lignes avant → après |
|------|---------|-------------------|----------------------|
| initial-members-* | Ancien écran onboarding membres (jamais utilisé) | 157 | 6 567 → 6 410 |
| psetup-* | Ancien wizard de profil (jamais utilisé) | 139 | 6 410 → 6 271 |
| mrd-onb-* | Ancien overlay "première tâche" (jamais utilisé) | 90 | 6 271 → 6 181 |

**Blocs non supprimés (faux positifs de l'audit) :**
- `onboarding-*` (L.4640–4742) : massivement utilisé dans `OnboardingFlow.js` et `SettingsSupportPage.js` — grep l'a confirmé.
- `settings-page v1` (L.1200–1279) : activement utilisé dans `SettingsView.js` et `MealsView.js` — grep l'a confirmé.

**Total final : 6 181 lignes** (−386 vs. 6 567 au départ de la session).

---

## [2026-05-13] — Refactoring firebase/client.js : découpage en 6 sous-modules + façade

`firebase/client.js` (1 220 lignes) découpé en 7 fichiers. Le fichier `client.js` devient une façade qui re-exporte tout — aucun consommateur de l'app n'a besoin de changer ses imports.

| Fichier | Lignes | Contenu |
|---------|--------|---------|
| `firebase/core.js` | 108 | Init Firebase (app, auth, db, googleProvider) + utilitaires (randomCode, colorForUser…) + formatage erreurs |
| `firebase/clientAuth.js` | 227 | Authentification : Google, email, session, mot de passe, réauthentification |
| `firebase/clientFamily.js` | 722 | Foyer, membres, personnes, invitations, quitter/supprimer un compte |
| `firebase/clientPlanner.js` | 34 | Synchro planner Firestore (watch + save) |
| `firebase/clientMessaging.js` | 113 | Tokens FCM push (deux chemins : devices/ et messagingTokens/) |
| `firebase/clientSupport.js` | 57 | Bug reports, suggestions, feedback testeurs |
| `firebase/client.js` (façade) | 19 | Re-exporte tout avec `export * from` |

Graphe de dépendances : `core.js ← clientAuth.js ← clientFamily.js` ; les autres sous-modules importent uniquement de `core.js`. Zéro dépendance circulaire.

---

## [2026-05-13] — Refactoring SettingsView.js : découpage en 4 fichiers

SettingsView.js est passé de ~82K (≈ 2000+ lignes) à 1 207 lignes par extraction de 4 responsabilités distinctes :
- `src/components/settings/SettingsUI.js` (187 lignes) — constantes (BADGE_PALETTE, EMPTY_PERSON), utilitaires (calcAge, getNotificationPermissionState…) et composants UI partagés (SectionCard, SettingsRow, SettingsSwitch, ColorGrid, etc.)
- `src/components/settings/SettingsLegal.js` (160 lignes) — données statiques TERMS_SECTIONS et composant PrivacyPolicyPage (politique de confidentialité en 14 sections)
- `src/components/settings/SettingsModals.js` (216 lignes) — 3 modals extraits : EditMemberModal, AddPersonModal (avec son propre état interne), NewMemberInviteModal
- `src/components/settings/SettingsSupportPage.js` (128 lignes) — page support/légal avec gestion du formulaire (état, envoi Firebase), contact, politique de confidentialité et CGU

Aucune logique modifiée, seulement déplacée. Tous les imports mis à jour dans SettingsView.js. La variable `termsSections` inline remplacée par l'import `TERMS_SECTIONS`. Le composant `SettingsSupportPage` utilise `key=${supportPage}` pour réinitialiser son état à chaque changement de page.

---

## [2026-05-13] — Refactoring App.js : découpage en 4 fichiers

App.js est passé de ~1500 à ~1277 lignes par extraction de 4 responsabilités distinctes :
- `src/utils/units.js` (72 lignes) — conversion d'unités, parsing de quantités, matching produits
- `src/utils/personStorage.js` (49 lignes) — lecture/écriture localStorage pour personne active et mode appareil
- `src/components/modals/AppModals.js` (136 lignes) — 4 modals extraits : ProfileModal, NotifPromptModal, InviteCodesModal, HouseholdWelcomeModal
- `src/hooks/useAppRouting.js` (53 lignes) — logique de routage (needsFamilySetup, profileGuardActive, route-debug)

Aucune logique modifiée, seulement déplacée. Tous les imports mis à jour dans App.js.

---

## [2026-05-13] — Nettoyage structure du projet

Audit et nettoyage des fichiers parasites à la racine :
- Supprimé `server.err.log` et `server.out.log` (résidus serveur de dev)
- Supprimé `firebase-messaging-sw.js` à la racine (doublon de `public/firebase-messaging-sw.js`)
- Créé `docs/` et déplacé : `PROJECT_LOG.md`, `ARCHITECTURE.md`, `PROJECT_MAP.md`, `DEV_NOTES.md`, `AGENT.md`

---

## [2026-05-09] — Correction "erreur script" Safari share sheet

### Problème

En PWA iOS, appuyer sur le bouton Partager natif de Safari déclenchait l'overlay "Erreur visible" avec le message "Script error.". L'overlay rendait l'app inutilisable jusqu'au rechargement.

### Cause

Quand la fiche de partage iOS s'ouvre, le navigateur déclenche des événements (visibilitychange / focus) qui font re-exécuter certains appels Firebase Messaging (importé depuis le CDN `gstatic.com`). Ces appels cross-origin peuvent lancer des exceptions que le navigateur sanitize en `"Script error."` (sans stack, sans objet error). Le handler global `window.addEventListener("error", ...)` dans `main.js` captait ces erreurs cross-origin et appelait `showFatalError` — détruisant l'UI pour une erreur inoffensive et non actionnable.

### Fix appliqué

**`src/main.js`**
- Handler `error` : filtre les erreurs sans objet error dont le message est `"Script error."` (signature d'une erreur cross-origin CDN). Ces erreurs ne peuvent pas être diagnostiquées côté app et ne doivent pas planter l'UI.
- Handler `unhandledrejection` : filtre les rejets Firebase (`code` commençant par `messaging/` ou `name === "FirebaseError"`) — non fatals, déjà loggés dans `messaging.js`.

**`index.html`**
- Version de `main.js` bumped → `v=2026-05-09-safari-share-fix-1`

---

## [2026-05-08] — Correction système d'invitation (Bug critique : aucun code créé pendant l'onboarding)

### Problèmes corrigés

**Bug 1 (Critique) — `inviteSelected` ignoré → aucune invitation créée pendant l'onboarding CREATE**

`handleCreateHouseholdOnboarding` ne lisait pas `payload.inviteSelected`. Tous les profils avaient `hasAccount: false` (valeur par défaut de `handleAddProfile`). `normalizeOnboardingProfiles` produisait donc `hasAccount: false` pour tous, et `createHouseholdInvitation` n'était jamais appelé. Résultat : la modale "Codes d'invitation" post-onboarding était toujours vide.

**Bug 2 (Critique) — `makeInviteCode` affichait des codes inutilisables**

L'étape `create-invite-members` montrait des codes générés par un hash déterministe (`makeInviteCode`), jamais stockés en Firestore. L'admin les partageait → les membres obtenaient "Invitation introuvable". Ces codes avaient aussi un format différent (7 chars `XXX-XXX`) des vrais codes (6 chars).

**Bug 3 (Mineur) — Format code incohérent dans la liste membres Settings**

La liste des membres (sous-page Foyer) affichait `· code X7K2M9` sans tiret, alors que partout ailleurs les codes sont formatés `XXX-XXX`.

### Fichiers modifiés

**`src/components/auth/OnboardingFlow.js`**
- Suppression de `makeInviteCode` (fonction entièrement retirée)
- `InviteMembersStep` : remplacement de l'affichage du faux code par "Recevra un code"
- Sous-titre de l'étape corrigé : "Un code leur sera attribué à la création du foyer"
- Hint de bas de page corrigé : "Les codes seront affichés après la création du foyer"
- `handleNext` sur `create-invite-members` : `inviteSelected` → `selectedSet` → `markedProfiles` avec `hasAccount: true` pour les profils sélectionnés

**`src/components/settings/SettingsView.js`**
- Liste membres : `· code X7K2M9` → `· X7K-2M9` (format uniforme `XXX-XXX`)

**`src/App.js`**
- Version strings mis à jour : `OnboardingFlow.js?v=2026-05-08-invite-fix-1`, `SettingsView.js?v=2026-05-08-invite-fix-1`

### Source unique de vérité

`createHouseholdInvitation()` dans `client.js` est désormais le seul point de génération de codes. `makeInviteCode` est supprimé.

---

## [2026-05-08] — Audit complet du projet + mise à jour documentation

### Périmètre

Audit exhaustif du code source sans modification de logique métier. Lecture de tous les fichiers source, comparaison avec la documentation existante, identification des incohérences, mises à jour documentaires.

### Découvertes

**Fichiers jamais documentés :**
- `functions/index.js` (508 lignes) — Cloud Functions backend : notifications planifiées (5 min), gestion tokens FCM multi-appareils, anti-spam via `serverNotificationLog`
- `src/hooks/usePushMessaging.js` — enregistrement token FCM côté client
- `src/hooks/useTaskNotifications.js` — notifications locales (browser Notification API)
- `src/components/auth/OnboardingFlow.js` — flux onboarding complet (3 modes : CREATE, JOIN, EXISTING-PROFILE)
- `src/components/recipes/CategoryIcons.js`
- `src/components/feedback/FeedbackWidget.js`
- `src/firebase/messaging.js`
- `src/assets/`

**Collections Firestore non documentées :**
- `users/{uid}/messagingTokens/{tokenDocId}` — tokens FCM par navigateur
- `families/{familyId}/members/{uid}/devices/{deviceId}` — token FCM par appareil physique
- `families/{familyId}/serverNotificationLog/{key}` — anti-spam push (écriture CF seulement)
- `families/{familyId}/joinEvents/{eventId}` — log d'audit rejoindre foyer (écriture CF seulement)
- `bug_reports/{id}`, `feature_requests/{id}`, `tester_feedback/{id}` — feedback utilisateurs

**Fichiers morts confirmés :**
- `src/components/family/FamilyPanel.js` — jamais importé, remplacé par SettingsView
- `src/components/Tabs.js` — jamais importé, remplacé par SegmentedTabs

**Doublon confirmé :**
- `joinFamily()` dans `client.js` est un alias pur de `acceptHouseholdInvitation()` — fonction redondante

**Logique métier mal placée :**
- `App.js` contient des helpers de conversion quantité/unité et `computeMealCookState` qui appartiendraient à des hooks/utils

### Tests E2E

- Flux création profil : 23 tests / 23 passants (17 logique pure + 5 CDP browser)
- Approche : fichier `e2e-onboarding.html` temporaire à la racine (import map → stubs Firebase)
- Stub Firestore corrigé : ajout de `collectionGroup` manquant
- Stub Auth corrigé : ajout de `reauthenticateWithPopup` et `updateProfile` manquants

### Documentation mise à jour

**`PROJECT_MAP.md`** — réécrit intégralement :
- Tous les fichiers source (y compris non documentés)
- Section "FICHIERS MORTS"
- Structure complète des tests et fixtures

**`ARCHITECTURE.md`** — réécrit intégralement :
- Toutes les collections Firestore (tableau complet)
- Séquence de boot détaillée (`bootLoading`, `profileGuardActive`)
- Flux Auth complet incluant le cas iOS PWA
- Étapes OnboardingFlow (3 modes)
- Cloud Functions
- Deux systèmes de push (local + server FCM)
- Règle version string `?v=...`
- localStorage keys

**`DEV_NOTES.md`** — mis à jour avec :
- Piège iOS PWA standalone (`signInWithPopup` bloqué)
- Piège input contrôlé Preact (simuler typing ne marche pas)
- Règle version string (un seul `?v=` par fichier pour tous les importeurs)
- Fichiers morts (FamilyPanel, Tabs)
- Notes infrastructure E2E (stub HTML temporaire, EBUSY cleanup)
- Cloud Functions documentées

### Fichiers modifiés

- `PROJECT_MAP.md`
- `ARCHITECTURE.md`
- `DEV_NOTES.md`
- `PROJECT_LOG.md` (cette entrée)
- `tests/fixtures/firebase-stubs/firebase-firestore.js` (export `collectionGroup` ajouté)
- `tests/fixtures/firebase-stubs/firebase-auth.js` (exports `reauthenticateWithPopup`, `updateProfile` ajoutés)
- `tests/e2e/profile-creation.test.js` (23 tests passants, approche fichier HTML)

---

## [2026-05-07] — Navigation sous-pages Réglages : bouton unique, suppression petits retours

### Comportement voulu
- Page principale Réglages : bouton ‹ Réglages → revient à l'accueil
- Sous-page (Foyer, Apparence, Notifications…) : bouton ‹ Réglages → revient à la liste Réglages
- Plus de petit bouton "‹ Réglages" dans le header de chaque sous-page

### Fichiers modifiés

**`src/components/settings/SettingsView.js`**
- `settingsPage` n'est plus un état interne — devient prop reçue depuis App.js.
- Nouvelle prop `onSettingsPageChange` (callback, même pattern que `onSupportPageChange`).
- `goSettingsPage()` appelle `onSettingsPageChange()` au lieu de `setSettingsPage()`.
- `SubPageHeader` : suppression du bouton `‹ Réglages`. Remplacement par un `<span className="settings-subpage-spacer">` des deux côtés pour garder le titre centré.
- Tous les attributs `onBack` retirés des appels `<SubPageHeader />`.

**`src/App.js`**
- Nouveau state `settingsSubPage` (default `"main"`), réinitialisé à `"main"` à la déconnexion.
- Props `settingsPage` et `onSettingsPageChange` passées à `<SettingsView>`.
- Bouton ‹ Réglages du header : si `settingsSubPage !== "main"` → `setSettingsSubPage("main")` ; sinon ferme les réglages.

---

## [2026-05-07] — Connexion Google compatible PWA iOS (signInWithRedirect)

### Problème
En mode standalone PWA iOS, `signInWithPopup` est bloqué (`auth/popup-not-supported`) et l'app affichait "Connexion Google impossible dans ce mode." sans aucun fallback.

### Fichiers modifiés

**`src/firebase/client.js`**
- `signInWithGoogle()` : si `isStandalonePwa()` → `signInWithRedirect` directement (flag `mrd_google_redirect_pending` en localStorage). Sinon → `signInWithPopup` avec fallback redirect élargi à `popup-not-supported` et `web-storage-unsupported`.
- `formatAuthError()` : `auth/popup-not-supported` et `auth/web-storage-unsupported` retournent `""` (redirect déclenché silencieusement). `auth/unauthorized-domain` garde un message d'erreur neutre.

### Aucun changement dans useAuth.js
L'infrastructure `getRedirectResult()` + flag localStorage + `heldNullAuthState` était déjà en place pour gérer le retour OAuth après redirect.

---

## [2026-05-07] — Gestion FCM tokens par appareil (devices subcollection)

### Objectif
Enregistrer chaque appareil connecté dans `families/{familyId}/members/{uid}/devices/{deviceId}` avec token FCM, statut, platform, userAgent, timestamps.

### Fichiers modifiés

**`src/firebase/client.js`**
- `getOrCreateDeviceId()` (privée) : génère un ID stable par appareil dans localStorage (`mrd-device-id`).
- `registerFcmDeviceToken({ uid, familyId, token })` (exportée) : écrit dans la subcollection `devices/{deviceId}`. Utilise `getDoc` pour distinguer création (setDoc + `createdAt`) et mise à jour (updateDoc sans `createdAt`).

**`src/hooks/usePushMessaging.js`**
- Import de `registerFcmDeviceToken`.
- `persistToken()` appelle maintenant aussi `registerFcmDeviceToken()` quand `familyId` est disponible.

**`src/components/settings/SettingsView.js`**
- Remplacement du bouton `notification-status-line` par un `SettingsToggleRow` "Cet appareil" dans la sous-page Notifications.
- Toggle ON → appelle `onRequestPushPermission()` directement (ou modal si "denied").
- Toggle OFF (quand déjà granted) → modal explicatif (modifier les réglages du navigateur).
- Modal mis à jour pour gérer le cas "granted" (instructions pour désactiver) en plus du cas "denied".

---

## [2026-05-07] — Fond d'écran page connexion appliqué à la page Réglages

### Fichiers modifiés

**`src/App.js`**
- Ajout de la classe `cnt--settings` sur le wrapper `cnt` qui contient `SettingsView`.

**`src/styles.css`**
- `.cnt--settings` : `padding: 0; background: #F7F2EC` (même fond que la page de connexion).
- `.mrd-set-page` : ajout de `background: #F7F2EC`.
- Dark mode : `.cnt--settings` et `.mrd-set-page` → `background: #100E0C`.

---

## [2026-05-07] — Fix modal notifications inaccessible depuis sous-page Réglages

### Cause racine
Dans `SettingsView.js`, `renderSettingsSubPage()` retourne tôt quand `settingsPage === "notifications"`. Le modal `showNotificationModal` était rendu après ce return, dans le bloc principal — donc jamais affiché quand l'utilisateur est dans la sous-page notifications.

### Fichiers modifiés

**`src/components/settings/SettingsView.js`**
- Ajout du modal `notification-modal-backdrop` à l'intérieur du bloc `settingsPage === "notifications"` de `renderSettingsSubPage()`.
- Cas "denied" : affiche un message explicatif invitant à aller dans les réglages de l'appareil/navigateur plutôt que le bouton "Autoriser" (qui ne fonctionnerait pas).

---

## [2026-05-07] — Fix flash "Créer/Rejoindre un foyer" + logs [route-debug]

### Cause racine
`watchUserProfile` pouvait firer une première fois avec `fromCache=true` et un profil qui contenait `familyIds: []` (cache Firestore périmé). Cela avançait `profileFetched=true` immédiatement, ce qui faisait `familiesReady=true` (aucune famille à charger), `bootLoading=false`, et donc `needsFamilySetup=true` le temps d'1 frame → flash de l'écran "Créer un foyer / Rejoindre un foyer" avant l'accueil.

### Fichiers modifiés

**`src/firebase/client.js`**
- `watchUserProfile` : passe `snapshot.metadata.fromCache` en 2e argument du callback (même pattern que `watchFamilyPeople`).

**`src/hooks/useAuth.js`**
- `watchUserProfile` callback : `setUserProfile(profile)` s'exécute toujours (pour afficher le cache rapidement). Mais `setProfileFetched(true)` et `setStartupStage("ready")` ne s'exécutent que si `!fromCache` — on attend la confirmation serveur avant d'avancer la machine à états.
- `currentFamily` : sémantique stricte `undefined`/`null`/objet. `undefined` = en cours de chargement (familles pas encore fetchées ou profil pas prêt) ; `null` = définitivement aucune famille ; objet = famille trouvée.
- `bootLoading` : simplifié grâce à `currentFamily === undefined` (plus besoin de vérifier séparément `familiesReady` et `userProfile`).
- Ajout d'un `useEffect` `[route-debug]` qui logue en console chaque changement d'état de routage : `authReady`, `user`, `profileFetched`, `userProfile`, `familiesReady`, `currentFamilyId`, `currentFamily`, `peopleBootstrapped`, `people`, `bootLoading`.

**`src/App.js`**
- Ajout d'un `useEffect` `[route-debug]` qui logue `selectedScreen` (loading/auth/onboarding/home) à chaque changement de décision de route.

---

## [2026-05-07] — Suppression des logs auth en double + méta PWA

### Diagnostic
Il n'existait pas plusieurs listeners `onAuthStateChanged` — un seul appel dans `client.js/watchAuth`. Le F12 montrait 3 lignes par événement car :
1. `watchAuth` loggait lui-même `[auth] onAuthStateChanged`
2. `bootLog` loggait `[startup] auth-state` via `console.log`
3. `bootLog` appelait aussi `window.__pushBootLog` qui reloggait `[boot] auth-state`

### Fichiers modifiés

**`src/firebase/client.js`**
- `watchAuth` : suppression du `console.log` interne — le log est géré par l'appelant (`useAuth.js`). `watchAuth` est maintenant un thin wrapper pur : `return onAuthStateChanged(auth, callback)`.

**`src/hooks/useAuth.js`**
- `bootLog` : suppression du `console.log("[startup]", ...)` redondant. La fonction utilise maintenant `window.__pushBootLog` en priorité (qui logue déjà dans la console avec le préfixe `[boot]`), avec fallback `[startup]` si le script index.html n'est pas présent.
- Résultat : 1 ligne de console par événement de démarrage, au lieu de 3.

**`index.html`**
- Ajout de `<meta name="mobile-web-app-capable" content="yes">` (supprime le warning DevTools).
- Remplacement du `#C4607A` hardcodé dans le bouton `renderBootstrapError` par `#B85F4A`.

---

## [2026-05-07] — Couleur primaire + animaux sans accès admin

### Fichiers modifiés

**`src/styles.css`**
- Ajout de `--primary-color: oklch(0.58 0.13 28)` en variable CSS globale (avec fallback HEX `#B85F4A`).
- `--mrd-a` pointe maintenant sur `var(--primary-color)` — un seul endroit à changer.
- Remplacement de tous les `#C4607A` hardcodés (9 occurrences) par `var(--primary-color)`.
- Remplacement de `rgba(196, 96, 122, 0.14)` par `oklch(58% 0.13 28 / 0.14)` (focus inputs/textarea).
- Remplacement de `rgba(196, 96, 122, 0.38)` par `oklch(58% 0.13 28 / 0.38)` (ombre nav mobile).

**`src/components/settings/SettingsView.js`**
- Boutons "Mettre en admin" / "Retirer le rôle admin" maintenant conditionnés à `editModalPerson.type !== "animal"` → les animaux ne peuvent pas être mis en admin.

---

## [2026-05-07] — Refonte logique de démarrage : bootLoading centralisé, zéro flash

### Problème
Flash au démarrage : SplashScreen → chargement × 2 → "création de profil" (fraction de seconde) → écran blanc → accueil.

### Cause racine
Firestore `onSnapshot` pour les `people` du foyer tire d'abord depuis le **cache local** (`fromCache = true`). Ce snapshot peut être vide ou sans le champ `linkedAccountId`, ce qui rendait `linkedPerson = null` et `peopleBootstrapped = true` simultanément → `profileGuardActive = true` → OnboardingFlow s'affichait brièvement.

### Solution
**`src/firebase/client.js`**
- `watchFamilyPeople` passe maintenant `snapshot.metadata.fromCache` (2e argument du callback).

**`src/hooks/useAuth.js`**
- Ajout de `profileFetched` : vrai uniquement après le premier fire de `watchUserProfile`.
- Ajout de `familiesReady` : vrai après résolution de `listFamilies`.
- Dépendance `listFamilies` stabilisée via `familyIdsKey` (string stable) pour éviter un re-run sur chaque snapshot Firestore.
- `peopleBootstrapped` n'est mis à `true` que lorsque `!fromCache` (réponse serveur) → le cache stale ne peut plus provoquer de flash.
- `bootLoading` exporté : seule source de vérité pour décider d'afficher le SplashScreen.
- Reset propre de tous les flags lors du signe-out.

**`src/App.js`**
- Import de `bootLoading` depuis `useAuth()`.
- Arbre de routing unifié : Erreur → `bootLoading` (un seul bloc) → `!user` → `profileGuardActive` → App.
- `needsFamilySetup`, `needsLinkedProfileSetup`, `profileGuardActive` tous gardés par `!bootLoading` pour éviter toute transition prématurée.

---

## [2026-05-07] — Fix double écran de chargement + flash "création de profil"

### Problème
- L'écran de chargement apparaissait deux fois (animation CSS redémarrait) car deux blocs `return <div className="ldr">` distincts existaient dans `App.js` : un pour `!authReady` et un pour `waitingForProfileDoc || waitingForFamilyData`. React les traitait comme des éléments différents à chaque transition.
- La page "création de profil" flashait brièvement parce que `onSnapshot` de Firestore tirait avec un tableau vide (`items = []`) au premier appel (cache miss), ce qui mettait `peopleBootstrapped = true` trop tôt → `waitingForFamilyData = false` → `profileGuardActive = true` → flash onboarding.

### Fichiers modifiés

**`src/hooks/useAuth.js`**
- `watchFamilyPeople` callback : `setPeopleBootstrapped(true)` uniquement si `items.length > 0`, pour ignorer le premier snapshot vide du cache Firestore.

**`src/App.js`**
- Fusionné les deux écrans de chargement en un seul bloc `if (!authReady || waitingForProfileDoc || waitingForFamilyData)`.
- Réorganisation des guards : erreur → `authReady && !user` (auth) → loader unique → onboarding → app.
- Résultat : React garde le même élément DOM tout au long du chargement, l'animation ne redémarre plus.

---

## [2026-05-06] — Onboarding : étape "Qui aura l'app ?" conditionnelle

### Fichiers modifiés

**`src/components/auth/OnboardingFlow.js`**
- `progressSteps` : 4 points si aucun membre ajouté, 5 points si au moins un membre
- `nextLabel()` : affiche "Terminer" à l'étape 4 quand aucun membre ajouté
- `handleNext` sur `create-add-members` : appelle `onCreateHousehold` directement si pas de profils, sinon pousse vers `create-invite-members`
- `AddMembersStep` : accepte `totalSteps` prop — affiche "Étape 4 sur 4" ou "Étape 4 sur 5" selon le nombre de membres

**`src/App.js`** — version import mise à jour

---

## [2026-05-06] — Tâches : suppression des boutons flèches ↑↓

### Fichiers modifiés

**`src/components/tasks/TasksView.js`**
- Suppression du bloc `task-order-actions` (boutons ↑↓) dans `renderTaskCard`
- Le déplacement par appui long (drag & drop) suffit pour réordonner les tâches

**`src/App.js`** — version import mise à jour

---

## [2026-05-06] — Fix : défilement liste ingrédients dans la fiche recette

### Fichiers modifiés

**`src/styles.css`**
- Ajout de `min-height: 0` sur `.mrd-shell .recipe-sheet-body` et `.mrd-recipe-view-sheet .recipe-sheet-body`
- Correction du bug flexbox classique : sans `min-height: 0`, le navigateur considère que la hauteur minimale d'un flex item est égale à sa hauteur de contenu, empêchant `overflow-y: auto` de s'activer. Le parent clippait visuellement mais le scroll ne fonctionnait pas.

---

## [2026-05-06] — Design "Cocon" : refonte auth & onboarding + ajout membres simplifié

### Fichiers modifiés

**`src/components/auth/AuthScreen.js`**
- Écran Bienvenue : nouveau titre serif "Le quotidien / en douceur." avec accent italique coloré, fond dégradé chaud, sous-titre mis à jour
- Login : "Content de te revoir" + logo au-dessus du formulaire, "← Retour"
- Inscription : "Bienvenue chez nous" + logo au-dessus du formulaire

**`src/components/auth/OnboardingFlow.js`** — réécriture complète
- Fond dégradé chaud sur tous les écrans (`.auth-shell`, `.onboarding-shell`)
- Titre serif gauche aligné + kicker accent + sous-titre sur chaque étape
- Préview avatar animée sur les étapes prénom et couleur (grande initiale dans un cercle coloré)
- Étape nom du foyer : chips de suggestion (Chez nous, Famille X, La maison, Notre nid)
- **Ajout de membres** : remplacement du sélecteur "Compte/Sans compte" par 3 onglets simples : 👤 Personne · 🧒 Enfant · 🐾 Animal. Champ prénom + bouton Ajouter. Liste avec badge emoji type.
- Code d'invitation : 6 cases individuelles (3 + tiret + 3) avec gestion clavier/coller. Validation stricte 6 caractères.
- Aperçu foyer (join-confirm) : grande carte avec initial du foyer, sous-titre, liste "Ce que vous partagerez"
- Rejoindre - bienvenue (join-done) : écran célébration 🎉 avec nom du foyer en italique coloré
- Boutons footer : ← petit bouton carré + bouton Suivant pleine largeur
- Progression : points pill animés (actif = 22px, fait = couleur accentuée)

**`src/styles.css`**
- Toutes les nouvelles classes : `.onb-*`, `.auth-welcome-title-cocon`, `.auth-welcome-em`, `.auth-card-illu`
- Dark mode intégré pour chaque nouveau composant

---

## [2026-05-06] — Notification push : nouveau membre via code d'invitation

### Fichiers modifiés

**`src/firebase/client.js`**
- Dans `acceptHouseholdInvitation`, après `batch.commit()` : écriture d'un document dans `families/{familyId}/joinEvents` avec `{ joinerUid, joinerName, memberName, createdAt }`
- En cas d'échec de l'écriture joinEvent, l'erreur est juste loguée (non bloquante pour l'utilisateur)

**`functions/index.js`**
- Import ajouté : `onDocumentCreated` depuis `firebase-functions/v2/firestore`
- Nouveau trigger `exports.onMemberJoined` : déclenché à la création de `families/{familyId}/joinEvents/{eventId}`
  - Récupère tous les membres du foyer sauf le nouveau
  - Envoie une notification FCM : "Nouveau membre 🏠 — [Prénom] a bien rejoint votre foyer via son code d'invitation."
  - Utilise les helpers existants `getFamilyTokens` et `sendToFamily`

### Architecture
- Le client écrit un document Firestore (pas d'appel direct FCM Admin, impossible côté client)
- Le Cloud Function réagit en temps réel via trigger Firestore (latence ~1-3s)

---

## [2026-05-06] — Widget feedback testeur

### Fichiers créés / modifiés

**`src/components/feedback/FeedbackWidget.js`** (nouveau)
- Tab vertical fixe sur le bord droit de l'écran (50% hauteur), couleur rose-terracotta `#C4607A`
- Au clic : modal centré avec textarea "Décris le problème…"
- Envoi vers Firestore collection `tester_feedback` (message, page active, user agent, userId)
- État envoi : idle / sending / done (auto-ferme après 2.2s) / error
- Visible uniquement sur l'écran principal (utilisateur connecté)

**`src/firebase/client.js`**
- Ajout de `sendTesterFeedback({ message, page, userId })` → Firestore `tester_feedback`

**`src/App.js`**
- Import `FeedbackWidget`
- Rendu juste après `.mrd-shell`, passe `user` et `activeTab` comme `currentPage`

**`src/styles.css`**
- Classes `.fb-root`, `.fb-tab`, `.fb-tab-icon`, `.fb-tab-text`, `.fb-backdrop`, `.fb-panel`, `.fb-panel-*`
- Dark mode intégré

---

## [2026-05-06] — Dark mode : correction cascade CSS (auth/onboarding/notification)

### Fichier modifié : `src/styles.css`

**Problème** : les overrides dark mode ajoutés en milieu de fichier (lignes ~4620-4634, ~1405-1409) étaient placés AVANT les règles hardcodées light (`#F7F2EC`, `#FDFAF7`, `#3E2C1C`) du bloc mobile (lignes ~4645-4940), qui les écrasaient dans la cascade CSS.

**Fix** : bloc `/* DARK MODE — surcharges finales */` ajouté à la TOUTE FIN du fichier, qui reprend toutes ces règles dans le bon ordre de cascade :
- Fond `.auth-shell` / `.onboarding-shell` / `.notif-prompt-overlay` → `#100E0C`
- Bouton retour `.auth-back` → `#2B241F / #40362E / #CDB8A5`
- Inputs `.auth-input` / `.onboarding-input` → `#1F1A17 / #4B4037 / #F5EBDD`
- Boutons secondaires (google, onboarding, etc.) → `#2B241F / #40362E`
- Titres `auth-welcome-title`, `onboarding-title`, `notif-prompt-title` → terracotta `oklch(65% 0.13 28)`
- Modal notification push → `#2B241F`, terracotta, `#CDB8A5`

---

## [2026-05-06] — Google Login PWA iOS : fix cascade geste utilisateur

### Fichier modifié : `src/firebase/client.js`

**Problème** : `signInWithGoogle()` faisait `await ensureAuthPersistence()` AVANT d'appeler Firebase, ce qui brisait la chaîne du geste utilisateur. Sur iOS Safari, `window.open()` (utilisé en interne par `signInWithPopup`) est bloqué s'il est appelé après un `await`. De plus, `signInWithRedirect` en mode standalone fait quitter le contexte PWA et le retour OAuth s'ouvre dans Safari — `getRedirectResult()` reçoit toujours `null`.

**Fix** :
- Suppression du `await ensureAuthPersistence()` (déjà appelé au boot dans `useAuth.js`)
- `signInWithPopup` utilisé dans TOUS les cas (y compris standalone), le popup s'ouvre synchroniquement par rapport au geste
- Fallback `signInWithRedirect` uniquement si le popup est explicitement bloqué (`auth/popup-blocked`)

### Fichier modifié : `src/hooks/useAuth.js`
- Import version bumpée → `?v=2026-05-06-pwa-google-fix-2`

---

## [2026-05-06] — Recettes démo : remplacement par 30 recettes de printemps

### Fichiers modifiés

**`src/data/demoRecipes.js`**
- Suppression des 24 recettes démo génériques
- Ajout de 30 recettes de printemps issues du fichier `30_recettes_printemps_avec_preparation.docx`
- Recettes 1–7 : `months: [4, 5]`, Recettes 8–30 : `months: [5]`
- Labels : `"vegetarian"` ou `"vegan"` selon chaque recette
- IDs : `demo-recipe-01` à `demo-recipe-30`

**`src/data/condiments.js`**
- Ajout du condiment `{ id: "ciboulette", label: "Ciboulette" }` (requis par recette 30)

---

## [2026-05-06] — Dark mode : audit complet et corrections

### Fichier modifié : `src/styles.css`

**Corrections ajoutées (blocs `html[data-theme="dark"]`) :**

| Zone | Problème | Fix |
|---|---|---|
| Loader `.ldr` | Fond `#F7F2EC` blanc, texte marron | Fond `#181310`, texte `#F5EBDD` / `#CDB8A5` |
| Note tones 1–5 | oklch(96%…) clairs hardcodés | oklch(22–23%…) sombres correspondants |
| Notification push modal | Fond blanc, titre marron illisible | Fond `#2B241F`, titre terracotta, texte `#CDB8A5` |
| Auth/onboarding fond | `#F7F2EC` / `#100E0C` selon contexte | `#100E0C` uniforme en dark |
| Auth/onboarding inputs | `#FDFAF7` hardcodé | `#1F1A17` / `#4B4037` / `#F5EBDD` |
| Auth-back pill | `#FDFAF7` hardcodé | `#2B241F` / `#40362E` / `#CDB8A5` |
| Support — hero h1 | Marron `#3E2C1C` illisible | Terracotta `oklch(65% 0.13 28)` |
| Support — boutons link | `#FDFAF7` / `#EDE5D8` / `#3E2C1C` | `#2B241F` / `#40362E` / `#F5EBDD` |
| Support — form card | `#FDFAF7` / `#EDE5D8` | `#2B241F` / `#40362E` |
| Support — inputs | `#FCF8F4` / `#E7DDCF` / `#3E2C1C` | `#1F1A17` / `#4B4037` / `#F5EBDD` |
| Support — contact label/lien | Marron hardcodé | `#9A8170` / `oklch(65% 0.13 28)` |
| Support — légal textes | `#6F5743` / `#3E2C1C` hardcodés | `#CDB8A5` / terracotta |
| Support — légal h2 | Marron illisible | Terracotta `oklch(65% 0.13 28)` |
| initial-members | Aucun dark | Fond `#181310`, cartes `#2B241F`, titres terracotta |

### Fichier modifié : `src/components/settings/SettingsView.js`
- Email support corrigé : `support@myrollingday.com` → `contact@bohemianrollinghouse.fr`
- Import version bumpée → `?v=2026-05-06-dark-mode-email-1`

---

## [2026-05-06] — Politique de confidentialité complète (14 articles)

### Fichiers modifiés
**`src/components/settings/SettingsView.js`**
- Suppression de `privacySections` (4 lignes placeholder)
- Ajout du composant `PrivacyPolicyPage` (14 sections, listes à puces, liens mailto, sous-titres h3)
- Remplacement de `<LegalTextPage sections=${privacySections} />` par `<${PrivacyPolicyPage} />` pour `supportPage === "privacy"`

**`src/styles.css`**
- `.support-legal-subh` : sous-titres h3 dans les sections légales
- `.support-legal-list` / `.support-legal-list li` : listes à puces cohérentes avec le style existant
- `.support-legal-link` : liens mailto avec couleur accent et underline

**`src/App.js`**
- Import SettingsView bumped → `?v=2026-05-06-privacy-policy-1`

### Contenu
Responsable : Bohemian Rolling House — SIRET 89899821600045 — Myendin Cachar
Contact : contact@bohemianrollinghouse.fr
14 articles couvrant : présentation, données collectées, notes privées, foyers partagés,
hébergement Firebase, notifications, photos, stats anonymes, pas de pub, suppression,
sécurité, mineurs, évolution bêta, contact.

---

## [2026-05-06] — Modal codes d'invitation : passage aux classes modal standard

### Problème
Le modal "Codes d'invitation" (post-onboarding) utilisait les classes `notif-prompt-*`
pensées pour la notification push — mauvais look, pas cohérent avec les autres modals.

### Fix
**`src/App.js`** — bloc `postOnboardingState === "invite-codes"` :
- Overlay : `notif-prompt-overlay` → `modal-backdrop` (ferme au clic sur fond)
- Carte : `notif-prompt-card` → `modal-card task-modal-redesign` (width: min(400px, 100%))
- En-tête : `mrd-mhd` + `mrd-mtitle` "Codes d'invitation" + `mrd-mclose` ✕
- Corps : `mrd-mbody` avec texte explicatif, liste `.invite-codes-list`, bouton "Fermer" `.aok`
- Suppression : icône `notif-prompt-icon`, `notif-prompt-btn-primary/secondary`

---

## [2026-05-06] — CSS tooltip/help-btn pour étape AddMembers (onboarding)

### Contexte
L'étape 4 du wizard (AddMembersStep) utilise des boutons `?` et des tooltips inline.
Les classes CSS correspondantes n'avaient pas encore été ajoutées.

### Fichier modifié
**`src/styles.css`** — ajout après `.onboarding-empty-state` :
- `.ob-chip-group` : flex inline pour chip + bouton `?`
- `.ob-help-btn` : bouton circulaire 18 px, discret, avec hover/focus-visible
- `.ob-field-label-row` : flex row label + `?` pour le champ Rôle
- `.ob-tooltip` : bloc d'info contextuel (fond surf2, bordure, coins arrondis)
- `.ob-tooltip-p` : paragraphes internes du tooltip Rôle

---

## [2026-05-06] — Fix connexion Google PWA iOS : page de login après redirect

### Problème
En mode PWA iOS (ajoutée à l'écran d'accueil), après la connexion Google via `signInWithRedirect` :
- L'app revenait sur la page de connexion au lieu d'ouvrir l'application.

### Diagnostic
Au redémarrage après le redirect OAuth, Firebase SDK doit appeler le serveur Google pour
échanger le code d'autorisation → c'est async. Pendant ce temps, `onAuthStateChanged`
fire une première fois avec `null` (état inconnu). L'ancien code répondait à ce `null`
en mettant `authReady = true` et affichant la page de login. Quand Firebase finissait
enfin de traiter le redirect et fire l'utilisateur, la page de login était déjà visible et,
selon les cas, le changement d'état ne provoquait pas de re-render suffisant.

### Fix

**`src/firebase/client.js`**
- `signInWithGoogle()` (branche standalone) : avant `signInWithRedirect`, stocke
  `localStorage.setItem("mrd_google_redirect_pending", "1")`.
  Si l'exception survient avant la navigation, le flag est retiré immédiatement.

**`src/hooks/useAuth.js`**
- Import ajouté : `ensureAuthPersistence`
- Au démarrage, lit le flag `mrd_google_redirect_pending`
- Si le flag est présent :
  - Timeout de secours : 20 s au lieu de 4 s
  - Si `onAuthStateChanged` fire `null` avant que `getRedirectResult` se règle :
    → état "tenu" (`heldNullAuthState = true`), on n'appelle pas `setAuthReady(true)`
- `getRedirectResult` gère la fin du redirect :
  - Succès avec `user` → `onAuthStateChanged` va fire → rien à faire ici
  - Succès sans `user` ou erreur + état tenu → `applySignedOutState()` → page login
- `ensureAuthPersistence()` appelé au démarrage (avant `getRedirectResult`) pour
  garantir `browserLocalPersistence` dès le chargement initial

### Flux corrigé en PWA iOS
1. Clic "Continuer avec Google" → flag stocké → `signInWithRedirect()`
2. Navigation vers Google OAuth → utilisateur choisit son compte
3. Retour sur l'app (rechargement complet) → flag présent
4. Affichage : splash screen (authReady = false)
5. `onAuthStateChanged(null)` → tenu, pas de page login
6. `getRedirectResult` traite le code → success
7. `onAuthStateChanged(user)` → `setUser(user)` → `setAuthReady(true)` → app ouverte

### Fichiers modifiés
- `src/firebase/client.js`
- `src/hooks/useAuth.js`
- `src/App.js` (version bump imports)

---

---

## [2026-05-06] — Onboarding création de foyer : ajout des membres intégré + notifications post-onboarding

### Objectif
Intégrer l'étape "Ajouter les membres" directement dans le flow wizard de création de foyer (étape 4/4),
supprimer l'écran intermédiaire `InitialMembersOnboarding`, et déplacer la demande de notifications
après l'arrivée sur la page d'accueil (jamais pendant l'onboarding).

### Ce que j'ai fait

**`src/components/auth/OnboardingFlow.js`**
- `CREATE_STEPS` : ajout de `"create-add-members"` → 4 étapes au lieu de 3
- Étape 3 `create-household-name` : le bouton "Suivant" va maintenant à `create-add-members`
  (au lieu d'appeler directement `onCreateHousehold`)
- Nouvelle étape 4 `create-add-members` via le composant `AddMembersStep` :
  - Choix "Sans compte" / "Avec compte" en premier
  - "Sans compte" → prénom + type (Enfant / Animal / Autre), pas de couleur
  - "Avec compte" → prénom + rôle (Standard / Admin), pas de couleur
  - Bouton "Ajouter", liste des membres ajoutés en bas
  - Bouton "Terminer" (footer) appelle `onCreateHousehold(payload)` avec tous les membres
- Suppression de `withNotifyPrompt`, `handleNotifyActivate`, `handleNotifyLater`, `showNotifyPrompt`,
  `pendingCallRef`, `onRequestNotificationsPermission` — les notifications ne sont plus gérées ici
- Suppression du modal notifications intégré dans le wizard
- `mapProfileTypeLabel` conservé pour affichage dans la liste des membres ajoutés
- `useRef` supprimé des imports (plus utilisé)

**`src/hooks/useAuth.js`**
- `handleCreateHouseholdOnboarding` : collecte maintenant les codes d'invitation créés pour les
  membres "avec compte" et les retourne dans `result.invitations: [{ firstName, code }]`
- Import version : `?v=2026-05-06-onboarding-members-1`

**`src/App.js`**
- Suppression du composant `InitialMembersOnboarding` et de son écran de rendu
- Suppression de `showInitialMembersOnboarding` state
- Callback `onCreateHousehold` : capture `result.invitations`, stocke les codes dans
  `postOnboardingInviteCodes`, puis décide du prochain état post-onboarding
- Suppression de `onRequestNotificationsPermission` dans les props de `OnboardingFlow`
- Nouveaux états : `postOnboardingState` (null | "notify" | "invite-codes"), `postOnboardingInviteCodes`
- Modal notifications (post-onboarding) : affiché sur la page d'accueil après l'onboarding
  → "Activer" → `requestPushPermission()` → puis codes si présents
  → "Plus tard" → sauvegarde le flag, puis codes si présents
- Modal codes d'invitation : affiché après le modal notifications si des membres "avec compte" ont été ajoutés
  → affiche prénom + code pour chaque membre
  → texte gris : "Vous retrouverez les codes dans les réglages de votre application."

**`src/styles.css`**
- Ajout de `.invite-codes-list`, `.invite-code-row`, `.invite-code-name`, `.invite-code-value`, `.invite-code-hint`

### Flux complet création foyer
1. Prénom du créateur → 2. Couleur/badge → 3. Nom du foyer → 4. Ajouter membres
5. Clic "Terminer" → création Firebase (household + profils + invitations)
6. Arrivée page d'accueil → modal notifications
7. Si membres "avec compte" → modal codes d'invitation

### Fichiers modifiés
- `src/components/auth/OnboardingFlow.js`
- `src/hooks/useAuth.js`
- `src/App.js`
- `src/styles.css`

---

> Lire ce fichier avant toute modification. Ne jamais casser une logique existante.

---

## [2026-05-06] — Google Auth PWA iOS : signInWithRedirect + getRedirectResult au démarrage

### Problème corrigé
En mode PWA iOS standalone, `signInWithPopup` utilise `window.open()` que Safari bloque
silencieusement. La promesse ne se résolvait jamais → `busy` bloqué indéfiniment.
La session précédente avait corrigé le freeze avec un timeout + une notice bloquante.
Cette passe va plus loin : Google Auth fonctionne réellement en PWA via redirect.

### Ce que j'ai fait

**`src/firebase/client.js`**
- `isStandalonePwa()` : détecte `navigator.standalone === true` **ou** `matchMedia display-mode:standalone`
- `signInWithGoogle()` : branche automatiquement sur `signInWithRedirect` (standalone) ou `signInWithPopup` (navigateur)
- `getGoogleRedirectResult()` : exporté pour être appelé au démarrage — récupère le résultat après retour de Google OAuth
- `formatAuthError` : ajout de `auth/unauthorized-domain` → message "Connexion Google impossible..."
- `auth/redirect-cancelled-by-user` → chaîne vide (annulation silencieuse)

**`src/hooks/useAuth.js`**
- `getGoogleRedirectResult()` appelé au montage, dans le même `useEffect` que `watchAuth`
- Si erreur (sauf annulation) : `setAuthError(formatAuthError(error))`
- Si succès : `onAuthStateChanged` se déclenche automatiquement avec le nouvel utilisateur
- Import version bumped : `?v=2026-05-06-google-redirect-2`

**`src/components/auth/AuthScreen.js`**
- Suppression de `IS_STANDALONE` (constante module-level) et de toutes les branches conditionnelles
- Le bouton Google est affiché identiquement dans les 3 pages (welcome / login / signup)
- En standalone → `signInWithGoogle()` déclenche un redirect ; l'UX est transparente
- Si le redirect échoue → `authError` affiché normalement via `visibleError`

### Flux complet en PWA iOS
1. Utilisateur clique "Continuer avec Google"
2. `signInWithGoogle()` détecte standalone → appelle `signInWithRedirect()`
3. Safari navigue vers Google OAuth
4. Retour sur l'app (rechargement complet)
5. `getGoogleRedirectResult()` s'exécute au montage → récupère la session
6. `onAuthStateChanged` se déclenche → utilisateur connecté

### Fichiers modifiés
- `src/firebase/client.js`
- `src/hooks/useAuth.js`
- `src/components/auth/AuthScreen.js`

### Checklist Firebase Console à vérifier manuellement
- **Authorized domains** : le domaine Netlify (`*.netlify.app` ou domaine custom) est bien listé
- **Authentication > Sign-in method > Google** : activé
- **authDomain** dans `constants.js` : `my-rolling-day.firebaseapp.com` (correct)

### Risques restants
- `reauthenticateWithPopup` (dans `changePasswordForCurrentUser`) utilise encore un popup :
  en standalone, le changement de mot de passe Google échouera avec un message `auth/popup-blocked`.
  Non corrigé ici — fonctionnalité rarement utilisée en PWA, et l'utilisateur peut ouvrir dans Safari.
- Si `authDomain` n'est pas dans les authorized domains Firebase → `auth/unauthorized-domain` → message clair affiché.

---

## [2026-05-06] — Fix iOS PWA standalone : boutons de connexion gelés

### Problème
En mode PWA iOS standalone (app ajoutée à l'écran d'accueil), les boutons de connexion devenaient
inaccessibles après un clic sur "Continuer avec Google". Cause : `signInWithPopup` appelle `window.open()`
en interne. Safari iOS en mode standalone bloque `window.open()` silencieusement — la promesse Firebase
ne se résolvait jamais, ni en succès ni en erreur. Le `finally` de `runAuth` ne s'exécutait donc jamais,
laissant `busy = true` indéfiniment et tous les boutons `disabled`.

### Corrections appliquées

**1. `src/hooks/useAuth.js` — timeout de sécurité dans `runAuth`**
- `Promise.race()` entre l'action réelle et un timeout de 15 secondes
- Si le timeout se déclenche : erreur `auth/timeout` → `setAuthError` → `finally` s'exécute → `busy = false`
- Garantit que `busy` revient toujours à `false`, quel que soit le provider ou la plateforme

**2. `src/firebase/client.js` — détection standalone avant `signInWithPopup`**
- Nouvelle fonction `isStandaloneMode()` : teste `navigator.standalone` (iOS) et `display-mode: standalone` (standard)
- Si standalone : lève immédiatement une erreur `auth/popup-not-supported` avec message clair
- La promesse se termine instantanément → `runAuth` reçoit l'erreur → `busy = false` immédiatement
- `formatAuthError` étendu avec les codes `auth/popup-not-supported` et `auth/timeout`

**3. `src/components/auth/AuthScreen.js` — masquage du bouton Google en standalone**
- Constante `IS_STANDALONE` calculée une fois au chargement du module
- Les 3 pages (welcome, login, signup) remplacent le bloc divider + bouton Google par une notice :
  "Connexion Google non disponible en mode application iPhone. Utilise email / mot de passe ou ouvre l'application dans Safari."
- Connexion email / mot de passe totalement inchangée et fonctionnelle

**4. `src/styles.css` — style `.auth-standalone-notice`**
- Une règle CSS minimale : texte muted centré, taille 13px, opacité 0.75

### Fichiers modifiés
- `src/hooks/useAuth.js`
- `src/firebase/client.js`
- `src/components/auth/AuthScreen.js`
- `src/styles.css`

### Vérifications
- Safari normal (non-standalone) : comportement Google inchangé
- iOS PWA standalone : bouton Google remplacé par notice, email/password libre
- Erreur Google en Safari : `busy` revient à `false` via `finally`, boutons restent utilisables
- Timeout 15s : filet universel contre toute promesse suspendue dans `runAuth`

### Limitation connue
`reauthenticateWithPopup` (`client.js:247`) utilise également un popup — même limitation en standalone.
Non corrigé ici car inaccessible en standalone (l'utilisateur doit être connecté, et la fonctionnalité
de changement de mot de passe n'est pas critique en mode PWA iOS).

---

## [2026-05-06] — Cloud Function : envoi serveur des notifications push FCM

### Ce que j'ai fait
- Création du dossier `functions/` avec la Cloud Function `sendScheduledNotifications`
- Déclenchement planifié toutes les 5 minutes via `onSchedule` (Firebase Functions v2)
- Région `europe-west1`, timezone `Europe/Paris`, mémoire 256 MiB
- Pour chaque famille : lecture de `families/{id}/planner/state` → agenda + tasks + taskNotifications
- Collecte des tokens FCM valides dans `users/{uid}/messagingTokens` (filtre `permission == granted`)
- Envoi multicast via `admin.messaging().sendEachForMulticast()` avec `webpush.fcmOptions.link`
- Nettoyage automatique des tokens invalides (codes FCM `invalid-registration-token` / `registration-token-not-registered`)
- **Anti-spam serveur** : `families/{id}/serverNotificationLog/{key}` — clé unique par événement/tâche/date/type
- Nettoyage automatique des entrées anti-spam de plus de 3 jours (50 docs par run)
- Logique agenda : respect de `notification.enabled`, `minutesBefore`, skip des récurrents (`repeatWeekly`)
- Logique tâches : fin de journée + urgentes (1×/jour/tâche) + échéances (at_time / 1h_before / day_before)
- Interprétation "naïve locale Paris" des heures stockées dans Firestore (pas de décalage UTC appliqué)
- Système local navigateur conservé intact — la Cloud Function est un complément, pas un remplacement

### Fichiers créés
- `functions/index.js` — la Cloud Function
- `functions/package.json` — dépendances Node.js (firebase-admin ^12, firebase-functions ^5)
- `firebase.json` — configuration du projet Firebase (source: functions)
- `.firebaserc` — lie le projet au Firebase project `my-rolling-day`

### Pour déployer
```bash
cd functions && npm install
firebase deploy --only functions
```
La première fois : `npm install -g firebase-tools` puis `firebase login`

### Structure Firestore utilisée (lecture)
- `families/{familyId}/planner/state` → `{ data: { agenda, tasks, taskNotifications } }`
- `families/{familyId}/members/{uid}` → liste des UIDs membres
- `users/{uid}/messagingTokens/{docId}` → `{ token, permission }`

### Structure Firestore créée (écriture)
- `families/{familyId}/serverNotificationLog/{key}` → `{ sentAt, key }`
  - Index Firestore requis sur `sentAt` (champ simple, créé automatiquement par Firebase)

### Risques restants
- La Cloud Function lit toutes les familles en séquence : si le nombre de familles devient très grand (> 100), envisager un traitement par batch ou Pub/Sub
- Les tokens FCM ne sont filtrés que par `permission == "granted"` — les tokens très anciens (> 60 jours sans refresh) peuvent générer des erreurs FCM gérées par le nettoyage automatique
- Pas de test automatisé côté serveur dans cette passe (les emulateurs Firebase permettent de tester localement avec `firebase emulators:start`)

---

## [2026-05-05] - Notifications push Firebase Cloud Messaging

### Ce que j'ai fait
- Ajout de Firebase Cloud Messaging en parallele du systeme existant de notifications locales navigateur
- Creation du module `src/firebase/messaging.js` pour verifier le support, enregistrer le service worker, recuperer un token FCM avec la cle VAPID et ecouter les messages foreground
- Creation du hook `src/hooks/usePushMessaging.js` pour centraliser permission, synchronisation du token et etat push
- Extension de `src/firebase/client.js` avec `saveMessagingToken(...)` pour stocker le token dans Firestore cote utilisateur et foyer
- Creation de `public/firebase-messaging-sw.js` pour la reception background via `onBackgroundMessage`
- Ajout du shim racine `firebase-messaging-sw.js` pour servir correctement le service worker FCM sans recreer une nouvelle app Firebase
- Branchement de la demande d'autorisation uniquement via l'UI existante dans `SettingsView` et `OnboardingFlow`
- Conservation du systeme local actuel `new Notification()` sans suppression

### Fichiers modifies
- `src/constants.js`
- `src/firebase/client.js`
- `src/firebase/messaging.js`
- `src/hooks/usePushMessaging.js`
- `src/components/settings/SettingsView.js`
- `src/components/auth/OnboardingFlow.js`
- `src/App.js`
- `src/hooks/useAuth.js`
- `src/hooks/usePlannerSync.js`
- `src/main.js`
- `index.html`
- `public/firebase-messaging-sw.js`
- `firebase-messaging-sw.js`

### Verification
- Permission demandee uniquement via l'UI : oui
- `getToken()` branche avec la cle VAPID publique fournie : oui
- Token stocke dans Firestore lie a l'utilisateur et au foyer : oui
- Reception push preparee en foreground et background : oui
- Systeme local conserve : oui

### Risques restants
- Cette passe prepare l'enregistrement FCM, la persistance du token et la reception client ; l'emission serveur FCM n'est pas creee ici
- La validation finale doit etre faite dans un vrai navigateur avec permission acceptee et token present dans Firestore

---

## [2026-05-05] â€” Stabilisation notifications

### Ce que j'ai fait
- Correction de la persistance des rappels agenda dans `useAgenda.js` et `utils/state.js`
- Les objets `notification` des Ã©vÃ©nements simples et rÃ©currents sont maintenant sauvegardÃ©s, relus et normalisÃ©s
- Ajout d'un Ã©tat rÃ©actif de permission navigateur dans `SettingsView`
- Le statut affiche maintenant clairement : `Autorisees`, `Refusees`, `Non demandees`, `Non supportees`
- Le message d'autorisation disparaÃ®t immÃ©diatement aprÃ¨s acceptation grÃ¢ce au refresh local de permission
- Section `RÃ©glages > Notifications` clarifiÃ©e :
  - phrases explicatives sous chaque option
  - rÃ©sumÃ© visible des rappels actifs
  - bouton `Tester une notification`
  - clarification UI entre autorisation locale navigateur et prÃ©fÃ©rences partagÃ©es du foyer
- Formulaire `Ajouter / Modifier une tÃ¢che` complÃ©tÃ© :
  - section `Rappel` visible seulement avec Ã©chÃ©ance
  - options `Aucun rappel`, `A l'heure prevue`, `1h avant`, `La veille`
  - message explicatif pour les tÃ¢ches urgentes
- Moteur `useTaskNotifications` renforcÃ© :
  - prise en compte du rappel choisi sur chaque tÃ¢che
  - compatibilitÃ© des anciennes tÃ¢ches conservÃ©e via dÃ©rivation par dÃ©faut
  - Ã©coute `visibilitychange` ajoutÃ©e comme pour l'agenda

### Fichiers modifiÃ©s
- `src/hooks/useAgenda.js`
- `src/utils/state.js`
- `src/components/settings/SettingsView.js`
- `src/components/tasks/TasksView.js`
- `src/hooks/useTasks.js`
- `src/hooks/useTaskNotifications.js`
- `src/App.js`
- `src/hooks/usePlannerSync.js`
- `src/utils/storage.js`
- `src/hooks/useMeals.js`
- `src/components/meals/MealsView.js`
- `src/main.js`
- `index.html`

### VÃ©rifications
- `node --test --test-isolation=none tests/unit.test.js tests/e2e.test.js`
- RÃ©sultat : 14 tests OK, 0 Ã©chec, 1 test navigateur headless skip
- VÃ©rification ciblÃ©e supplÃ©mentaire :
  - `normalizeState()` conserve bien `agenda.notification` et `recurringEvents.notification`
  - `useTasks()` persiste bien le rappel choisi sur une tÃ¢che avec Ã©chÃ©ance

### Risques restants
- Le contrÃ´le manuel complet dans le navigateur connectÃ© n'a pas pu Ãªtre automatisÃ© dans cette session, car l'accÃ¨s au navigateur courant via le plugin in-app a retournÃ© `Acces refuse`
- Les rappels tÃ¢ches restent basÃ©s sur des notifications locales navigateur : si le navigateur n'est pas autorisÃ© ou l'app non ouverte, aucun rappel n'est envoyÃ©

---

## [2026-05-05] - Stabilisation ciblee post-audit E2E

### Ce que j'ai fait
- `SettingsView.js` : verification et maintien de `canManageHousehold` avant toute utilisation
- `SettingsView.js` + `App.js` : branchement effectif de `linkedAccountChoices` et `linkedAccountLabels`, avec affichage du compte lie dans la section foyer
- `InventoryView.js` : verification du rendu `📍` et suppression du bloc bulk bar duplique / mort
- `state.js` : purge des entrees `notificationLog` datant de plus de 7 jours dans `normalizeTask()`
- `TasksView.js` + `TaskCard.js` + `styles.css` : reactivation des boutons d'ordre et verification du groupement par liste
- `useTasks.js` + `TasksView.js` : blocage de la combinaison invalide `dueDate + repeat` a la creation et a l'edition
- `AuthScreen.js` : validation client-side simple pour email invalide et mot de passe trop court
- `NotesView.js` : alignement de l'UI visibilite avec la logique reelle `private + sharedWith`
- `App.js` : suppression du bloc JSX mort `false && ...`

### Pourquoi
- Corriger les defauts confirmes par l'audit E2E sans refonte visuelle
- Eviter les crashes silencieux, les features mortes et la dette de state qui grossit avec le temps

### Fichiers modifies
- `src/App.js`
- `src/components/auth/AuthScreen.js`
- `src/components/inventory/InventoryView.js`
- `src/components/notes/NotesView.js`
- `src/components/settings/SettingsView.js`
- `src/components/tasks/TasksView.js`
- `src/hooks/useTasks.js`
- `src/styles.css`
- `src/utils/state.js`
- `src/main.js`
- `index.html`

### Verification
- `node --test --test-isolation=none tests/unit.test.js tests/e2e.test.js`
- Resultat : 14 tests OK, 0 echec, 1 test navigateur headless skippe faute de navigateur dispo sur le port 9222
- Aucun script `build` ou `lint` disponible dans `package.json`

### Risques restants
- Le smoke E2E navigateur complet n'a pas pu etre joue localement faute de browser headless disponible
- Il reste beaucoup d'autres modifications non liees a cette tache dans le worktree ; cette entree ne couvre que la passe de stabilisation demandee

## Infos projet

**Nom app :** Planning Famille / My Rolling Day (MRD)  
**Stack :** React/Preact (ESM natif, pas de bundler), Firebase (auth + Firestore), Google Fonts  
**Cache-busting :** query strings versionnées sur tous les imports (`?v=YYYY-MM-DD-feature-N`)  
**PWA :** oui (viewport, theme-color `#3E2C1C`, logo SVG)  

**Vues principales :**
- `HomeView` — accueil, cartes résumé (tâches, repas, listes)
- `TasksView` — tâches par personne, récurrentes, deadlines
- `MealsView` — planificateur repas semaine (bande Lun–Dim + slots déjeuner/dîner)
- `RecipesView` — recettes par catégorie avec couleurs
- `ListsView` — listes de courses et inventaire
- `NotesView` — notes masonry
- `AgendaView` — agenda famille
- `InventoryView` — gestion stock produits
- `HistoryView` — historique utilisateur
- `SettingsView` — paramètres, membres, famille
- `AuthScreen` + `OnboardingFlow` — auth Firebase (email, Google) + onboarding

**Hooks principaux :**
- `useAuth` — gestion session Firebase
- `useTasks` — CRUD tâches + récurrence
- `useMeals` — planification repas, marquage cuisiné
- `usePlannerSync` — sync Firestore famille
- `useLists` — listes de courses

---

## [2026-04-17] — Commit initial

### Ce que j'ai fait
- Création de l'app complète depuis zéro

### Pourquoi
- Nouveau projet planning famille

### Fichiers modifiés
- Tous (commit initial)

### Impacts
- App fonctionnelle avec toutes les vues de base

---

## [2026-04-20] — Redesign général

### Ce que j'ai fait
- FAB tâches (bouton flottant d'ajout)
- Modales bottom-sheet sur mobile
- Notes en layout masonry
- Inventaire amélioré

### Pourquoi
- UX mobile-first, navigation plus fluide

### Fichiers modifiés
- `src/styles.css`, `src/components/tasks/TasksView.js`, `src/components/notes/NotesView.js`, `src/components/inventory/InventoryView.js`

### Impacts
- Nouvelle charte UI mobile

---

## [2026-04-20] — Repas : redesign bande de jours (revert + redo)

### Ce que j'ai fait
- Bande Lun–Dim scrollable, aujourd'hui terracotta clair, sélectionné terracotta plein
- Cartes Déjeuner ☀️ / Dîner 🌙 redessinées
- Bouton "Marquer cuisiné" → "✓ Cuisiné" vert
- Nom recette en typo serif + tags "Recette" / "4 pers."
- Aperçu semaine cliquable en bas

### Pourquoi
- Premier essai revert car problèmes ; deuxième version stable

### Fichiers modifiés
- `src/components/meals/MealsView.js`

### Impacts
- Vue Repas entièrement redessinée

---

## [2026-04-21] — Accueil : carte tâches premium + deadline fix

### Ce que j'ai fait
- Carte tâches : sélecteur "Mes tâches / Foyer", tri intelligent (échéance proche → urgente → autres)
- Tâches cochables depuis l'accueil + toast "Tâche effectuée" + bouton Annuler
- Badges : emoji/point gauche, liseré rouge urgent, badge personne coloré, badge "avant HHhMM" / "retard HHhMM"
- Logique deadline corrigée : placement exclusif par onglet (Aujourd'hui / Semaine / Mois) selon proximité réelle

### Pourquoi
- Accueil trop basique ; deadlines mal classées

### Fichiers modifiés
- `src/components/home/HomeView.js`, `src/hooks/useTasks.js`

### Impacts
- Accueil devient point d'entrée principal pour les tâches

---

## [2026-04-27] — Refine planner UI and interaction flows (commit massif)

### Ce que j'ai fait
- Refonte complète `AgendaView` (1100+ lignes)
- Refonte `InventoryView` (1700+ lignes) et `ListsView` (1400+ lignes)
- `TasksView` redessiné (1100+ lignes), `EmojiPicker` créé (897 lignes)
- `SettingsView` remaniée (768 lignes)
- `styles.css` +1833 lignes
- `TaskCard`, `SegmentedTabs`, `demoRecipes`, `defaultState`, `useTasks`, `useLists` mis à jour
- Docs créées : `ARCHITECTURE.md`, `DEV_NOTES.md`, `PROJECT_MAP.md`

### Pourquoi
- Refonte UX globale pour cohérence visuelle et ergonomie

### Fichiers modifiés
- 26 fichiers, +8259 / -1983 lignes

### Impacts
- Toute l'UI est dans son état actuel (base stable)

---

## [2026-05-05] — Modifications en cours (non commitées)

### Ce que j'ai fait
- Auth + onboarding : `AuthScreen.js`, `OnboardingFlow.js` (nouveau fichier), `useAuth.js`, `firebase/client.js`
- Recettes : catégories avec couleurs (`RecipesView.js`, `CategoryIcons.js` nouveau fichier)
- Accueil : `HomeView.js` mis à jour
- Listes : `ListsView.js`
- Repas : `MealsView.js`
- Notes : `NotesView.js`
- Tâches : `TasksView.js`, `useTasks.js`
- Settings : `SettingsView.js` (flow membres)
- Sync : `usePlannerSync.js`, `useMeals.js`
- Stockage : `utils/state.js`, `utils/storage.js`
- Assets : `src/assets/` (nouveau dossier, logo SVG)
- `index.html`, `src/main.js` mis à jour

### Pourquoi
- Plusieurs features en cours : onboarding, couleurs catégories recettes, flow settings membres

### Fichiers modifiés
- 20 fichiers modifiés + 3 nouveaux (`OnboardingFlow.js`, `CategoryIcons.js`, `src/assets/`)

### Impacts
- Ces changements ne sont PAS encore commitées — travail en cours

### À faire ensuite
- Committer une fois les features stables
- Vérifier que l'onboarding et les catégories recettes sont complets

---

## [2026-05-05] — Notifications agenda

### Ce que j'ai fait
- Ajout section `🔔 Rappel` dans le formulaire d'ajout/modif d'événement agenda
- Toggle on/off, presets rapides (À l'heure / 10 min / 30 min / 1h / Personnalisé), champ message optionnel
- Structure `notification: { enabled, minutesBefore, customMessage, sentKeys }` dans chaque événement
- Normalisation automatique à l'édition d'un ancien événement (sans `notification`)
- Logique `checkAgendaNotifications()` : intervalle 30s + visibilitychange + focus
- Anti-spam via `sentKeys` (clé unique par événement/date/heure/délai)
- Pop-up `Activer les rappels agenda ?` après création/jonction de foyer dans `OnboardingFlow`
- Non réaffichée si `mrd_notifications_prompt_seen = "true"` dans localStorage
- Compatibilité iPhone/Android : message si `Notification` absent, catch sur `requestPermission`
- Notifications désactivées pour les événements récurrents (`repeatWeekly`)

### Pourquoi
- Rappels contextuels uniquement pour les événements agenda (pas les tâches)

### Fichiers modifiés
- `src/components/agenda/AgendaView.js`
- `src/components/auth/OnboardingFlow.js`
- `src/styles.css`
- `src/App.js` (version strings)
- `index.html` (version string styles.css)

### Impacts
- Anciens événements agenda sans `notification` normalisés silencieusement à l'édition
- Aucun impact sur tâches, repas, notes, listes
- La permission est demandée une seule fois (localStorage guard)

---

## [2026-05-05] — Notifications tâches du foyer

### Ce que j'ai fait
- Nouveau hook `src/hooks/useTaskNotifications.js` — toute la logique de vérification
- 3 types de notifications : fin de journée, urgentes, échéances
- Intervalle 60s + déclenchement au focus fenêtre
- Anti-spam via `task.notificationLog` (tableau de clés `taskId-type-date`)
- `notificationLog: []` ajouté dans `normalizeTask()` (rétrocompat anciens objets)
- `taskNotifications` ajouté dans `normalizeState()` avec valeurs par défaut
- Section Notifications dans SettingsView : master toggle + 3 sous-options + heure fin de journée + bouton "Autoriser" si permission manquante
- Section remplace l'ancien placeholder `soon: true`
- App.js : appel du hook + `handleUpdateTaskNotifications` + props passées à SettingsView

### Pourquoi
- Notifications utiles sans spam pour les tâches foyer (quotidiennes, urgentes, échéances)

### Fichiers modifiés
- `src/hooks/useTaskNotifications.js` (**nouveau**)
- `src/utils/state.js`
- `src/components/settings/SettingsView.js`
- `src/App.js` (import hook, handler, props, version strings)
- `index.html` (version string styles.css)

### Impacts
- `taskNotifications` est dans le state Firestore — les réglages sont partagés entre appareils
- `notificationLog` par tâche — évite le spam mais grossit avec le temps (clés `taskId-type-date`)
- L'agenda reste intact — aucune modification de AgendaView ou de sa logique

---
