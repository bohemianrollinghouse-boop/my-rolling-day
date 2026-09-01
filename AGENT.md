# AGENT.md — carte du projet My Rolling Day

> **Point d'entrée unique pour tout agent qui travaille sur ce dépôt.**
> Lis ce fichier en entier avant de toucher au code. Il est écrit pour éviter
> de réanalyser le projet à chaque session.
>
> Dernière mise à jour : **28 août 2026** · branche `main` — après la fusion du
> dégraissage d'`App.js` et du chargement paresseux des vues.

---

## 0. RÈGLE OBLIGATOIRE — tenir ce fichier à jour

**Tout agent qui modifie ce projet doit mettre à jour ce fichier dans le même
travail que son changement.** Ce n'est pas une politesse : c'est la seule chose
qui empêche le prochain agent (ou le prochain toi) de travailler sur une carte
fausse. Le projet a déjà payé ce prix — `docs/ARCHITECTURE.md` a décrit pendant
des semaines une stack sans bundler avec React en CDN, alors que Vite était en
place depuis longtemps (constat écrit noir sur blanc dans
`docs/MIGRATION_IONIC.md` §1).

Concrètement, avant de rendre ton travail :

1. **Mets à jour les sections concernées de ce fichier** — arborescence,
   fonctionnalités, invariants, pièges, commandes, dépendances.
2. **Mets à jour l'en-tête** (date, branche, commit) et la section
   [§12 Journal des mises à jour de ce fichier](#12-journal-des-mises-à-jour-de-ce-fichier)
   avec une ligne : date, ce qui a changé dans le projet, ce que tu as corrigé ici.
3. **Corrige aussi les docs spécialisées** de `docs/` que ton changement périme
   (voir [§11](#11-les-autres-documents-et-leur-fiabilité)). Si tu touches à la
   structure, à la navigation ou à la coque d'écran, `docs/ARCHITECTURE.md` doit
   bouger dans le même commit.
4. **Consigne le changement fonctionnel dans `docs/PROJECT_LOG.md`** au format
   habituel du fichier (titre daté + tableau fichier / changement). C'est la
   mémoire longue du projet ; ce fichier-ci n'en est que l'index.
5. Si tu découvres qu'une affirmation de ce fichier est **fausse**, ne la
   contourne pas : corrige-la et dis-le explicitement dans le journal §12. Une
   ligne périmée est plus nuisible qu'une ligne absente.

Si ton changement ne modifie rien de ce qui est décrit ici (correction d'un
libellé, d'un espacement), tu n'as rien à mettre à jour — mais vérifie, ne
suppose pas.

---

## 1. Ce qu'est le projet

**My Rolling Day** — application familiale de planification du quotidien, en
français. Un foyer partage tâches, calendrier, repas, recettes, listes de
courses, inventaire, notes et pense-bête, synchronisés en temps réel via
Firebase.

- **Identifiant applicatif** : `fr.myrollingday.app`
- **Projet Firebase** : `my-rolling-day`
- **Version affichée** : `0.1.0 beta` (`src/app/config/constants.js`)
- **Version de release** : `package.json` → `version` + `build`
- **Langue de l'interface** : français. Tous les libellés utilisateur sont en
  français, y compris les messages d'erreur.

### Surfaces livrées

**iOS et Android uniquement**, via Capacitor 6. Décision produit du 22 août
2026 : **il n'y a pas de version ordinateur** au programme, et le rendu bureau
(barre latérale de 240 px) a été supprimé en phase 6 de la migration Ionic.

Ce n'est pas la même chose que « pas de web » : `dist/` reste servi par Firebase
Hosting parce que deux choses en dépendent — la redirection d'authentification
Google (`/__/auth/*`) et la page autonome de réinitialisation de mot de passe
(`site/reset-password.html`). Ouverte dans une fenêtre large, l'app s'affiche
comme sur téléphone, sur toute la largeur.

Les media queries restantes (600 / 640 / 720 px) **ne sont pas du bureau** : un
téléphone en paysage fait 844 px de large et les atteint.

---

## 2. Stack technique

| Couche | Choix | Notes |
|---|---|---|
| Build | **Vite 5** | `npm run dev`, `npm run build` → `dist/` |
| UI | **React 18 + HTM** | **pas de JSX** — voir ci-dessous |
| Coque / navigation | **`@ionic/react` 9** + `@ionic/react-router` 9 | migration terminée (phases 0→8) |
| Routeur | **`react-router-dom` 6.30.6** | **épinglé** — la v7 est incompatible avec `@ionic/react-router` 9 |
| Natif | **Capacitor 6** | `capacitor.config.ts`, `webDir: "dist"` |
| Backend | **Firebase** Auth + Firestore + Cloud Messaging | SDK npm, pas de CDN |
| Fonctions | **Cloud Functions** Node 20 (`functions/`) + **Python 3.13** (`functions-py/`) | deux codebases distinctes |
| Styles | **un seul CSS global** `src/theme/styles.css` (~7 800 lignes) | tokens `--mrd-*` = seule source de vérité couleur |
| Tests | **`node:test`** (runner intégré Node) + CDP sur Chrome headless | pas de Jest, pas de Mocha, pas de Playwright |
| TypeScript | devDependency, **uniquement** pour lire `capacitor.config.ts` | `allowJs` volontairement absent de `tsconfig.json` |

### Pas de JSX — la contrainte la plus importante

Les composants écrivent des templates ``html`...` `` (HTM lié à
`React.createElement` dans `src/app/lib.js`). Les composants Ionic s'utilisent
tels quels :

```js
html`<${IonButton} onClick=${fn}>Valider<//>`
```

Décision D1 de la migration Ionic : convertir ~28 500 lignes en JSX serait plus
gros que la migration elle-même, pour zéro gain fonctionnel. Vite compile le JSX
dans les fichiers `.jsx` si un écran neuf mérite l'exception, mais **on ne
mélange pas les deux dans un même fichier**.

Conséquences pratiques :
- fermeture HTM `<//>` verbeuse sur les arbres Ionic profonds — c'est accepté ;
- **jamais de backtick dans un commentaire placé à l'intérieur d'un template
  literal** : il termine la chaîne (erreur réellement commise, cf. phase 7) ;
- `className` et non `class`, `style=${{...}}` en objet.

### Règle supprimée : plus de `?v=...`

Les suffixes de cache busting datent de l'époque sans bundler, où chaque URL
distincte donnait une instance de module distincte (et donc deux
`initializeApp()` → crash `app/duplicate-app`). **Vite dédoublonne les modules
au build : il n'y a plus rien à aligner. Ne pas réintroduire de `?v=`.**

Corollaire : les notes qui parlaient d'aligner les versions d'import entre
fichiers, ou d'un `client.js` chargé deux fois, ne s'appliquent plus. La seule
protection encore utile est le fait que **`initializeApp()` n'est appelé qu'à un
seul endroit** (`providers/core.js`).

---

## 3. Arborescence

Structure calquée sur le projet **COBA** (Ionic/Angular), adaptée à React + htm.
Tout l'applicatif vit sous `src/app/`.

```
app/
├── index.html                 entrée statique : splash .ldr, boot log, timeout 8 s, thème pré-paint
├── src/
│   ├── main.js                setupIonicReact({mode:'ios'}), overlay d'erreur fatale, montage React
│   ├── app/
│   │   ├── App.js             (1890 l.) orchestrateur : routes, état, glue inter-modules
│   │   ├── routes.js          (199 l.) table de routes — module PUR, testé sans navigateur
│   │   ├── lib.js             liaison React 18 + HTM
│   │   ├── config/            constantes de domaine et données statiques (COUCHE FEUILLE)
│   │   ├── utils/             normalisation, dates, unités, stock, dialogues, défilement
│   │   ├── plugins/           enveloppes de plugins natifs Capacitor
│   │   ├── providers/         accès aux données — Firebase Auth + Firestore
│   │   ├── hooks/             actions métier et mutations d'état
│   │   ├── components/        briques réutilisables non-écrans
│   │   ├── modals/            modales applicatives
│   │   └── pages/<ecran>/     une destination de route + ses sous-composants propres
│   ├── environments/          configuration Firebase et drapeaux de build
│   ├── theme/                 styles.css + ionic-bridge.css
│   └── assets/                marque, polices auto-hébergées, icônes SVG
├── functions/                 Cloud Functions Node 20 (notifications, invitations, reset)
├── functions-py/              Cloud Functions Python (import + catégorisation de recettes)
├── tests/                     unitaires, e2e (CDP), captures de non-régression visuelle
├── scripts/                   build-info, bump de version, préparation et envoi des releases
├── site/                      site vitrine + page autonome de reset de mot de passe (hors bundle)
├── public/                    copié tel quel par Vite : service worker FCM, icônes PWA, _redirects
├── android/ · ios/            projets natifs Capacitor
└── docs/                      documentation détaillée (voir §11)
```

### Les couches et leur ordre — verrouillé par un test

`tests/unit/structure.test.js` lit les imports relatifs réels et **échoue** si
une dépendance remonte d'une couche. Rang croissant = couche plus haute ; un
module peut importer son propre rang ou un rang strictement inférieur, **jamais
au-dessus** :

| Rang | Couche |
|---|---|
| 0 | `environments/`, `config/` |
| 1 | `utils/`, `plugins/`, `lib.js`, `routes.js` |
| 2 | `providers/` |
| 3 | `hooks/` |
| 4 | `components/` |
| 5 | `modals/` |
| 6 | `pages/` |
| 7 | `App.js` |
| 8 | `main.js` |

Deux règles supplémentaires du même test :
- **`config/` reste une feuille** : données pures, aucune dépendance relative ;
- **la racine de `src/app/` ne contient que `App.js`, `lib.js`, `routes.js`**.
  Un nouveau fichier posé là fait échouer le test — il doit rejoindre une couche.

Un dossier par page **seulement quand l'écran a plusieurs fichiers**
(`pages/recipes/` en a cinq). COBA a un dossier par page parce qu'Angular impose
un triplet `.ts/.html/.scss` ; ici une page est un seul `.js`.

### Deux écarts assumés par rapport à COBA

- **Pas de `.browserslistrc`** : Vite ne le lit pas (c'est un mécanisme
  Angular/PostCSS). Le plancher navigateur est dans `vite.config.js` via
  `build.target`, qui a un effet réel.
- **Pas de `.npmrc`** : le flag `legacy-peer-deps` masquerait justement le
  conflit de pair sur `react-router-dom`, épinglé en 6.30.6 exprès.

---

## 4. Inventaire des fichiers

### Coquille applicative

| Fichier | Lignes | Rôle |
|---|---|---|
| `src/app/App.js` | 1526 | Orchestrateur. Routes Ionic, arbre de décision de boot, câblage des hooks, 6 fonctions de rendu, toasts, modales globales, bouton retour Android. **Dégraissé le 23 août 2026** (1890 → 1526) : la logique métier est partie dans des hooks, voir §4 `hooks/`. |
| `src/app/routes.js` | 199 | Seule traduction URL ↔ vocabulaire historique du code. Module pur. |
| `src/app/lib.js` | 11 | Exporte `React`, `createRoot`, `useEffect`, `useMemo`, `useRef`, `useState`, `html`. |
| `src/main.js` | 64 | `setupIonicReact({mode:'ios'})`, overlay d'erreur fatale hors de `#root`, montage. |

`App.js` est séparé en deux composants : `App()` monte `IonApp` +
`IonReactRouter`, `AppShell()` est l'ancien `App` (il a besoin des hooks du
routeur, donc il doit être *dans* le provider).

### `config/` — données statiques (rang 0)

| Fichier | Lignes | Contenu |
|---|---|---|
| `constants.js` | 77 | `DAYS`, `MEMBER_COLORS` (6), `DEFAULT_MEMBER_COLOR`, `BADGE_PALETTE` (8 teintes × 5 nuances), `DEFAULT_BADGE_COLOR`, `THEME_COLOR_LIGHT/DARK`, `APP_VERSION`, `TABS` (12 entrées) |
| `defaultState.js` | 29 | `createDefaultState()` — forme du document planner |
| `demoRecipes.js` | 1197 | `DEMO_RECIPES` — jeu de recettes de démonstration |
| `condiments.js` | ~60 | `CONDIMENTS`, `CONDIMENT_ESSENTIALS` — catalogue |

⚠️ `BADGE_PALETTE` et `MEMBER_COLORS` sont **délibérément hors du système de
tokens `--mrd-*`** : ce sont des couleurs d'identification choisies par
l'utilisateur, elles doivent rester distinctes entre elles, pas s'harmoniser
avec l'accent. `THEME_COLOR_LIGHT/DARK` doivent être des hex littéraux (les API
natives ne lisent pas les variables CSS) et refléter exactement `--mrd-bg`.

### `utils/` — logique pure (rang 1)

| Fichier | Lignes | Rôle |
|---|---|---|
| `state.js` | 773 | **Cœur du modèle.** `normalizeState`, `checkReset`, `createMealShell`. Migrations de compatibilité, resets jour/semaine/mois, cycles de tâches récurrentes. |
| `recipeStock.js` | 355 | Comparaison recettes ↔ inventaire : `computeMissingIngredients`, `computeRecipeStock`, `computeWeekStock`, `computePriorityRecipes` (anti-gaspi), `collectExpiringItems`. |
| `date.js` | 160 | **Tous** les helpers de date, y compris la simulation temporelle. |
| `units.js` | 123 | `toBaseQuantity`/`fromBaseQuantity`, `addStockQuantities`, `productMatchKey`, `PRODUCT_STOPWORDS`. |
| `recipeFilters.js` | 121 | Saisons, mois, durée, régime, contraintes, recherche texte. |
| `productUtils.js` | 114 | **Mémoire produit** : `normalizeProductName`, `findSimilarItem`, `suggestItems`, `collectKnownProducts`, `formatQuantityUnit`. |
| `mealFill.js` | 180 | `buildFillPlan` — tirage automatique de la semaine de repas, service par service (entrée / plat / dessert). |
| `storage.js` | 134 | `parseImportedState` (import JSON), invite de notifications, préférences de la feuille « Remplir ». |
| `dialogs.js` | 87 | `confirmDialog`, `promptDialog` — contrôleur impératif `ion-alert`. |
| `theme.js` | ~40 | `readStoredTheme`, `applyTheme` — pose `data-theme` **et** `.ion-palette-dark`. |
| `staleTasks.js` | ~40 | `getStaleTaskAlerts` — relance « tâche non faite ». |
| `personStorage.js` | ~50 | Personne active + mode d'appareil, par foyer, en localStorage. |
| `premium.js` | 4 | `PREMIUM_TABS = ["meals","inventory","recipes"]`, `isPremiumTab`. |
| `families.js` | 6 | `normalizeFamilyIds`, `canSwitchToFamily`. |
| `scroll.js` | 16 | `scrollActivePageToTop` — remonte la `.ion-page` active. |

### `plugins/` — natif Capacitor (rang 1)

| Fichier | Rôle |
|---|---|
| `notifications.js` | Adaptateur unique web `Notification` / natif `@capacitor/local-notifications`. Cache de permission **synchrone**, listener de tap centralisé. `initNotifications` appelé au boot. |
| `statusBar.js` | `applyStatusBarTheme(isDark)` — `setStyle` + `setBackgroundColor` (Android). |

### `providers/` — Firebase (rang 2)

`client.js` est une **façade** : elle `export *` les cinq sous-modules. Les
fichiers de l'app importent toujours depuis `providers/client.js`.

| Fichier | Lignes | Rôle |
|---|---|---|
| `core.js` | 132 | **Le seul endroit où `initializeApp()` est appelé.** Exporte `auth`, `db`, `functions` (région `europe-west1`), `googleProvider`. Utilitaires : `randomCode`, `colorForUser`, `getOrCreateDeviceId`, `formatAuthError`, `formatFirestoreError`. |
| `clientAuth.js` | 272 | Google + email/mot de passe, persistance, redirect PWA, changement d'email/mot de passe, réauthentification. |
| `clientFamily.js` | 776 | Foyer, membres, personnes, invitations, profils liés, suppression de compte/foyer, multi-foyers. |
| `clientPlanner.js` | 24 | `watchFamilyPlanner`, `saveFamilyPlanner`. |
| `clientMessaging.js` | 113 | Tokens FCM (`registerFcmDeviceToken`, `saveMessagingToken`). |
| `clientSupport.js` | ~55 | Rapports de bug, suggestions, feedback testeurs. |
| `messaging.js` | 327 | Firebase Cloud Messaging. Service worker web **ou** `@capacitor/push-notifications` en natif. |
| `clientRecipes.js` | ~40 | ⚠️ **Pas re-exporté par `client.js`.** Appelle les fonctions Python : `scrapeRecipeFromUrl`, `categorizeRecipe`. Importé directement par `RecipesView.js`. |

### `hooks/` — actions métier (rang 3)

| Fichier | Lignes | API rendue |
|---|---|---|
| `useAuth.js` | 936 | Le plus gros. Auth, foyer, membres, personnes, invitations, `bootLoading`, ~40 valeurs et handlers. |
| `useLists.js` | 662 | **Zone à haut risque.** Listes, liste de courses, inventaire, emplacements de rangement, fusion anti-doublon. |
| `useTasks.js` | 389 | `handleAddTask`, `handleUpdateTask`, `handleToggleTask`, `handleDeleteTask`, `handleMoveTask`, `handleChangeTaskPeriod`, `handleDismissStaleNotice`. |
| `useTaskNotifications.js` | 221 | Rappels locaux d'échéance de tâche (app au premier plan). |
| `usePushMessaging.js` | 174 | Enregistrement du token FCM, messages au premier plan. |
| `useMeals.js` | 164 | `handleUpdateMeal`, `handleToggleCook`, CRUD recette, `handleToggleRecipeFavorite`, `handleLoadDemoRecipes`. |
| `useAgenda.js` | 136 | Blocs d'agenda + événements récurrents. |
| `useMealCooking.js` | 241 | **Cuisson d'un créneau + déduction de stock.** Extrait d'`App.js` le 23 août 2026. `computeMealCookState` et `deductionToastMessage` sont **purs et exportés** — c'est tout l'intérêt de l'extraction, ils sont testés par `tests/unit/meal-cooking.test.js` (16 tests, un par règle produit). |
| `usePlannerData.js` | 101 | Import / export / remise à zéro du planner (section « Données » des réglages). Passe par `checkReset`, jamais à côté. |
| `useInbox.js` | 92 | Pense-bête : capture + dispatch vers tâche / agenda / note. Reçoit les créateurs des autres hooks en paramètres plutôt que de les appeler — voir le commentaire du fichier. |
| `useAppTime.js` | 92 | Simulation temporelle. Porte `appTimeVersion`, le compteur qui sert de signal de rafraîchissement aux `useMemo` qui lisent la date. |
| `useNotes.js` | 46 | Notes : création, suppression, modification. Le filtrage par visibilité reste au rendu, il dépend de la personne active. |
| `useAppRouting.js` | ~60 | Gardes de routage dérivées de l'état d'auth. |
| `usePlannerSync.js` | 65 | Synchro Firestore du planner. Rend `{ state, setState, status, plannerError }`. |
| `useStaleTaskAlerts.js` | ~30 | Alertes « tâche non faite ». |

### `components/` (rang 4) et `modals/` (rang 5)

| Fichier | Lignes | Rôle |
|---|---|---|
| `MrdModal.js` | 83 | **Enveloppe `ion-modal`** — primitive utilisée par 17 fichiers. Vit dans `components/` et non `modals/` : c'est une primitive, pas une modale. |
| `nav/BottomNav.js` | 108 | `ion-tab-bar`. `QUICK_MENU_ITEMS`. Les 4 onglets portent un `href` (voir §6). |
| `nav/NavIcons.js` | ~70 | 5 icônes SVG de la barre du bas. |
| `SegmentedTabs.js` | ~50 | Enveloppe `ion-segment`. API de props inchangée depuis la version maison. Variante `stacked`. Utilisé par `App`, `Agenda`, `Lists`. |
| `settings/SettingsUI.js` | 179 | Briques des réglages : `SectionCard`, `SettingsRow`, `SettingsSwitch`, `SettingsToggleRow`, `SubPageHeader`, `ColorGrid`, `LegalTextPage`. Partagées entre pages réglages et `SettingsModals`. |
| `FeedbackWidget.js` | 105 | Bouton flottant de retour testeur. |
| `modals/AppModals.js` | 270 | `ProfileModal`, `NotifPromptModal`, `InviteCodesModal`, `NotificationModal`, `StaleTaskModal`, `HouseholdWelcomeModal`. |
| `modals/SettingsModals.js` | 233 | `EditMemberModal`, `AddPersonModal`, `NewMemberInviteModal`. |

### `pages/` — écrans (rang 6)

| Fichier | Lignes | Écran |
|---|---|---|
| `home/HomeView.js` | 945 | Accueil / tableau de bord. |
| `tasks/TasksView.js` | 1434 | Tâches — 4 périodes. Réordonnancement par appui long. |
| `tasks/TaskCard.js` | 182 | Carte tâche partagée (Tâches **et** Agenda). Exporte aussi `urgencyBadge`, `isPastDue`, `daysLeft`, `recurrenceLabel`. |
| `tasks/EmojiPicker.js` | 897 | Sélecteur d'emoji, réutilisé par Tâches, Agenda, Listes, Inventaire, Pense-bête. |
| `agenda/AgendaView.js` | 1607 | Calendrier + rappels. |
| `meals/MealsView.js` | 1066 | Grille semaine (14 créneaux sans défilement) + panneau bas permanent (détail **ou** feuille « Remplir la semaine »). |
| `meals/RecipePicker.js` | 431 | Sélecteur de recette d'un créneau ; remplace la grille pendant la sélection. |
| `recipes/RecipesView.js` | 1186 | Fiche + formulaire de recette + import depuis une URL. |
| `recipes/RecipeLibrary.js` | 635 | Bibliothèque : recherche, filtres, cartes, favoris. |
| `recipes/RecipeSheet.js` | 319 | Fiche recette (page **et** modale, même composant). |
| `recipes/VoiceCookingMode.js` | 426 | Mode cuisine vocal : `parseMethodSteps`, `matchVoiceCommand`, sélection de voix française. |
| `recipes/CategoryIcons.js` | 98 | `CategoryIcon`, `categoryToneClass`. |
| `lists/ListsView.js` | 1133 | Liste de courses + listes personnalisées. |
| `inventory/InventoryView.js` | 1606 | Inventaire : stock, péremption, rangement, prix. |
| `notes/NotesView.js` | 493 | Notes avec visibilité (privée / partagée / foyer). |
| `inbox/InboxView.js` | 805 | Pense-bête : capture rapide + dispatch vers tâche / événement / note. |
| `history/HistoryView.js` | 109 | Historique, trié par jour. |
| `settings/SettingsView.js` | 1489 | Réglages, 9 sections. |
| `settings/NewHouseholdWizard.js` | 443 | Assistant de création de foyer depuis les réglages. |
| `settings/SettingsSupportPage.js` | 125 | Sous-pages support : contact, bug, suggestion, confidentialité, CGU. |
| `settings/SettingsLegal.js` | 160 | `TERMS_SECTIONS`, `PrivacyPolicyPage`. |
| `auth/AuthScreen.js` | 218 | welcome → login / signup / mot de passe oublié + Google. |
| `auth/OnboardingFlow.js` | 939 | 3 flux : CREATE, JOIN, EXISTING-PROFILE (voir §7). |
| `premium/PremiumLockScreen.js` | 74 | Écran de vente Premium (mensuel 4,99 € / annuel 39,99 €). |

### Fichiers morts — supprimés

Plus aucun fichier mort connu. Supprimés le 1er septembre 2026, après
vérification par grep qu'aucun n'était importé :

| Fichier | Lignes | Remplacé par |
|---|---|---|
| `src/app/components/FamilyPanel.js` | 236 | `SettingsView` |
| `src/app/components/Header.js` | ~30 | les en-têtes Ionic |
| `scripts/run-tests.ps1` | 31 | `npm test` (le script codait en dur un chemin Node d'une machine Windows disparue) |

(`src/components/Tabs.js`, listé comme mort dans les anciennes docs, avait déjà
disparu au passage à Ionic — la barre du bas est `ion-tab-bar` depuis la phase 2.)

---

## 5. Modèle de données

### Le document planner

Un seul objet d'état par foyer, dans
`families/{familyId}/planner/state`. Forme définie par
`createDefaultState()` :

```js
{
  tasks: [], meals: [], recipes: [], lists: [ /* liste de courses par défaut */ ],
  inventory: [], storageLocations: [], productLocationMemory: {},
  notes: [], history: [], agenda: [], recurringEvents: [],
  shopping: [],                    // legacy, maintenu en miroir des lists
  linkMealsToInventory: false,
  lastResetDaily: "", lastResetWeekly: "", lastResetMonthly: "",
}
```

Champs ajoutés par `normalizeState` mais absents de `createDefaultState` :
`customCondiments`, `inbox`, `taskNotifications`
(`{enabled, endOfDay, endOfDayTime, urgent, due, weeklyReminder}`).

### Le flux de mutation — un seul chemin

```
vue → handler de hook → updateState(producer)
                          ↓
                        checkReset(state, getCurrentAppDate())
                          ↓
                        normalizeState  (migrations + corrections structurelles)
                          ↓
                        usePlannerSync → Firestore
```

**Toute mutation importante passe par `updateState`.** Ne pas contourner
`normalizeState` pour un objet métier persistant : c'est là que vivent les
migrations de compatibilité.

### Collections Firestore

Tout l'accès passe par `providers/client.js`.

| Chemin | Rôle |
|---|---|
| `users/{uid}` | Profil : `familyIds`, `currentFamilyId`, `displayName`, `pendingOnboardingFamilyId` |
| `users/{uid}/messagingTokens/{tokenDocId}` | Tokens FCM par navigateur |
| `families/{familyId}` | Métadonnées du foyer |
| `families/{familyId}/planner/state` | **Le document planner** |
| `families/{familyId}/people/{personId}` | Personnes du foyer (avec ou sans compte) |
| `families/{familyId}/members/{uid}` | Utilisateurs de l'app rattachés au foyer (rôle, nom, email) |
| `families/{familyId}/members/{uid}/devices/{deviceId}` | Token FCM par appareil physique ; id stable en localStorage (`mrd-device-id`) |
| `families/{familyId}/invitations/{invitationId}` | Invitations (code, expiration, créateur) |
| `families/{familyId}/joinEvents/{eventId}` | Journal d'arrivée écrit par le client, lu par une Cloud Function |
| `families/{familyId}/serverNotificationLog/{key}` | Anti-spam push — **écriture interdite au client** (`allow write: if false`) |
| `bug_reports/{id}` · `feature_requests/{id}` · `tester_feedback/{id}` | Retours, à la racine |
| `mail/{mailId}` | Extension « Trigger Email » — `read, write: if false`, seul l'Admin SDK y touche |

Un `collectionGroup(db, "invitations")` sert à retrouver une invitation par son
code, tous foyers confondus.

Les règles vivent dans `firestore.rules` et reposent sur trois helpers :
`isAuth()`, `isFamilyMember(familyId)`, `isFamilyAdmin(familyId)`.

### Clés localStorage

| Clé | Rôle |
|---|---|
| `mrd-theme` | Thème choisi ; lu par le script inline d'`index.html` **avant le premier paint** |
| `mrd-device-id` | Identifiant d'appareil stable pour la sous-collection `devices` |
| `mrd_google_redirect_pending` | Posé avant `signInWithRedirect`, effacé après `getRedirectResult` |
| `mrd_sim_mode` / `mrd_sim_value` | Simulation temporelle (outil de dev) |
| clés `personStorage` | Personne active + mode d'appareil, **par foyer** |

---

## 6. Navigation et routage

**L'URL est la source de vérité de l'écran affiché — plus aucun `useState` pour
ça.** `src/app/routes.js` est la **seule** traduction entre l'URL et le
vocabulaire historique du code.

| Chemin | Écran |
|---|---|
| `/home` | Accueil |
| `/tasks` · `/tasks/:period` | Tâches — `daily`, `weekly`, `monthly`, `mine`. **Une seule route** : changer de période change un segment, pas de page. |
| `/agenda` · `/meals` | Onglets |
| `/lists` · `/notes` · `/inventory` · `/recipes` · `/history` · `/inbox` | Écrans secondaires, empilés par-dessus l'accueil |
| `/settings` · `/settings/:section` · `/settings/support/:page` | Réglages, 3 niveaux |
| `*` | Redirige sur `/home` |

L'ordre compte dans `ROUTE_PATHS` : `/settings/support/:page` doit précéder
`/settings/:section`, sinon « support » est pris pour une section.

Les valeurs acceptées, définies dans `routes.js` :

```js
SETTINGS_SECTIONS = ["profile", "households", "household", "notifications",
                     "appearance", "account", "privacy", "help", "about"]
SUPPORT_PAGES     = ["contact", "bug", "feature", "privacy", "terms"]
```

« main » est le sommaire et correspond à `/settings` tout court, **pas** à
`/settings/main`. Noter `households` (la liste « Mes foyers ») et `household`
(le foyer courant) : deux sections distinctes dont les noms ne diffèrent que
d'une lettre.

### Deux ensembles voisins mais distincts

- `QUICK_SCREENS = ["lists","notes","inventory","recipes","history"]` — atteints
  par le menu « Plus ».
- `SECONDARY_SCREENS = ["notes","inventory","recipes","history","inbox"]` —
  s'empilent avec un bouton retour.

Ce n'est **pas** `QUICK_SCREENS + inbox` : `lists` pose son propre titre sur la
même ligne que son bouton « + Nouvelle », lui ajouter un en-tête de retour
empile deux titres (régression réellement introduite puis rattrapée par les
captures). Et `inbox` est secondaire sans être au menu « Plus » : on y arrive
depuis l'accueil.

### Une pile de navigation par onglet — pourquoi les `href` sont obligatoires

`TAB_ROOTS` donne la racine de chaque onglet, valeur de son `href` :
`/tasks` et **non** `/tasks/daily` — `matchesTab()` fait une comparaison de
préfixe, qui doit couvrir les quatre périodes, sinon l'onglet ne s'allume pas
sur `/tasks/weekly`.

Ionic mémorise la dernière route de chaque onglet tout seul
(`IonTabBar.getDerivedStateFromProps` réécrit le `currentHref` de l'onglet
actif à chaque rendu, puis `changeTab()` restaure via
`locationHistory.getCurrentRouteInfoForTab()`). **Retirer les `href` casse tout** :
`IonTabBar` construit sa table d'onglets *depuis* les `href`, sans eux aucune
route n'est rattachée à un onglet, `changeTab()` n'est jamais appelé, et les dix
routes s'empilent dans une pile unique. C'était le bug du 23 août 2026.

« Plus » reste **sans** `href` : `handleChangeTab` sort sur `if (!path) return`,
et son `onClick` ouvre la feuille d'actions.

### Trois pièges de navigation

1. **Ne jamais appeler `navigate()` en direct** — passer par `go()`, qui
   n'empile pas deux fois la même destination. Plusieurs endroits enchaînent
   deux changements d'état visant la même URL ; sans ce garde, le bouton retour
   semble ne rien faire au premier appui.
2. **Un `setState` transformé en navigation n'est plus réversible.** Un effet de
   remise à zéro sur `[user]` empilait deux entrées `/settings` au démarrage,
   invisible à l'écran. Verrouillé par `tests/e2e/navigation.test.js` [7].
3. **Les gardes de haut niveau ne sont pas des routes.** Chargement, auth et
   onboarding restent des rendus conditionnels dans `AppShell` : ce sont des
   prises de contrôle plein écran *avant* que l'app existe.

`activeTab` et `setActiveTab` **gardent leur nom et leur vocabulaire**
(« daily », pas « tasks ») : seules leurs définitions ont changé. C'est ce qui a
permis de ne pas toucher les ~50 endroits qui les utilisent.

---

## 7. Boot, auth et onboarding

### Séquence de boot

Le splash `.ldr` (statique dans `index.html`, **maison** — il s'affiche avant
que React soit monté, Ionic n'existe pas encore) reste visible tant que :

```
bootLoading = !authReady
           || (!!user && !profileFetched)
           || (profileFetched && currentFamily === undefined)
           || (currentFamilyId && !peopleBootstrapped)
```

- `authReady` → `onAuthStateChanged` a émis au moins une fois
- `profileFetched` → document `users/{uid}` reçu
- `currentFamily === undefined` → doc foyer pas encore chargé (**pas** `null`,
  qui signifie « aucun foyer »)
- `peopleBootstrapped` → `people` **et** `members` reçus

`bootLoading` vient de `useAuth` et est **la seule** source de vérité de l'écran
de chargement. `App.js` en fait un arbre de décision unique, sans rendu
intermédiaire : erreur → splash → auth → onboarding → app.

`index.html` porte un filet de sécurité : un timeout de 8 s qui affiche un écran
d'erreur si React n'a pas monté, plus un journal `window.__APP_BOOT_LOGS__` et
un état `window.__APP_BOOT_STATE__`.

### Flux d'authentification

1. `onAuthStateChanged` → `authReady = true`
2. `user === null` → `AuthScreen`
3. `user` présent → `watchUserProfile(uid)`
4. Profil reçu → selon `familyIds` / `currentFamilyId` : vide → `OnboardingFlow`,
   sinon `watchFamily` → `watchFamilyPeople` + `watchFamilyMembers`
5. people + members chargés → `peopleBootstrapped` → boot terminé

### Google Sign-In — le piège PWA iOS

- Navigateur normal : `signInWithPopup`, repli `signInWithRedirect` sur
  `popup-not-supported`
- **PWA iOS en standalone** : `signInWithRedirect` directement — pas de popup
  possible en WKWebView. Détection : `isStandalonePwa()` teste
  `window.navigator.standalone === true`
- Retour de redirection : `getRedirectResult()` + drapeau
  `mrd_google_redirect_pending`
- **En natif, `getRedirectResult` est sauté** (`useAuth.js`) : le flux redirect
  n'existe pas avec le dialogue Google natif
- Le motif `heldNullAuthState` de `useAuth.js` évite le flash de l'écran de
  connexion pendant un retour de redirection

### Onboarding — trois flux

Garde : `profileGuardActive = needsFamilySetup || needsLinkedProfileSetup`.
`needsFamilySetup` = profil sans `currentFamilyId` ; `needsLinkedProfileSetup` =
membre d'un foyer sans entrée `people` liée.

- **CREATE** : `choose-household-mode` → `create-first-name` →
  `create-badge-color` → `create-household-name` → `create-add-members` →
  [`create-invite-members`, seulement si des membres ont été ajoutés]
- **JOIN** : `join-invitation-code` → `join-confirm-household` →
  `join-profile-name` → `join-badge-color` → `join-done`
- **EXISTING-PROFILE** : `existing-profile-name` → `existing-badge-color` →
  `existing-done`

---

## 8. Fonctionnalités et règles produit

Ces règles ne se déduisent pas du code : ce sont des décisions produit. **Les
respecter, ou les changer explicitement avec l'accord de Steve.**

### Tâches et calendrier

- Une tâche a une **rubrique d'origine** (`type` : `daily`, `weekly`,
  `monthly`, `deadline`).
- **La tâche est la source de vérité ; le bloc calendrier est une couche de
  placement.** Retirer un bloc du calendrier ne doit **pas** supprimer la tâche.
  Supprimer une tâche doit nettoyer ses liens agenda + récurrents.
- Une tâche planifiée dans l'agenda pour aujourd'hui **remonte** dans le
  quotidien.
- Les tâches **récurrentes ne doivent jamais s'afficher en retard**. Elles se
  réinitialisent par cycle dans `state.js` (`applyTaskCycles`, frontières
  quotidienne / hebdomadaire / mensuelle calculées en UTC).
- Les tâches **uniques complétées** sont retirées de tous les onglets au
  prochain reset quotidien et ne restent que dans l'historique.
- Une tâche unique en retard **peut** être marquée en retard.
- Relance « tâche non faite » : semaine ≥ 6 j, mois ≥ 27 j (`staleTasks.js`,
  `StaleTaskModal`). La modale propose de déplacer la tâche vers une autre
  période.
- L'affichage d'une tâche liée au calendrier **réutilise la carte tâche**
  (`pages/tasks/TaskCard.js`, partagée par Tâches et Agenda) autant que possible,
  plutôt qu'un rendu propre à l'agenda.
- Réordonnancement **par appui long avec glissement** (280 ms,
  annulation à 8 px) — **pas de flèches** sur les cartes.
- Pas de bloc emoji vide : sans emoji, aucun emoji affiché.
- Les onglets hauts de Tâches doivent visuellement correspondre à ceux d'Agenda.

### Listes et inventaire

- **La liaison inventaire est optionnelle**, y compris pour la liste de courses.
  La liste de courses doit rester utilisable seule.
- Quand la liaison est active, un achat peut mettre à jour l'inventaire.
- Un article acheté repasse à la quantité `0` ; **l'annulation doit restaurer la
  quantité précédente**.
- Les produits proches se fusionnent **avec prudence, jamais agressivement**.
- **Une fusion convertit les unités avant d'additionner et refuse la fusion
  quand les unités ne mesurent pas la même chose** : deux lignes honnêtes valent
  mieux qu'un total faux (`addStockQuantities` dans `utils/units.js`). La somme
  s'exprime dans l'unité de la ligne **existante**.

### Repas, recettes, inventaire

Une recette contient : `ingredients` structurés (`name`, `quantity`, `unit`),
`condiments` **séparés**, disponibilité saison/mois, badges alimentaires
(`labels`), nombre de personnes (`servings`, 1–24), `method`, `photo`
(compressée, plafond 80 Ko), `favorite`, `createdAt`.

- **Les condiments ne sont jamais déduits automatiquement du stock.** Ils
  peuvent être signalés manquants. Visuellement secondaires aux ingrédients
  principaux.
- `linkMealsToInventory = false` → pas de comparaison inventaire, pas de popup
  d'ingrédients manquants, pas de suggestion de liste. La sélection manuelle
  d'ingrédients vers la liste de courses **reste possible**.
- `linkMealsToInventory = true` → comparaison, popup des manquants, ajout à la
  liste, et **déduction du stock au passage à `OK` pour les ingrédients
  principaux seulement**.
- Comparaison et déduction doivent rapprocher les produits **de la même
  façon** : même clé produit, mêmes conversions (`utils/units.js`).
- **La faisabilité de la grille Repas se lit à l'échelle de la semaine, pas
  recette par recette.** Le stock est un budget que les créneaux consomment dans
  l'ordre chronologique (`computeWeekStock`). Deux repas qui veulent le même
  produit ne peuvent pas se déclarer faisables tous les deux. Les créneaux déjà
  cuisinés sont exclus : leurs ingrédients ont quitté le stock.
- **Une déduction partielle ne doit jamais passer pour complète** : si le stock
  ne couvre pas tout, le message le nomme, et l'annulation reste offerte.
- Une recette **sans ingrédients structurés** n'est ni faisable ni manquante :
  elle n'est pas comparable au stock.
- **Le changement de nombre de personnes est d'affichage seulement.** La fiche
  recette recalcule les quantités affichées (`fmtScaledQty`, `ratio =
  servings / baseServings` dans `RecipeSheet.js`), mais `utils/recipeStock.js`
  **ne connaît ni `servings` ni `ratio`** : comparaison au stock, manquants et
  déduction utilisent les quantités **stockées**. Vérifié le 23 août 2026. Donc
  cuisiner pour 8 une recette écrite pour 4 affiche les bonnes quantités et
  déduit celles de 4. À savoir avant de « corriger » un écart apparent d'un côté
  ou de l'autre : les brancher ensemble est un changement de comportement
  produit, pas une correction de bug.
- Dans le choix d'une recette : badge faisable / nombre de manquants, filtre
  « faisable avec mon stock », tri des faisables en tête, suggestions anti-gaspi
  pour les DLC proches (`EXPIRY_SOON_DAYS = 7`).
- La grille Repas tient **14 créneaux dans un écran sans défilement** ; le détail
  du créneau vit dans un panneau bas permanent, **jamais dans une modale**, pour
  que la semaine reste lisible pendant qu'on remplit un trou.
- **Feuille « Remplir la semaine »** (`renderFillSheet` + `utils/mealFill.js`) :
  une décision par ligne — régime, services, filtres, règles, portée — puis un
  seul bouton. Elle occupe le même panneau bas que le détail : **les deux ne
  coexistent jamais**. Règles du tirage :
  - **« Omnivore » ne filtre rien.** C'est l'absence de contrainte, et c'est le
    régime par défaut : le traiter comme un label rendrait une semaine vide à
    tous ceux qui n'ont pas coché « omnivore » sur leurs recettes.
  - **Chaque service pioche dans sa catégorie** (`starter` / `main` / `dessert`).
    Le plat accepte aussi les recettes **sans catégorie** ; les boissons,
    petits-déjeuners et bases ne sortent jamais.
  - **Pas de doublon tant que la bibliothèque tient**, puis on recycle dans le
    même ordre — le compteur du bouton a promis N repas, il en pose N.
  - Un service dont le pool est vide **n'est pas rempli au hasard** : il remonte
    dans `emptyCourses`, et le bilan le dit.
  - **« Vider » n'efface que ce que le tirage a posé**, jamais un repas choisi à
    la main : `fillTrace` garde la trace du dernier tirage, pour la semaine
    affichée et le temps de la session.
  - Les préférences (régime / services / filtres / règles) sont **persistées**
    en localStorage (`mrd-meal-fill`) ; portée et état ouvert/fermé sont
    éphémères.

### Import de recettes depuis une URL

Deux appels successifs vers le codebase Python (`functions-py/main.py`), via
`providers/clientRecipes.js` :

1. `scrape_recipe` — extraction par `recipe-scrapers`, timeout client 65 s.
   Garde SSRF : `_assert_public_http_url` refuse les adresses privées.
2. `categorize_recipe` — catégorisation par l'API Anthropic (catégorie, régime,
   contraintes, rapide, saisonnalité, ingrédients normalisés), timeout 125 s.

`importErrorMessage(error)` traduit les codes en messages français.

### Mémoire produit — logique commune

`utils/productUtils.js` est le point central, partagé entre inventaire, listes
et ingrédients de recettes. But : détecter les produits déjà connus, proposer
des suggestions, limiter les doublons (singulier/pluriel, accents, variations
proches). **Ne pas réintroduire de comparaison sur le texte brut.**

### Notes, pense-bête, historique

- Notes : visibilité `private` / `shared` (avec `sharedWith`) / `household`.
- Pense-bête (`inbox`) : capture rapide en une ligne, puis dispatch vers tâche,
  événement ou note. Pas de chips de type à la saisie.
- Historique : flux trié par jour, cartes par personne, plafonné à **400
  entrées** dans `normalizeState`.

### Premium

`PREMIUM_TABS = ["meals", "inventory", "recipes"]`. Sans premium, ces trois
onglets affichent `PremiumLockScreen`. Le déblocage est **au niveau du foyer**
(`setFamilyPremiumOverride`), pas de l'utilisateur.

### Simulation temporelle

Le projet a un mode de date simulée, piloté depuis les Réglages (section
« Données », réservée au compte développeur). **Ne pas ajouter de `new Date()`
direct dans une logique métier sans passer par `utils/date.js`** —
`getCurrentAppDate()`, `getCurrentAppTimestamp()`, `localDateKey()`, etc.

---

## 9. Notifications — deux systèmes distincts

### 1. Rappels locaux (app au premier plan)

`hooks/useTaskNotifications.js` + `AgendaView.js`, via l'adaptateur
`plugins/notifications.js` (web `Notification` / natif
`@capacitor/local-notifications`). Vérifications périodiques toutes les 30–60 s
**quand l'app est au premier plan**. Rattrapage sur `visibilitychange`.

### 2. Push serveur (app fermée)

`functions/index.js` → FCM → `hooks/usePushMessaging.js`.

`sendScheduledNotifications` tourne **toutes les 5 minutes** (fuseau
Europe/Paris, comparaison d'heure locale naïve) : lit tous les foyers, cherche
les événements d'agenda et les tâches dus dans la fenêtre de 5 min, envoie via
l'Admin SDK. Anti-spam par `serverNotificationLog` (clés expirées à 3 jours,
nettoyées à chaque passage).

### La déduplication entre les deux canaux

Les deux canaux s'ignoraient → doublon possible app ouverte. La fonction saute
désormais tout rappel dont la clé cliente figure déjà dans le planner
(`notification.sentKeys` pour l'agenda, `task.notificationLog` pour les tâches)
— **5 gardes** : agenda ponctuel, agenda récurrent, fin de journée, urgent,
échéances. **App ouverte = local seul** (plus précis) ; **app fermée = push
seul**.

`AgendaView.js` a en plus un `Set` de session (`_agendaSentThisSession`) contre
les doublons quand `focus` et `visibilitychange` se déclenchent ensemble avant
que l'état React se propage.

### Cloud Functions — inventaire

**`functions/` (Node 20, codebase `default`, 934 lignes)**

| Fonction | Déclencheur |
|---|---|
| `sendScheduledNotifications` | `onSchedule`, toutes les 5 min |
| `onMemberJoined` | `onDocumentCreated` sur `joinEvents` |
| `onMemberRemoved` | `onDocumentDeleted` sur `members` |
| `onTaskCreated` | `onDocumentUpdated` sur le planner |
| `onTaskAssigned` | `onDocumentUpdated` sur le planner |
| `acceptInvitation` | `onCall` |
| `requestPasswordReset` | `onCall` — génère le lien et écrit dans `mail/` (extension « Trigger Email ») |

**`functions-py/` (Python 3.13, codebase `recipes`, 357 lignes)**
`scrape_recipe` et `categorize_recipe`, en `europe-west1`, `on_call`.
Dépendances : `recipe-scrapers`, `anthropic`, `requests`.

### Push natif

`messaging.js` branche `@capacitor/push-notifications` en natif :
`syncPushToken` (permission + `register()` + attente du token, timeout 15 s),
`bindForegroundPushMessages` (réception + tap, payload normalisé au format FCM
web), `clearPushToken` (`unregister()`). Les tokens natifs se stockent dans les
**mêmes** documents Firestore, et `sendEachForMulticast` fonctionne tel quel (le
bloc `webpush` est ignoré par APNs/Android).

⚠️ **Le relais APNs dans `ios/App/App/AppDelegate.swift` est indispensable.**
`@capacitor/push-notifications` n'écoute pas iOS directement : son `load()`
observe `capacitorDidRegisterForRemoteNotifications` sur le NotificationCenter,
et c'est à l'AppDelegate de poster cette notification depuis
`didRegisterForRemoteNotificationsWithDeviceToken`. Sans ce relais la chaîne
casse **en silence**. Les deux méthodes ont été ajoutées le 23 août 2026 ;
**reste à valider sur iPhone physique** (pas de push en simulateur).

---

## 10. Thème et système de couleurs

- **`src/theme/styles.css`** (~7 800 lignes) — un seul CSS global. Le bloc
  DESIGN TOKENS en tête définit les `--mrd-*` en `oklch()`, avec un pendant
  sombre. **Aucune couleur ne doit être écrite ailleurs que dans ce bloc et son
  pendant.** Garde : `tests/unit/design-tokens.test.js`.
- **`src/theme/ionic-bridge.css`** (159 lignes) — branche les `--ion-*` sur les
  `--mrd-*`. **Règle absolue : aucune valeur littérale ici.** Pas un `#`, pas un
  `oklch()`, pas un `rgb()` — uniquement des `var(--mrd-*)`. Comme les `--mrd-*`
  basculent déjà sous `html[data-theme="dark"]`, ce fichier bascule avec eux et
  n'a pas de pendant sombre.
- **Import CSS Ionic minimal et volontaire** : uniquement
  `@ionic/react/css/core.css` et `palettes/dark.class.css` (gardée pour ses 42
  `--ion-*-step-*`). **On n'importe pas** `normalize.css`, `structure.css`,
  `typography.css`, `display.css` : `styles.css` a son propre reset et sa propre
  typographie, les charger écraserait la mise en page partout.
- **Le thème s'écrit en un seul endroit** : `utils/theme.js` pose `data-theme`
  **et** la classe `.ion-palette-dark` ensemble. Un script inline dans
  `index.html` fait la même chose **avant le premier paint**, sinon une app en
  sombre commence par un flash clair.
- **Polices auto-hébergées** : Cormorant Garamond 700 + DM Sans variable
  (latin, woff2 dans `src/assets/fonts/`). Plus aucune requête
  `fonts.googleapis.com`.
- **`setupIonicReact({ mode: "ios" })`** — mode `ios` forcé sur les deux
  plateformes. Le design maison (chaud, arrondi, feutré) est beaucoup plus proche
  du rendu `ios`, et un seul mode veut dire un seul rendu à vérifier. Ne pas
  repasser en adaptatif sans revoir toutes les captures.

### Le piège de cascade qui explique la plupart des surprises Ionic

**Les styles par composant d'Ionic sont injectés à l'exécution dans un `<style>`
du `<head>`, donc APRÈS `styles.css`. À spécificité égale, Ionic gagne
toujours.**

Exemple mesuré : `.notes-search-input { height: 38px }` (0,1,0) perd contre
`.sc-ion-searchbar-ios-h` (0,1,0) → hauteur 60 px au lieu de 38.
`ion-searchbar.notes-search-input` vaut (0,1,1) et passe devant.

C'est pour ça qu'Ionic veut qu'on passe par ses variables partout où il en
expose : elles sont lues *par* son CSS au lieu de lutter contre lui.
**Ne jamais forcer un composant Ionic au `!important` depuis `styles.css`** —
passer par ses variables, dans `ionic-bridge.css`.

Cas particuliers connus :
- `ion-searchbar` est un composant **scoped**, pas shadow : il n'expose **aucun**
  `::part()` (un `::part(native)` écrit par analogie est silencieusement
  inerte), mais son balisage interne est dans le light DOM, donc accessible par
  sélecteur ordinaire.
- **Ne pas poser `::part(scroll) { position: relative }`** sur `ion-content` : le
  conteneur de défilement d'Ionic est en `position: absolute; inset: 0`, il
  fournit déjà le bloc conteneur dont les overlays ont besoin. Le passer en
  `relative` le fait se dimensionner sur son contenu — lui-même en absolu →
  hauteur nulle. C'est ce qui a rendu la fiche recette **entièrement vide**
  pendant deux phases.

### Zones sûres — le trou d'outillage à connaître

**Chrome headless n'expose aucun inset.** `env(safe-area-inset-*)` vaut 0, donc
les 57 captures de non-régression étaient toutes « IDENTIQUE » alors que trois
défauts de zone sûre étaient actifs sur device.

**Toute question de marge haute ou basse se vérifie avec
`tests/screenshots/safe-area.mjs`**, qui force de vrais insets par CDP
(`Emulation.setSafeAreaInsetsOverride`, iPhone 15 : 393×852, insets 59/34) et
**mesure la géométrie** au lieu de comparer des pixels.

Les trois défauts corrigés le 23 août, et leur cause :

1. **Barre d'onglets écrasée** — Ionic pose la safe area en `padding-bottom` sur
   le `:host` de `ion-tab-bar`, mais le reset `* { padding: 0 }` de `styles.css`
   matche l'élément hôte, et **un style d'auteur sur l'hôte bat `:host`**, quelle
   que soit la spécificité (l'arbre extérieur l'emporte).
2. **Accueil et Repas collés à l'heure du téléphone** — `renderPageHeader`
   renvoie `null` pour accueil, listes, repas premium et recettes. Les pages
   **à** en-tête reçoivent l'inset via le `padding-top` qu'Ionic met sur
   `ion-header` ; celles sans en-tête n'avaient rien. Correctif sur la **page**
   (`.mrd-ion-page:not(:has(> ion-header))`) et non sur `--padding-top`
   d'`ion-content`, que la règle `:has(.mrd-home)` écrase.
3. `.mrd-shell` porte bien `padding-top: env(safe-area-inset-top)`, mais **il ne
   protège pas les écrans de l'outlet** : leurs `.ion-page` sont en
   `position: absolute` et ne se calent pas sur sa boîte de padding. Il protège
   en revanche tout ce qui est hors outlet et dans le flux normal (réglages,
   connexion, onboarding) — ce qui explique pourquoi ces écrans n'ont jamais eu
   le problème.

---

## 11. Les autres documents, et leur fiabilité

| Fichier | Lignes | Fiabilité | Contenu |
|---|---|---|---|
| **`AGENT.md`** (ce fichier) | — | à jour | Point d'entrée. Structure, fonctionnalités, invariants. |
| `docs/ARCHITECTURE.md` | 340 | ✅ à jour | Modèle d'exécution, flux de données, collections, routage, tests. **À mettre à jour à chaque changement structurel.** |
| `docs/PROJECT_LOG.md` | 2765 | ✅ à jour | **Mémoire longue.** Journal daté de chaque chantier, avec les causes réelles des bugs. La ressource la plus précieuse du dépôt pour comprendre *pourquoi* le code est comme ça. |
| `docs/MIGRATION_IONIC.md` | 918 | ✅ à jour | Migration Ionic : décisions D1–D5, 9 phases, pièges de cascade, bilan. Phase 9 (gains natifs) non entamée. |
| `docs/TODO_NATIF.md` | 229 | ✅ à jour | Portage iOS/Android : ce qui reste, actions manuelles pour Steve, audits. |
| `README.md` | 163 | ✅ à jour | Présentation, démarrage, tests, conventions, index de la doc. Réécrit le 23 août 2026 : il **ne duplique plus** l'inventaire des fichiers (c'était la source de la dérive) et renvoie ici pour le détail. |
| `scripts/README.md` | ~120 | ✅ à jour | Table complète des commandes npm, secrets requis, prérequis Android. |
| `tests/screenshots/README.md` | — | ✅ | Mode d'emploi de la garde visuelle. |

**Ce que ça veut dire pour toi :** si `README.md` contredit ce fichier, **ce
fichier gagne** — et si tu constates l'inverse (que c'est ce fichier qui a
tort), corrige-le et note-le en §12.

### Trois documents supprimés le 23 août 2026

`docs/AGENT.md`, `docs/PROJECT_MAP.md` et `docs/DEV_NOTES.md` ont été
**supprimés** : ils décrivaient une carte partiellement fausse du projet, et
trois documents concurrents sur le même sujet valent moins qu'un seul juste.
Tout ce qu'ils contenaient d'exact vit désormais dans ce fichier — règles
produit en §8, pièges de test en §14, zones sensibles et réglages Firebase à ne
pas retoucher en §15.

Deux de leurs affirmations étaient **fausses** et ne sont donc pas reprises ;
c'est noté ici pour que personne ne les ressuscite depuis l'historique git :

- « les tests CDP écrivent un `e2e-onboarding.html` à la racine du projet » —
  plus le cas. L'infrastructure e2e passe par un vrai build Vite avec
  substitution des bouchons Firebase par `resolve.alias`
  (`tests/helpers/e2e-build.js`). Aucun fichier n'est posé à la racine, il n'y a
  rien à nettoyer à la main.
- « les recettes ne garantissent pas encore de recalcul automatique par
  portions » — le recalcul existe (voir §8), mais il est d'**affichage
  seulement**. C'est plus précis que « pas encore fait », et la nuance est celle
  qui compte.

Ce que ce fichier ne remplace pas : `docs/PROJECT_LOG.md` reste la mémoire
longue, et il cite ces trois fichiers dans ses entrées passées — **c'est
normal, c'est un journal historique, ne le réécris pas.**

---

## 12. Journal des mises à jour de ce fichier

| Date | Par | Changement |
|---|---|---|
| 2026-08-23 | agent (analyse initiale) | Création. Analyse complète du projet à `4300b3e` sur `feat/ionic` : arborescence, 90 fichiers `src/`, modèle de données, routage, boot, règles produit, notifications, thème. Suite de tests lancée et vérifiée : 213 pass / 0 fail / 0 skipped. Relevé les écarts de `docs/PROJECT_MAP.md`, `docs/DEV_NOTES.md`, `README.md` et `docs/AGENT.md` (§11). Identifié `components/Header.js` comme fichier mort, en plus de `FamilyPanel.js`. |
| 2026-08-23 | agent | Suppression de `docs/AGENT.md`, `docs/PROJECT_MAP.md` et `docs/DEV_NOTES.md` (demande de Steve). Contenu exact replié ici avant suppression : sections de réglages (§6), mise à l'échelle par portions et réutilisation de la carte tâche côté calendrier (§8). Deux affirmations de `DEV_NOTES` vérifiées **fausses** et écartées, documentées en §11 pour éviter qu'on les ressuscite. `README.md` garde deux renvois vers l'ancien `AGENT.md` (l. 25 et 251) — Steve s'en occupe. |
| 2026-08-25 | agent | Feuille « Remplir la semaine » refaite d'après le handoff design (`design_handoff_remplir_semaine`) : segmented control de régime, chips de services, chips de filtres, menu de règles alimentaires, portée + CTA. Mis à jour ici : tailles de `mealFill.js` (105 → 180), `storage.js` (96 → 134) et `MealsView.js` (878 → 1066), plus six invariants de tirage ajoutés en §8. Changements de comportement volontaires, non couverts par l'ancien code : « omnivore » ne filtre plus rien, chaque service pioche dans sa catégorie, le tirage recycle sa bibliothèque au lieu de s'arrêter, et « Vider » efface les repas tirés au lieu de remettre les filtres à zéro. 98 tests unitaires verts, build Vite OK. |
| 2026-08-23 | agent | `README.md` réécrit (254 → 163 l.). Corrigés : chemins Windows d'une machine précédente, lancement `npx serve`/`python -m http.server` (faux — l'app a besoin de Vite), `.claude/launch.json` inexistant, bloc PowerShell `run-tests.ps1`, et **trois commandes de test avec un flag invalide** (`--test-isolation=none` → `node: bad option` ; le vrai est `--experimental-test-isolation=none`). Supprimée la section « Cache busting » qui contredisait le même fichier 175 lignes plus haut. L'inventaire des fichiers a été retiré du README plutôt que corrigé : le dupliquer ici est ce qui l'avait périmé. |
| 2026-08-23 | agent | **`App.js` dégraissé : 1890 → 1526 l. (−19 %), 28 → 7 handlers métier.** 5 hooks créés (`useMealCooking` 241 l., `usePlannerData` 101, `useInbox` 92, `useAppTime` 92, `useNotes` 46) ; condiments rapatriés dans `useMeals`, `handleReorderStorageLocations` dans `useLists`. `computeMealCookState` et `deductionToastMessage` sont désormais purs et exportés, donc testables : **16 tests ajoutés** (`tests/unit/meal-cooking.test.js`), un par règle produit de §8 — suite passée de 213 à **229 pass / 0 fail / 0 skipped**. Non extraits volontairement : `handleSetActivePerson` / `handleSetDeviceMode`, voir §15. Sections §4, §14, §15, §16 mises à jour. |
| 2026-08-28 | agent | **Fusion de `605a33b` (dégraissage d'`App.js`) et `e34ed54` (chargement paresseux des vues).** Un seul conflit, le bloc d'imports d'`App.js` : les deux commits l'avaient restructuré pour des raisons opposées — eux pour poser 12 `lazy()`, moi pour retirer les imports partis dans `useMealCooking`. Résolu en gardant leur bloc `lazy`/`Suspense` et en y appliquant mes retraits. Les deux jeux de changements sont complémentaires (coque vs métier), vérifiés présents des deux côtés. Suite : **234 pass / 0 fail / 0 skipped**. Corrigé au passage deux faits devenus faux : l'en-tête, et §16 qui listait encore le code-splitting comme dette alors que `e34ed54` venait de le faire. À noter : `node_modules` avait disparu du poste (`vite: command not found`), réinstallé par `npm ci` — sans rapport avec la fusion. |

---

## 13. Commandes

### Développement

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur Vite (port 5173, ou `$PORT`) |
| `npm run build` | Build prod dans `dist/` — déclenche `prebuild` |
| `npm run prebuild` | Génère `src/assets/build-info.json` (version, build, date, commit) |
| `npm run preview` | Sert le `dist/` buildé |
| `npm run icons` | Régénère les icônes iOS et Android depuis la marque (requiert ImageMagick) |

### Natif

| Commande | Effet |
|---|---|
| `npm run cap:sync` | Build + `cap sync` (iOS + Android) |
| `npm run build:ios:fast` / `build:android:fast` | Build + `cap copy` + ouvre l'IDE — **à utiliser au quotidien** |
| `npm run build:ios` / `build:android` | Build + `cap sync` complet — **seulement après ajout/mise à jour d'un plugin** |
| `npm run build:ios:clean` | + `pod deintegrate && pod install` |
| `npm run device:ios` / `device:android` | Lance sur un device branché (live reload externe) |

### Tests

| Commande | Effet |
|---|---|
| `npm test` | Unitaires + e2e |
| `npm run test:unit` / `test:e2e` / `test:standalone` | Sous-ensembles |
| `npm run test:release` | Garde-fou avant release : tests + build prod |

### Firebase

| Commande | Effet |
|---|---|
| `npm run emulators:start` | Émulateurs avec import/export de `.firebase-emulator-data` |
| `npm run free-emulators-ports` | Libère les ports après un Ctrl-C brutal (ne tue que java/node/firebase) |
| `npm run deploy` | Build + deploy complet |
| `npm run deploy:hosting` / `:functions` / `:rules` / `:indexes` | Ciblé |
| `npm run deploy:functions:recipes` | Codebase Python uniquement |

### Release stores

```bash
npm run releases          # 1. bump interactif version + build
npm run prepare:releases  # 2. build + cap sync + versions natives + AAB
npm run archive:ios       # 3a. archive Xcode + upload App Store Connect
npm run upload:android    # 3b. upload de l'AAB sur Google Play
```

`package.json` porte deux champs pilotés par ces scripts : `version` →
`MARKETING_VERSION` / `versionName` ; `build` → `CURRENT_PROJECT_VERSION` /
`versionCode`.

Secrets requis, tous dans `.gitignore` : `.env.ios` (`archive:ios`),
`.env.android` (`upload:android`), `android/keystore.properties` (signature de
l'AAB). Sans `keystore.properties`, l'AAB est produit **non signé** : build OK,
upload Play impossible. `upload:android` nécessite `npm i -D googleapis`.

Prérequis Android : `android/local.properties` (`sdk.dir=…`) et JDK 17+. Pour
forcer un JDK, le déclarer dans `~/.gradle/gradle.properties`, **jamais** dans
`android/gradle.properties` (versionné et partagé entre OS).

---

## 14. Tests — comment ils marchent et comment ils mentent

```
npm test          # unitaires + e2e
```

État au 28 août 2026, vérifié : **234 pass · 0 fail · 0 skipped**, en 7 min 40 s
(la lenteur est normale : chaque suite e2e refait un build Vite et pilote un
Chrome headless). Les `0 skipped` sont la partie importante — voir les trois
pièges ci-dessous.

**Runner : `node:test`** (intégré à Node), pas Jest ni Mocha. Les suites e2e
pilotent un Chrome headless par CDP sur un **vrai build Vite** où Firebase est
remplacé par les bouchons de `tests/fixtures/firebase-stubs/` (substitution par
`resolve.alias`, voir `tests/helpers/e2e-build.js`).

### Suites

**Unitaires** (`tests/unit/`, agrégées par `tests/unit.test.js`) :
`product-utils`, `recipe-stock`, `stock-merge`, `meal-fill`, **`meal-cooking`**,
`date-utils`, `state`, `firebase-config`, `families`, `multi-family-source`,
`design-tokens`, `routes`, `structure`.

**E2E** (`tests/e2e/`, agrégées par `tests/e2e.test.js`) : `app.smoke`,
`auth.standalone`, `profile-creation`, `navigation`, `tasks`, `ionic-theme`,
`settings-routes`.

**Garde visuelle** : `tests/screenshots/` — `capture.mjs`, `compare.mjs`,
`seed.mjs`, `shift.mjs`, `safe-area.mjs`. `baseline/` (43 fichiers) est
versionnée ; les dossiers par phase sont régénérables (~6 Mo chacun) et hors
dépôt.

### ⚠️ Trois façons dont la suite peut passer sans rien vérifier

1. **Les sections CDP se skippent silencieusement** si aucun navigateur n'est
   trouvé — la suite affiche « 0 fail » sans avoir rien testé. Les chemins sont
   dans `tests/helpers/cdp-browser.js`. **Vérifier le compteur `skipped` : il
   doit être à 0.**
2. **Un fichier posé dans `tests/unit/` ne tourne pas tout seul** : il doit être
   importé par `tests/unit.test.js` (idem `tests/e2e/` → `tests/e2e.test.js`).
   `tests/unit/routes.test.js` est resté **douze tests morts** entre la phase 5
   de la migration et le refactor de structure pour cette raison. **Après avoir
   ajouté un fichier de test, vérifier que le compteur `# tests` a bougé.**
3. **Chrome headless n'a aucun inset** : les captures sont aveugles aux marges
   système. Voir §10.

### Pièges d'écriture de tests

- **Les modales Ionic s'animent** (~300 ms à l'ouverture comme à la fermeture),
  là où les overlays maison apparaissaient d'un coup. **Ne jamais utiliser de
  `setTimeout` fixe** : utiliser `pollUntilGone` / `pollForProp` /
  `pollForSelector`. Des assertions à délai fixe passent seules et échouent dans
  la suite complète.
- `pollForSelector(".task-modal-redesign")` réussit **trop tôt** : l'hôte
  `ion-modal` entre dans le DOM dès son montage, mais Ionic ne rend son contenu
  qu'à la présentation. **Attendre le champ, pas la modale.**
- **Les inputs rendus par HTM sont contrôlés** : simuler une saisie via le setter
  `HTMLInputElement.prototype.value` + un événement `input` **ne met pas
  fiablement à jour l'état**. Préférer cliquer un élément qui appelle un setter
  (une puce de suggestion, par exemple).
- **`pushState` + `popstate` synthétique contourne le routeur** au lieu de le
  piloter, et simule un état inatteignable (en WebView il n'y a pas de barre
  d'adresse, et le retour matériel ne revisite que des entrées enregistrées).
  Technique déjà notée comme peu fiable. Préférer descendre l'invariant au
  niveau unitaire quand c'est possible — c'est ce qui a été fait pour
  `settingsStateFromPath`.
- `EBUSY` à la fermeture de Chrome est **bénin** (Chrome garde ses fichiers
  SQLite après `kill()`). Envelopper `browserHandle.close()` dans un try/catch.
- Les bouchons Firebase doivent exporter **tous** les symboles importés par
  `client.js`, sinon le navigateur lève une `SyntaxError` avant que React monte.

### Pièges d'outillage constatés

- **`[^>]*` ne franchit pas une flèche `=>`** : un convertisseur qui cherche la
  fin d'une balise ainsi coupe au milieu de `onClick=${(e) => e.stopPropagation()}`.
  Idem pour `[^}]+`, qui s'arrête au premier `}` et tronque les fonctions
  multi-lignes. Utiliser un scan de profondeur d'accolades.
- Un build vert et des accolades équilibrées **ne prouvent rien** : 348 lignes de
  CSS ont été supprimées par erreur dans ces conditions (phase 6), attrapées
  seulement par les captures.

---

## 15. Zones sensibles — relire avec attention

| Fichier | Pourquoi |
|---|---|
| `hooks/useLists.js` (662 l.) | **Le plus risqué.** Liste de courses, liaison inventaire optionnelle, bascule d'achat, toast d'annulation, règles de fusion, envoi inventaire → courses. Endroit facile pour une régression de doublon, de quantité ou de course. |
| `App.js` (1526 l.) | Orchestrateur. **Dégraissé le 23 août 2026** : 364 lignes et 21 handlers métier partis dans 5 hooks. Ce qui reste est de la coque — 6 fonctions de rendu et le câblage. Il subsiste 7 handlers, dont 4 volontairement : `handleNotifPopupNavigate` (navigation pure), `handleDismissStaleTaskAlert` / `handleMoveStaleTaskToPeriod` (adaptateurs de 2 lignes entre `useStaleTaskAlerts` et `useTasks`), `handleClearHistory` (3 lignes, aucun hook d'accueil naturel — en créer un pour ça serait pire). |
| `App.js` — `handleSetActivePerson` / `handleSetDeviceMode` | **Non extraits, délibérément.** Leurs effets de bootstrap (l. ~445-495) dépendent de `linkedPerson`, `appPeopleRaw` et `currentFamilyId`, qui arrivent de façon asynchrone depuis `useAuth` ; `activePersonId` est par ailleurs lu à ~15 endroits du rendu. Les déplacer veut dire déplacer ces effets, sans aucune couverture de test dessus. À faire avec un filet, pas au passage. |
| `pages/meals/MealsView.js` (878 l.) | Liaison repas/inventaire, popup des manquants, états `Prep`/`OK`, faisabilité à l'échelle de la semaine. |
| `pages/recipes/RecipesView.js` (1186 l.) | Création/édition de recette, ingrédients structurés, condiments, saisonnalité, badges, import URL. L'UI a changé plusieurs fois — **ne pas réintroduire l'ancienne logique de condiments**. |
| `pages/tasks/TasksView.js` (1434 l.) | Glisser-déposer et modale de tâche très custom : appui long, carte fantôme, repère d'insertion, déclencheurs ouvrir/créer. Facile à casser. |
| `providers/clientFamily.js` (776 l.) | Toutes les opérations de foyer. `joinFamily()` est un **pur alias** de `acceptHouseholdInvitation()` — ne pas maintenir les deux séparément. |
| `providers/core.js` | Le **seul** endroit où `initializeApp()` est appelé. |
| `utils/state.js` (773 l.) | Migrations de compatibilité et resets. Une erreur ici corrompt les données de tous les foyers. |
| `hooks/useAuth.js` (936 l.) | Boot, gardes, multi-foyers, `heldNullAuthState`. |

### Réglages Firebase à ne pas retoucher

- **`experimentalForceLongPolling` reste forcé.** L'essai
  `experimentalAutoDetectLongPolling` a été **annulé le 9 août 2026 — ne pas
  retenter.** En WKWebView les streams WebChannel échouent et l'auto-détection
  met 30–60 s à basculer : constaté sur device, ~1 min bloqué sur
  « créer/rejoindre un foyer » après login.
- **Persistance auth** : `indexedDBLocalPersistence` avec repli
  `browserLocalPersistence` (localStorage est purgeable par iOS).
- Firestore `persistentLocalCache()` — hors ligne OK.
- Le repli 6 s de `useAuth` **ne promeut plus** un profil provisoire **sans
  foyer** (il routerait vers créer/rejoindre, avec risque de foyer en doublon).

### Ce qu'il ne faut pas casser

Auth Firebase et bootstrap de foyer · synchro Firestore du planner · logique
famille/profils · mode simple vs avancé pour repas et listes · historique ·
simulation temporelle · normalisation produit et prévention des doublons ·
comportement de reset des tâches récurrentes · flux redirect Google en PWA iOS ·
liaison inventaire optionnelle.

---

## 16. Ce qui reste ouvert

### 🔴 Validation sur device — rien du natif n'est vérifié

C'était déjà le constat de `TODO_NATIF.md` avant la migration Ionic, et ça n'a
pas changé.

- iOS : connexion Google, notifications locales, permission, barre de statut en
  thème sombre.
- Android : connexion Google (SHA-1 debug déclarée le 8 août), **bouton retour
  (réécrit en phase 5)**, notifications.
- **Push de bout en bout : iPhone physique requis** (pas de push en simulateur).
  Le relais APNs ajouté le 23 août n'a jamais reçu de token.
- **Geste de retour iOS** : vérifié en headless seulement.
- **Comportement du clavier** sur les formulaires (connexion, ajout de tâche,
  modales de recette). Installer `@capacitor/keyboard` **seulement si** un
  problème est constaté.

### 🟠 Fonctionnalités et dette

- ~~**Code-splitting par route.**~~ **Fait le 27 août 2026** (commit `e34ed54`).
  Deux mécanismes complémentaires, à ne pas confondre :
  - **chargement paresseux des vues** (`App.js`) — 12 vues passent par `lazy()`
    + `Suspense`. `HomeView` et `AuthScreen` restent statiques **exprès** : ce
    sont les deux écrans d'arrivée, les rendre paresseux ajouterait une attente
    au démarrage au lieu d'en retirer une.
  - **découpage des dépendances** (`vite.config.js`, `manualChunks`) —
    `vendor-ionic`, `vendor-firebase`, `vendor-react` séparés du code applicatif.
    Le total téléchargé est le même ; ce qu'on gagne est le cache navigateur
    (une correction d'une ligne n'invalide plus 2,5 Mo) et le téléchargement
    parallèle.

  Mesuré après fusion : **35 chunks, 2 711 kB au total**, mais le point d'entrée
  ne fait plus que **274 kB** (contre 2 525 kB en un seul bloc). `vendor-ionic`
  1 182 kB, `vendor-firebase` 582 kB, `vendor-react` 158 kB, puis une vue par
  chunk (`SettingsView` 80 kB, `RecipesView` 57 kB…). Le total **augmente** de
  ~190 kB — c'est le prix des frontières de modules, et il est payé une fois
  contre un démarrage bien plus léger.
- **Finir de dégraisser `App.js`.** Fait en grande partie le 23 août 2026
  (1890 → 1526 l., 21 handlers déplacés). Restent `handleSetActivePerson` et
  `handleSetDeviceMode`, laissés exprès : voir §15 pour la raison. Le préalable
  est une couverture de test sur leurs effets de bootstrap.
- **Notifications programmées à la création** de l'événement
  (`LocalNotifications.schedule({ at: date })`) pour qu'elles sonnent app fermée.
  Refactor plus lourd : annulation/reprogrammation à chaque édition.
- **Phase 9 Ionic, non entamée** (ce sont des *ajouts*, pas la migration) :
  `ion-refresher`, `ion-item-sliding` (glisser pour supprimer),
  `@capacitor/keyboard` + `ion-footer`, **deep links pour les invitations** (le
  routeur existe maintenant, la piste est réouverte).
- **Capacitor 6 → 8** : hors périmètre, noté comme dette. Chantier natif distinct
  (gradle, pods, plugins communautaires à revalider).

### 🟡 Divers

- `aps-environment` vaut `development` dans `ios/App/App/App.entitlements` — à
  passer en `production` pour l'App Store, ou laisser Xcode le faire à l'archive.
- Écart de cible connu : `vite.config.js` suppose Safari 14, mais
  `IPHONEOS_DEPLOYMENT_TARGET = 13.0`. Les WebView iOS 13.0–13.3 n'ont ni `??=`
  ni les champs de classe. Écart **préexistant** : le corriger veut dire monter
  la cible Xcode à 14.0, ou descendre à `safari13` et re-vérifier le bundle.
- `UIRequiredDeviceCapabilities: armv7` (valeur du gabarit Capacitor, obsolète
  depuis iOS 11) — laissé en l'état volontairement : le changer juste avant une
  release toucherait au filtrage d'appareils de l'App Store pour rien.
- Orientations paysage déclarées alors qu'aucun écran n'est dessiné pour le
  paysage. **Décision produit à trancher, pas à supposer.**
- **Keystore d'upload Android** (Steve) : à générer, remplir
  `android/keystore.properties`, ajouter la SHA-1 dans Firebase et régénérer
  `google-services.json`.

### Décisions tranchées — ne pas rouvrir sans raison

- **`<select>` et `<input type="date|time">` restent natifs.** Le plan de
  migration prévoyait `ion-select` et `ion-datetime` ; **écarté après examen** :
  dans une WebView Capacitor ces éléments ouvrent le **sélecteur natif du
  système** (roue iOS, calendrier Android), et les remplacer reviendrait à
  retirer un contrôle de plateforme pour y mettre du code — contre l'objectif
  « le moins de custom possible ». S'y ajoutent un changement de rendu
  substantiel et une conversion de format ISO, sur les formulaires les plus
  utilisés de l'app. Un rendu homogène iOS/Android reste faisable, mais c'est un
  **choix de design**, pas une exigence de la migration.
- **Pas de version ordinateur** (22 août 2026). Ne pas réintroduire de rendu
  bureau.
- **Le prototype design ne remplace pas la structure du projet.** Il sert de
  référence visuelle, appliquée sélectivement.

---

## 17. Méthode de travail attendue

1. **Lis d'abord.** Ce fichier, puis `docs/ARCHITECTURE.md` si tu touches à la
   structure ou à la navigation. Cherche l'entrée correspondante dans
   `docs/PROJECT_LOG.md` : le *pourquoi* d'un choix bizarre y est presque
   toujours écrit.
2. **Identifie le hook ou le composant réellement responsable du flux** avant de
   modifier. La logique inter-modules est parfois encore dans `App.js`.
3. **Corrige petit et local.** Réutilise les hooks et composants existants avant
   d'en créer de nouveaux.
4. **Garde les libellés utilisateur en français.**
5. **Teste mentalement les flux croisés** : recette → repas → liste ·
   liste → inventaire · inventaire → à racheter · tâche → calendrier ·
   invitation → foyer → profil lié.
6. **Lance `npm test`** (compte ~8 min) et vérifie que `skipped` est à 0 et que
   `# tests` a bougé si tu as ajouté un fichier de test. Référence : 234 pass.
7. **Pour une question de marge haute ou basse**, lance
   `tests/screenshots/safe-area.mjs` — les captures ordinaires sont aveugles.
8. **Mets ce fichier à jour** (§0) et consigne dans `docs/PROJECT_LOG.md`.
