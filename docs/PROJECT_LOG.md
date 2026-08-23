# PROJECT_LOG — Planning Famille (My Rolling Day)

---

## [2026-08-23] — Piles par onglet, zones sûres, audit natif iOS, icônes régénérées

Quatre signalements à l'usage sur device, plus un audit natif demandé. Les trois premiers avaient une cause commune : **rien dans l'outillage de test ne pouvait les voir**.

### Les onglets s'empilaient au lieu d'avoir une pile chacun

Symptôme : passer d'un onglet à l'autre empilait des pages, alors que COBA donne une pile de navigation par onglet.

La cause était une erreur de raisonnement de ma part, en phase 2 de la migration Ionic, documentée noir sur blanc dans `BottomNav.js` : j'avais retiré le `href` des boutons au motif qu'il ramènerait toujours l'onglet Tâches à sa racine et ferait perdre la période en cours. C'est faux, et le code d'Ionic le dit :

- `IonTabBar.getDerivedStateFromProps` réécrit le `currentHref` de l'onglet actif avec le chemin courant à chaque rendu ;
- `changeTab()` restaure ensuite la dernière route de l'onglet via `locationHistory.getCurrentRouteInfoForTab()`.

Ionic mémorise donc la période tout seul. Mon `onClick` réimplémentait en moins bien un comportement natif — et le prix était lourd : `IonTabBar` construit sa table d'onglets **depuis les `href`** de ses boutons. Sans eux, aucune route n'est rattachée à un onglet, `changeTab()` n'est jamais appelé, et les dix routes s'empilent dans une pile unique.

| Fichier | Changement |
|---|---|
| `src/app/routes.js` | **`TAB_ROOTS`** : la racine de chaque onglet, valeur de son `href`. `/tasks` et non `/tasks/daily` — `matchesTab()` fait une comparaison de préfixe, et le préfixe doit couvrir les quatre périodes sinon l'onglet ne s'allume pas sur `/tasks/weekly`. Route `/tasks` ajoutée à `ROUTE_PATHS` : sans elle le premier clic tombait sur le repli « * » et repartait sur l'accueil. |
| `src/app/components/nav/BottomNav.js` | `href=${TAB_ROOTS[id]}` sur les quatre onglets. « Plus » reste sans `href` : `handleChangeTab` sort sur `if (!path) return`, aucune navigation, et `onClick` ouvre la feuille d'actions. Prop `onChange` supprimée. |
| `src/app/App.js` | Route `/tasks`. `handleBottomNavChange` supprimé : il ne faisait que rouvrir la dernière période, ce qu'Ionic fait nativement. |

Mesuré après correction : revenir sur Tâches rouvre `/tasks/weekly` ; le nombre de `.ion-page` montées se stabilise à 5 et **n'augmente plus** (il croissait de 1 à chaque navigation) ; re-taper l'onglet actif le ramène à sa racine et fait retomber la pile à 4 — `resetTab`, comportement iOS standard. Verrouillé par `navigation.test.js [8]`, qui compte les pages de l'outlet plutôt que `history.length` (Ionic se sert de l'historique du navigateur comme journal : il croît dans les deux cas, il ne distingue rien).

### Deux défauts de zones sûres, et pourquoi 57 captures IDENTIQUE ne prouvaient rien

**Chrome headless n'expose aucun inset.** `env(safe-area-inset-*)` valait 0 partout, donc la garde visuelle de la migration ne pouvait rien voir — l'app ne tourne jamais dans ces conditions sur un téléphone. C'est le trou d'outillage, pas un oubli de relecture.

`Emulation.setSafeAreaInsetsOverride` (CDP) permet de forcer de vrais insets. D'où **`tests/screenshots/safe-area.mjs`** : iPhone 15 simulé (393×852, insets 59/34), et **mesure de la géométrie** plutôt que comparaison de pixels — où commence le premier élément peint, quelle hauteur utile reste aux boutons. Les aides d'onboarding de `capture.mjs` sont réutilisées plutôt que recopiées (le fichier est devenu importable, avec une garde d'exécution directe).

| Défaut | Cause | Avant → après |
|---|---|---|
| Barre d'onglets écrasée, boutons sur l'indicateur d'accueil | Ionic pose la safe area en `padding-bottom` sur le `:host` de `ion-tab-bar`. Le reset `* { padding: 0 }` de `styles.css` matche l'élément hôte — et **un style d'auteur sur l'hôte bat `:host`**, quelle que soit la spécificité (l'arbre extérieur l'emporte). L'ancienne barre maison posait `env(safe-area-inset-bottom, 6px)` à la main pour exactement cette raison ; la migration a supprimé le garde-fou en croyant qu'Ionic le remplaçait. | hauteur 51 → **87** px · `padding-bottom` 0 → **34** px · utile 51 → **53** px |
| Accueil et Repas collés à l'heure du téléphone | `renderPageHeader` renvoie `null` pour accueil, listes, repas premium et recettes. Les pages **à** en-tête reçoivent l'inset via le `padding-top` qu'Ionic met sur `ion-header` ; celles sans en-tête n'avaient rien. Correctif sur la **page** (`.mrd-ion-page:not(:has(> ion-header))`) et non sur `--padding-top` d'`ion-content`, que la règle `:has(.mrd-home)` écrase avec une spécificité supérieure. | premier élément à 0 → **59** px |

À noter : `.mrd-shell` porte bien `padding-top: env(safe-area-inset-top)`, mais il ne protège pas ces écrans — les `.ion-page` de l'outlet sont en `position: absolute` et ne se calent pas sur sa boîte de padding. Il protège en revanche tout ce qui est hors outlet et dans le flux normal (réglages, connexion, onboarding), ce qui explique pourquoi ces écrans n'ont jamais eu le problème.

### Audit natif iOS

Détail complet dans `docs/TODO_NATIF.md`. Un défaut bloquant, le reste conforme.

**🔴 Les push iOS ne pouvaient pas fonctionner.** `AppDelegate.swift` était resté le gabarit Capacitor d'origine. `@capacitor/push-notifications` n'écoute pas iOS directement : son `load()` observe `capacitorDidRegisterForRemoteNotifications` sur le NotificationCenter, et c'est à l'AppDelegate de poster cette notification depuis `didRegisterForRemoteNotificationsWithDeviceToken`. Sans ce relais la chaîne casse en silence — `register()` part, iOS répond, personne ne transmet, l'événement `registration` n'arrive jamais (`messaging.js:73`), aucun token FCM n'est stocké. Vérifié dans `PushNotificationsPlugin.swift` (observateur ligne 40, rejet ligne 126) et dans le README du plugin, pas déduit. Les deux méthodes ont été ajoutées ; **reste à valider sur iPhone physique**, seul moyen de voir arriver un token.

Conforme par ailleurs : entitlement `aps-environment`, schéma d'URL Google cohérent avec `iosClientId`, les quatre descriptions d'usage (dont micro et reconnaissance vocale qu'exige `speech-recognition`), Podfile aligné sur les 12 plugins, localisation `fr`. `UIBackgroundModes` **non requis** : les Cloud Functions envoient une charge `notification`, affichée par APNs sans réveiller l'app.

Deux points cosmétiques laissés en l'état volontairement : `UIRequiredDeviceCapabilities: armv7` (valeur du gabarit, obsolète mais sans effet — la changer avant une release toucherait au filtrage d'appareils pour rien) et les orientations paysage déclarées sans écran dessiné pour, qui est une décision produit.

J'ai aussi retiré deux items de la liste « vérifié comme déjà correct » de `TODO_NATIF` : « safe areas » n'avait jamais pu être vérifié, et « AppDelegate » était vrai pour `open url` tout en masquant l'absence du relais APNs.

### Le `href` a découvert un couplage, et deux trous d'hébergement

Ajouter le `href` a cassé un sous-test des réglages, et la cause vaut d'être connue : **une fois les onglets rattachés à des routes, le routeur d'Ionic acquiert un contexte d'onglet** et, sur un `popstate` vers un chemin que son outlet ne connaît pas, il normalise l'URL vers la racine. Isolé par bisection (`href=${undefined}` → 5/5, `href` → 4/5) et par instrumentation de `pushState`/`replaceState`.

Seul le sous-test qui posait le chemin avec `pushState` + un `popstate` **synthétique** en souffrait ; la navigation réelle passe. Cette technique contourne le routeur au lieu de le piloter — c'était déjà noté comme peu fiable pendant la migration — et elle simule un état inatteignable : en WebView il n'y a pas de barre d'adresse, et le retour matériel ne revisite que des entrées enregistrées.

`settingsStateFromPath` n'avait **aucune** couverture unitaire : ce test e2e était sa seule garde. L'invariant est donc descendu au niveau unitaire, où il est pur et fiable — section inconnue, sections déclarées dans les deux sens, pages de support, barre oblique finale, chemins hors réglages. Le sous-test e2e est remplacé par une note qui explique le déplacement plutôt que par un silence.

En cherchant à rendre le deep link testable, deux vrais défauts sont sortis :

| Fichier | Défaut |
|---|---|
| `netlify.toml` | **Aucun repli SPA.** Depuis que la migration donne une URL à chaque écran, un rechargement ou un lien partagé sur `/tasks/weekly` renvoyait la page d'erreur de Netlify. `firebase.json` avait déjà l'équivalent (`rewrites` `**` → `/index.html`). Règle ajoutée **après** les proxys `/__/auth/*` : Netlify applique la première qui matche, et un `/*` placé avant avalerait le callback d'authentification Firebase. |
| `firebase.json` | **Clé `emulators` en double.** En JSON la dernière gagne, et la seconde n'avait pas `hosting: 5002` — le port était silencieusement perdu. Doublon supprimé, bloc complet conservé. |
| `tests/helpers/static-server.js` | Renvoyait 404 sur tout chemin sans fichier : aucun test ne pouvait charger un deep link, et le 404 se lit comme une page blanche impossible à distinguer d'un bug de rendu. Repli SPA ajouté. Les requêtes visant clairement un fichier (avec extension) gardent leur 404 — sinon un `.js` manquant se déguiserait en erreur de syntaxe. |

À noter : le chargement à froid d'un deep link reste non testé, les bouchons Firebase étant en mémoire sans persistance — un rechargement repart sur l'onboarding. C'est la limite du banc, pas de l'app.

### Un angle mort de la garde visuelle, et une affirmation à corriger

En vérifiant l'impact visuel des correctifs, deux captures divergeaient. Aucune n'était une régression :

- `meals` : décalage **uniforme** de −2 px CSS, mesuré par corrélation avec `shift.mjs` — exactement les 2 px gagnés par la barre d'onglets. L'écran est dense en filets et lignes de texte, donc un décalage uniforme allume 11 % des blocs sans que rien ne bouge dans la mise en page.
- `modal-task-create` : 0 px de décalage mais 6 à 10 % d'écart. En regardant, la cause est le comportement voulu — re-taper l'onglet actif le ramène à sa racine, donc « Aujourd'hui » au lieu de « Mes tâches ».

Mais en regardant cette capture j'ai vu autre chose : **elle ne montrait pas de modale**. Ni dans le jeu d'avant, ni en phase 8, ni en phase 7 où je l'avais ajoutée. Deux défauts se cachaient l'un derrière l'autre :

1. Dans `gotoScreen`, la branche `tab` **n'appelait pas** `openOverlay`, alors que la branche `quick` juste au-dessus le fait. Le FAB n'était donc jamais cliqué. Simple omission.
2. Le sélecteur `ready` acceptait `ion-modal` tout seul. `MrdModal` garde son `IonModal` monté en permanence et bascule `isOpen` : l'hôte est dans le DOM **même modale fermée**. La vérification était donc toujours vraie.

C'est le second qui a masqué le premier pendant trois phases. Les cinq sélecteurs de modale avaient ce repli, et `dismissModal` aussi — il croyait une modale ouverte en permanence et appelait `dismiss()` sur le premier `ion-modal` du document, pas sur celui affiché. Tout est resserré, avec la raison écrite au-dessus de la table des écrans.

**Cela corrige une affirmation de ma clôture de migration** : j'y écrivais que les cinq captures de modale garantissaient la conversion des overlays. Pour `modal-task-create`, c'était faux — elle photographiait l'écran des tâches. Après correction, la comparaison donne 54 `IDENTIQUE` et exactement les 3 captures `modal-task-create` modifiées : la modale « Nouvelle tâche » y apparaît enfin.

### Icônes

L'image demandée était **déjà** l'icône des deux plateformes. Le seul écart réel était l'échelle : le motif occupait 59,6 % de l'icône sur iOS, 68 % sur l'icône héritée Android, et 46 % de la zone visible de l'icône adaptative — visiblement plus petit sur un écran d'accueil Android.

J'avais d'abord surestimé cet écart (« un quart de ce qu'il faudrait ») en regardant le canevas adaptatif complet, marge de masquage comprise. Mesures faites : 132 px de motif là où la parité avec iOS en demande ~172.

`scripts/generate-app-icons.mjs` (`npm run icons`) régénère les trois jeux depuis la source unique avec une règle de proportion explicite — le canevas adaptatif vaut 108 dp mais le lanceur n'en montre que les 72 dp centraux, c'est cette zone visible qui sert de référence, pas le canevas. Une source, une règle, plus de dérive à la main.

---

## [2026-08-23] — Refactor de structure : arborescence inspirée de COBA, config Capacitor en TypeScript

Demande : rapprocher l'organisation du projet de celle de COBA (`/ionic/COBA/app`), « que ce soit au niveau de l'organisation des dossiers, des modules, mais aussi de la configuration de base de Capacitor et d'Ionic ».

COBA est un projet **Angular**. Sa structure est donc une convention à adapter, pas à copier : son dossier-par-page existe parce qu'Angular impose un triplet `.ts/.html/.scss`, alors qu'ici une page est un seul `.js`. Le dossier ne se justifie que quand l'écran a plusieurs fichiers — `pages/recipes/` en a cinq, `pages/home/` un seul. La **séparation en couches**, elle, est reprise telle quelle.

### Ce qui a bougé

78 fichiers déplacés, 107 spécifieurs d'import réécrits (plus 19 au second passage, voir plus bas).

| Avant | Après | Pourquoi |
|---|---|---|
| `src/components/<feature>/XxxView.js` | `src/app/pages/<ecran>/` | Une destination de route par dossier. `src/components/` mélangeait écrans, sous-composants et modales. |
| `src/components/{Header,common/SegmentedTabs,family/FamilyPanel,feedback/FeedbackWidget,nav/*}` | `src/app/components/` | Briques réutilisables qui ne sont pas des écrans. |
| `src/components/{modals/AppModals,settings/SettingsModals}` | `src/app/modals/` | Équivalent du `modals/` de COBA. |
| `src/firebase/*` | `src/app/providers/` | Accès aux données. COBA : `providers/*.service.ts`. |
| `src/utils/statusBar.js`, `src/utils/notify.js` | `src/app/plugins/{statusBar,notifications}.js` | Enveloppes de plugins natifs. COBA : `plugins/`. |
| `src/constants.js`, `src/data/*` | `src/app/config/` | Constantes de domaine et données statiques. |
| `src/hooks/*`, `src/utils/*` | `src/app/{hooks,utils}/` | Inchangé sur le fond. `hooks/` n'a pas d'équivalent COBA : Angular passe par l'injection de dépendances. |
| `src/styles.css` | `src/theme/styles.css` | À côté de `ionic-bridge.css`. COBA : `theme/`. |
| config Firebase dans `constants.js` | `src/environments/environment.js` | C'est de l'environnement, pas une constante. |

La méthode compte ici : plutôt que des `sed` sur les chaînes d'import, chaque spécifieur relatif a été **résolu** vers un chemin absolu depuis l'ancien dossier du fichier, passé par la table de déplacement, puis recalculé en relatif depuis la nouvelle position — avec échec bruyant sur toute cible non résolue. Zéro cible perdue.

### Deux erreurs de classement, rattrapées par le graphe de dépendances

Après le premier passage, j'ai mesuré les arêtes entre couches. Deux remontaient :

- `components/FeedbackWidget.js` → `modals/MrdModal.js`
- `modals/SettingsModals.js` → `pages/settings/SettingsUI.js`

Les deux venaient d'un mauvais classement de ma part, pas d'un vrai couplage. `MrdModal` est l'**enveloppe** `ion-modal`, importée par 16 fichiers de toutes les couches : c'est une primitive d'interface, pas une modale — elle rejoint `components/`. `SettingsUI` exporte des briques présentationnelles (`SectionCard`, `SettingsRow`, `SettingsSwitch`, `ColorGrid`, `LegalTextPage`…) consommées à la fois par les pages réglages et par `SettingsModals` : c'est un composant, pas une page — il rejoint `components/settings/`. Après quoi le graphe est entièrement stratifié.

### Configuration

| Fichier | Changement |
|---|---|
| `capacitor.config.ts` | Remplace `capacitor.config.json`, comme COBA. Contenu résolu vérifié identique champ pour champ via `npx cap config --json`. Le format permet enfin de **commenter** les huit clés de plugin : pourquoi `forceCodeForRefreshToken` (sans lui la session Google expire en une heure), pourquoi trois `clientId` distincts, à quoi `backgroundColor` doit rester aligné. |
| `typescript` (devDependency) | Requis par la CLI Capacitor pour lire le `.ts`. **Épinglé en 5.x** : `npm i -D typescript` installe aujourd'hui la 7.0.2, dont le paquet natif n'expose plus l'API JS du compilateur (`transpileModule`, `ModuleKind`) — la CLI Capacitor 6 échoue alors sur `Cannot read properties of undefined (reading 'CommonJS')`. |
| `tsconfig.json` | Ne couvre que `capacitor.config.ts`, pour que `import type { CapacitorConfig }` se résolve dans l'éditeur. `allowJs` volontairement absent : aucun des fichiers `.js` ne doit passer au vérificateur de types. |
| `ionic.config.json` | Marqueur de projet Ionic (`type: react-vite`, intégration Capacitor). Était absent. |
| `.editorconfig` | Repris de COBA, plus les exceptions Xcode (`pbxproj`, `plist` : jamais reformater) et Gradle. |
| `vite.config.js` | `build.target` explicite. Valeurs identiques à la cible `modules` par défaut de Vite 5 : le bundle émis est **inchangé**, elles sont écrites pour être visibles. |

### Deux écarts assumés par rapport à COBA

- **Pas de `.browserslistrc`** : Vite ne le lit pas (c'est un mécanisme Angular/PostCSS). Le fichier serait inerte. Le plancher navigateur est déclaré dans `vite.config.js`, qui a un effet réel.
- **Pas de `.npmrc`** : COBA a besoin de `legacy-peer-deps=true` pour ses plages de pairs Angular/Ionic. Ici l'installation passe sans, et le drapeau masquerait justement le conflit de pair sur `react-router-dom`, épinglé en 6.30.6 exprès (la v7 est incompatible avec `@ionic/react-router` 9).
- **Pas de jumeau `environment.prod.js`** : Angular substitue les environnements via `fileReplacements`, Vite n'a pas ce mécanisme. Un `.prod.js` ne serait jamais chargé. `environment.js` lit `import.meta.env`, et le point d'extension pour une vraie substitution est `resolve.alias` — exactement ce que fait déjà `tests/helpers/e2e-build.js` pour les bouchons Firebase.

### Un écart préexistant, rendu visible

`ios/App` a `IPHONEOS_DEPLOYMENT_TARGET = 13.0`, alors que la cible de build suppose Safari 14. Les WebView iOS 13.0 à 13.3 n'ont ni `??=` ni les champs de classe. Ce n'est pas introduit ici — c'était déjà le cas avec la cible par défaut de Vite —, mais c'était invisible. Le corriger veut dire soit monter la cible Xcode à 14.0, soit descendre à `safari13` et re-vérifier le bundle. Décision de release, laissée ouverte, commentée dans `vite.config.js`.

### Un test qui ne tournait pas

`tests/unit/routes.test.js`, écrit en phase 5 de la migration Ionic, n'était importé par **aucun agrégateur** : ses 12 tests n'ont jamais tourné sous `npm test`. Câblé dans `tests/unit.test.js`, vert.

Ajout de `tests/unit/structure.test.js` : la contrepartie exécutable de la nouvelle arborescence. Un dossier bien nommé ne se défend pas tout seul — il suffit d'un import qui remonte pour que `utils/` dépende d'un écran. Le test lit les imports relatifs réels et vérifie que les dépendances ne remontent jamais d'une couche, que `config/` reste une feuille sans dépendance, et que la racine de `src/app/` ne contient que `App.js`, `routes.js`, `lib.js`.

Deux attentes de `design-tokens.test.js` ont dû suivre : elles comparaient le
chemin du fichier propriétaire de `BADGE_PALETTE` et du repli `#8B7355` à
`"constants.js"`, devenu `"app/config/constants.js"`. L'invariant testé
(« définie à un seul endroit ») n'a pas bougé, seule l'étiquette du chemin.

Bilan : **unitaires 87/87** (71 avant : +12 de `routes.test.js` enfin câblé,
+4 de `structure.test.js`), e2e inchangés, 0 skipped.

Garde visuelle : **57/57 `IDENTIQUE`**, 0,0 % de blocs différents contre la
référence de la phase 8, états de modale compris. C'est le résultat attendu d'un
refactor purement structurel, et ça valide en particulier le déplacement de
`styles.css` vers `theme/` — ses `url()` de polices et de logo sont passés de
`./assets/` à `../assets/`.

---

## [2026-08-14] — Stock : conversion des unités à la fusion, sous-stock annoncé, faisabilité à l'échelle de la semaine

Question de l'utilisateur : « si j'ajoute une deuxième fois des nouilles instantanées, j'en ai bien deux en stock ? Mais si je les cuisine une fois, il ne m'en restera pas assez pour la deuxième — est-ce que ça me le notifie ? ». Réponse : deux en stock oui, notification non. Trois trous distincts, corrigés ensemble.

### 1. La fusion additionnait les nombres sans regarder les unités

`mergeInventoryEntry` faisait `500 + 1` sur « 500 g de riz » et « 1 kg de riz » et gardait l'unité de la ligne existante : **501 g**. `inventoryEntriesCanMerge` ne comparait que le nom et la DLC. Le reste du code (comparaison recette, déduction) convertissait pourtant déjà proprement via `toBaseQuantity`.

| Fichier | Changement |
|---|---|
| `src/app/utils/units.js` | **`addStockQuantities(target, addition)`** : somme exprimée dans l'unité de `target`. `mergeable: false` quand les deux unités ne mesurent pas la même chose (masse vs volume, « sachet » vs « boîte ») — l'appelant garde alors deux lignes plutôt qu'un total faux. `hasQuantity: false` pour « un peu de persil » des deux côtés. Une quantité absente vaut 1 (rajouter « nouilles » à « nouilles » fait 2, comportement d'origine conservé) ; une **unité** absente emprunte celle d'en face, sinon « 2 paquets » + « 1 » aurait coupé la ligne en deux. |
| `src/app/hooks/useLists.js` | `inventoryEntriesCanMerge` et `mergeInventoryEntry` passent par `addStockQuantities`. Même correction sur la liste de courses (`listItemsCanMerge`, `mergeListItem`) — c'est le même défaut, et la liste alimente l'inventaire à l'achat. `upsertMergedListItems` ne replie que les lignes mutuellement compatibles (la compatibilité n'est pas transitive : une ligne sans unité s'accorde avec « riz 500 g » comme avec « riz 2 l »). Helpers locaux `readQuantityValue` / `formatQuantityValue` supprimés, devenus morts. `inventoryEntriesCanMerge` renvoie un vrai booléen (elle renvoyait `""`). |

### 2. La cuisson encaissait le sous-stock en silence

`Math.min(itemBase.value, remainingToDeduct)` : recette qui demande 2 paquets, 1 en stock → déduit 1, passe l'article à `empty`, et le toast annonçait quand même « Les ingrédients ont bien été déduits ». Le reste était jeté sans un mot.

| Fichier | Changement |
|---|---|
| `src/app/App.js` | `computeMealCookState` renvoie `shortfalls` : les produits que le stock **connaissait** mais n'a pas couverts jusqu'au bout. Les produits totalement absents n'y entrent pas — c'est le rôle de la comparaison recette / courses, pas de la cuisson. Le toast devient « Stock trop juste : il manquait sel (20 g), riz (100 g) », avec l'annulation conservée (souvent la bonne réponse quand on découvre le manque) et 5 s au lieu de 3. |

### 3. La faisabilité se calculait recette par recette, jamais à l'échelle de la semaine

`computeRecipeStock` compare une recette au stock **complet**. Deux repas qui veulent le même paquet se déclaraient donc faisables tous les deux, et le manque n'apparaissait qu'après avoir coché « cuisiné » sur le premier — trop tard pour les courses.

| Fichier | Changement |
|---|---|
| `src/app/utils/recipeStock.js` | **`computeWeekStock({ slots, inventory })`** : le stock devient un budget que les créneaux consomment dans l'ordre chronologique. Les créneaux **déjà cuisinés sont ignorés** (la liaison inventaire a retiré leurs ingrédients, les recompter les déduirait deux fois). Chaque créneau renvoie aussi `weekOnlyMissing` — ce qui ne manque **que** par la faute d'un repas plus tôt — et chaque manquant porte `takenBy`, les créneaux qui ont déjà puisé dans ce produit. Le rapprochement reste celui de `computeMissingIngredients` : même clé produit, mêmes conversions, même tolérance pour les ingrédients sans quantité. |
| `src/app/pages/meals/MealsView.js` | `buildWeekSlots(overrides)` construit les 14 créneaux (entrée + plat + dessert) ; `overrides` permet de répondre juste **au moment du choix**, sans attendre que l'état remonte. La pastille de la grille lit le calcul semaine, en **rouge** quand le manque vient d'un autre repas (la réponse n'est pas la même : décaler ou racheter, plutôt que compléter la liste), avec l'`aria-label` qui le dit. Le panneau bas gagne un bandeau « Nouilles instantanées : ton stock part déjà dans Lun midi. Il en faut une deuxième fois. ». La popup après choix d'une recette et le bilan du tirage comptent eux aussi sur la semaine — deux repas tirés qui veulent le même produit en demandent maintenant deux fois la quantité. |
| `src/theme/styles.css` | `.mrd-week-cell-dot.taken`, `.mrd-week-taken`, `.mrd-taken-tag` — uniquement à partir des tokens `--mrd-danger*` existants. |
| `tests/unit/recipe-stock.test.js` | 6 tests : le premier créneau sert et le suivant est signalé (avec `takenBy`) ; stock suffisant → les deux passent ; repas déjà cuisiné non recompté ; stock absent ≠ stock déjà pris ; budget partagé entre recettes différentes ; rôles cumulés d'un même créneau. |
| `tests/unit/stock-merge.test.js` | **Nouveau** (10 tests) : conversion, unité conservée, refus des unités incompatibles, emprunt d'unité, quantité absente = 1, quantités non chiffrables, et les deux fonctions de `useLists`. |

**Bug trouvé à la vérification navigateur** : le panneau annonçait « Courses · 1 » et la popup répondait « ✓ Tout est disponible dans votre inventaire » — `openShopping` utilisait encore la comparaison isolée. Les deux lisent maintenant la même liste.

Vérifié dans le navigateur en montant `MealsView` sur un jeu d'essai (2 paquets en stock, nouilles lundi midi **et** jeudi soir) : une seule pastille rouge dans toute la grille, sur jeudi soir ; bandeau « ton stock part déjà dans Lun midi » ; « Courses · 1 » ; popup « Nouilles instantanées · déjà pris par Lun midi · 2 unités ». Bascule clair / sombre correcte sur les trois nouvelles règles.

## [2026-08-13] — Repas : refonte grille semaine (2a) + sélecteur de recettes (5a)

Implémentation du handoff design `design_handoff_repas` (écrans **2a** et **5a** ; les étapes 1a/1b/3a du prototype sont de l'historique et n'ont pas été reprises). Objectifs du handoff : voir les 14 créneaux d'un coup sans défilement, et choisir une recette sans que filtres et tri mangent la moitié de l'écran.

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | **Réécrit.** Grille 7 lignes × (rail jour / midi / soir), barre de semaine + progression `N / 14`, pastille « Lier stock », bouton « ✨ Remplir », et **panneau bas permanent** (plus de modale) : vignette de catégorie, créneau, « Marquer cuisiné », trois lignes Entrée / Plat / Dessert, compteur de couverts (1–24), bouton Courses et lien Recette →. La feuille de remplissage occupe la même place quand elle est ouverte. |
| `src/app/pages/meals/RecipePicker.js` | **Nouveau** (écran 5a). Plein écran, remplace la grille le temps du choix : recherche, bouton « Affiner · N », rail de catégories en icônes (une seule rangée), panneau de filtres repliable (interrupteurs Rapide / Déjà en stock / De saison + régime + contraintes), rappel des filtres actifs en pastilles retirables, tri De saison / Temps / Stock / A → Z, état vide, pied fixe « Choisir « … » ». |
| `src/app/utils/recipeFilters.js` | **Nouveau.** Saisonnalité (`recipeMonths`, `matchesAvailability`), durée (`recipeTotalMinutes`, `durationLabel`), `isQuickRecipe` (seuil **20 min**, celui du libellé du sélecteur — l'ancien code Repas utilisait 10), régime et contraintes. Ces règles étaient recopiées dans `MealsView` et `RecipesView`. |
| `src/app/utils/mealFill.js` | **Nouveau.** `buildFillPlan` : filtre le vivier (régime, contraintes, rapide, saison, stock), exclut les doublons de la semaine, remplit soit les cases vides soit les 14 créneaux. Ne renvoie qu'un plan — la vue l'applique via `onUpdateMeal`, donc c'est testable. « Avec mon stock » est **relâché** plutôt que de ne rien remplir (règle du handoff). |
| `src/app/pages/recipes/RecipeSheet.js` | `fmtScaledQty` exportée et nouvelle prop `initialServings` : la fiche s'ouvre au nombre de couverts choisi dans le panneau, pas à celui de la recette. |
| `src/app/pages/recipes/CategoryIcons.js` | `CategoryIcon` accepte une prop `color` (icône blanche sur la pastille de catégorie sélectionnée). |
| `src/theme/styles.css` | Blocs `.mrd-week-*` et `.mpick-*`, uniquement à partir des tokens existants (aucun nouveau token). Les deux écrans occupent tout le `.cnt` via `:has()` — même mécanisme que la fiche recette. **116 règles mortes supprimées** (`.mrd-meals-*`, `.mrd-extras-*`, `.mrd-month-*`, `.meal-picker-*`, `.pick-*`) : plus aucune n'était référencée dans `src/`. |
| `tests/unit/meal-fill.test.js` | **Nouveau** (10 tests) : portée, doublons, filtres, préférence plats, relâchement du filtre stock, saisonnalité, seuil « rapide » et périodes manuelles. |

**Suite (même jour), retour utilisateur** — « de saison » ne savait viser que le mois courant ; il fallait pouvoir choisir la saison ou le mois à la main.

| Fichier | Changement |
|---|---|
| `src/app/utils/recipeFilters.js` | `matchesPeriod(recipe, period, currentMonth)` où `period` vaut `"current"`, `"season:<id>"` ou `"month:<n>"` — reprend ce que faisait l'ancien `<select>` « Toute période » du picker, supprimé par la refonte. Plus `periodLabel` et `periodPhrase` (« au printemps » vs « en août »). |
| `src/app/pages/meals/RecipePicker.js` | L'interrupteur « 🍂 De saison » déplie deux rangées de pastilles quand il est actif : **Ce mois-ci / Printemps / Été / Automne / Hiver**, puis les **12 mois** (rangée qui défile). Le sous-titre suit (« Disponible au printemps »), la pastille de rappel aussi (« 🍂 janvier »), et le **tri** « De saison » classe désormais selon la période choisie et non plus selon le mois courant. |
| `src/theme/styles.css` | `.mpick-switch-block`, `.mpick-period`, `.mpick-months`, `.mpick-chip--sm`. Le panneau « Affiner » passe en `flex: 0 1 auto` + défilement propre et la liste garde un plancher de 96 px : déplié, le panneau se réduit lui-même au lieu d'écraser les recettes. |

Vérifié dans le navigateur (mêmes conditions) : en août la liste sort ratatouille et sirop de menthe ; en cliquant **Printemps** les asperges (mars–mai) apparaissent et la ratatouille sort ; en cliquant **Janv** ce sont la galette des rois et la soupe à l'oignon. Panneau 439 px sans débordement, liste jamais sous 96 px, aucun scroll de page.

Non fait : la pastille « 🍂 De saison » de la feuille **Remplir** reste sur le mois courant — la feuille est calée à ~213 px et deux rangées de plus n'y tiennent pas.

**Suite 2 (même jour)** — question de l'utilisateur : « si je n'ai presque rien en stock et que je fais Remplir avec mon stock, ça remplit quand même ? ». Oui, et de deux façons incohérentes : à **zéro** recette faisable le tirage relâchait la contrainte en silence et posait 14 repas non faisables ; à **deux** faisables il n'en posait que deux et laissait le reste vide (le repli ne se déclenchait que sur un vivier totalement vide). Dans les deux cas rien à l'écran ne l'expliquait, et le bouton annonçait « Remplir 6 repas » même quand il n'allait en poser que deux.

| Fichier | Changement |
|---|---|
| `src/app/utils/mealFill.js` | « Avec mon stock » **trie au lieu d'exclure** : les recettes faisables passent devant, les autres complètent la semaine. `buildFillPlan` renvoie maintenant `{ entries, stockCount, otherCount, stockAsked }`, chaque entrée portant `fromStock` — la vue peut donc dire ce qui vient du stock. Le repli silencieux disparaît : il n'y a plus de cas particulier à zéro faisable. |
| `src/app/utils/recipeStock.js` | `collectUsedStockItems(recipes, inventory)` : les articles d'inventaire réellement couverts, sans doublon, avec le même `productMatchKey` que la comparaison et la déduction. |
| `src/app/pages/meals/MealsView.js` | Modale de bilan après le tirage : « N repas ajoutés », puis « X repas avec ce que tu as déjà : Y articles du stock » (les articles en pastilles) et « Z repas demandent des courses ». Elle n'apparaît que si « Avec mon stock » était coché. Le compteur du bouton passe par un tirage à blanc : il annonce ce qui sera réellement posé (« Remplir 0 repas », désactivé, quand toutes les recettes sont déjà placées). |
| `src/theme/styles.css` | `.mrd-fill-report*` — point sauge (stock) / ambre (courses), pastilles d'articles en sauge. |
| `tests/unit/meal-fill.test.js` · `recipe-stock.test.js` | 3 tests remplacent celui du repli (rien de faisable → remplit quand même et le signale ; faisables d'abord puis complément ; sans l'option, aucun classement par faisabilité) + 1 test sur les articles utilisés. |

**Suite 4 (même jour)** — « une fois qu'on a ajouté à la liste de courses, il faut qu'on voie qu'on l'a déjà fait ». Rien ne distinguait « à acheter » de « déjà demandé » : le bouton Courses réclamait indéfiniment les mêmes articles.

L'état n'est **stocké nulle part** : il se lit dans la liste de courses. Il reste donc juste après un rechargement, et disparaît tout seul si l'article est retiré de la liste — un drapeau « déjà ajouté » posé sur le repas aurait menti dans les deux cas. Un article coché (acheté) ne compte plus comme en attente.

| Fichier | Changement |
|---|---|
| `src/app/utils/recipeStock.js` | `splitAlreadyListed(missingItems, shoppingItems)` → `{ listed, toAdd }` et `isAlreadyListed`. Rapprochement par `productMatchKey`, donc « Tomate » sur la liste couvre « Tomates » de la recette. |
| `src/app/App.js` | `shoppingItems` passé à `MealsView` (la liste de courses était déjà en portée juste au-dessus). |
| `src/app/pages/meals/MealsView.js` | Bouton **Courses** : `Courses · N` ne compte plus que ce qui reste à demander, et passe à **« ✓ Sur la liste »** en sauge quand tout est déjà posé. Popup des manquants : les articles déjà demandés portent une étiquette « ✓ déjà demandé », partent **décochés**, un bandeau l'annonce quand ils le sont tous, et le bouton « Ajouter à la liste » disparaît s'il n'y a rien à envoyer. Bilan du tirage : le compte exclut les articles déjà listés, et quand il ne reste rien il affiche « Rien de plus à acheter : les N articles qui manquent attendent déjà dans ta liste ». |
| `src/theme/styles.css` | `.mrd-listed-tag`, `.mrd-week-shop.listed`. |
| `tests/unit/recipe-stock.test.js` | Singulier/pluriel du même produit, article coché qui ne compte plus, liste vide ou absente. |

`npm run test:unit` OK (51 tests), `npm run build` OK. Vérifié de bout en bout dans le bac à sable : `Courses · 1` → ajout → **✓ Sur la liste** ; réouverture de la popup → bandeau + étiquette + plus de bouton d'ajout ; tirage → « 🛒 Ajouter 3 articles » → nouveau tirage → « 🛒 Ajouter 1 article » (seul le nouveau manquant) → tirage suivant → « Rien de plus à acheter : les 4 articles qui manquent attendent déjà dans ta liste ».

**Suite 3 (même jour)** — le bilan constatait le manque sans permettre d'y répondre : demande d'un bouton qui envoie les articles manquants du tirage vers la liste de courses.

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | Le tirage collecte les manquants de toutes les recettes posées (`computeMissingIngredients`, liaison inventaire active uniquement) et la modale gagne **« 🛒 Ajouter N articles »**, qui les passe à `onAddMissingIngredients` — le même chemin que la popup d'ingrédients manquants, donc la fusion des articles proches et l'addition des quantités restent celles de `useLists`. Quand « Avec mon stock » n'était pas coché, la modale affiche quand même la ligne « N articles manquent pour cuisiner cette semaine » suivie du bouton. |
| `src/app/utils/recipeStock.js` | `countDistinctProducts` : le bouton annonce le nombre de **produits** (clé produit), pas de lignes — deux recettes qui manquent de tomates ne feront qu'une ligne de courses. |
| `tests/unit/recipe-stock.test.js` | Test du décompte (singulier/pluriel du même produit, entrées vides). |

`npm run test:unit` OK (50 tests), `npm run build` OK. Vérifié dans le bac à sable : avec un stock de 4 articles, « Remplir » sur les cases vides pose 4 repas dont 1 puisé dans le stock, et la modale annonce « 1 repas avec ce que tu as déjà : 1 article du stock — Pommes / 3 repas demandent des courses » ; en portée « toute la semaine », 3 repas sur 10 viennent du stock (4 articles). Le bouton « 🛒 Ajouter 3 articles » envoie bien `Asperges 1 kg`, `Pâte feuilletée 2`, `Chèvre 1` puis referme la modale ; sans l'option stock, « 🛒 Ajouter 7 articles ». Compteur honnête vérifié : « Remplir 0 repas » grisé quand toutes les recettes sont déjà posées. Relu en thème sombre (pastilles sauge sur fond sombre, points sauge/ambre lisibles).

Écarts assumés, à valider :
- **La vue mois disparaît**, ainsi que la bande de jours et les cartes déjeuner/dîner : 2a énumère tous les enfants de l'écran et n'en contient aucun — la grille semaine remplit le même besoin.
- **Le texte libre** (`lunchText`, `extra`) n'est plus éditable depuis Repas ; ce qui existe déjà reste **affiché** dans la case de la grille, et compte dans la progression, donc rien n'est perdu.
- **Retirer une recette d'un créneau** n'existe nulle part dans 2a/5a : ajouté en pied du sélecteur (« Retirer le plat du créneau »), sinon la fonction disparaissait.
- **Anti-gaspi** : 5a n'en parle pas, mais `AGENT.md` l'exige dans le choix d'une recette — gardé sous forme d'une seule rangée de pastilles ambre au-dessus de la liste, liaison inventaire active uniquement.
- `--mrd-a` remplacé par `--mrd-aBtn` partout où le handoff demande un aplat accent sous du texte blanc : c'est la règle du dépôt (`design-tokens.test.js`), `--mrd-a` devenant clair en thème sombre.
- Le nombre de couverts reste un **état d'écran** (comme dans le handoff), pas une donnée enregistrée : il repart du nombre de personnes de la recette à chaque changement de créneau.

`npm test` OK (158 tests, unitaires + E2E). `npm run build` OK. Vérifié dans le navigateur en 375 × 812 sur un bac à sable montant `MealsView` avec 10 recettes / 5 articles d'inventaire (fichier supprimé depuis) : les 14 créneaux tiennent sans défilement (grille 338 px, panneau 213–219 px, page 812 px, aucun scroll document), le tirage ne place pas de doublon, `4 → 6 couverts` fait bien passer les manquants de 400 g / 40 cl à 600 g / 60 cl, la bascule « cuisiné » passe le liseré en sauge, et le sélecteur ouvre / filtre / trie / choisit correctement (barre d'onglets masquée, pied fixe, liste seule à défiler). Contrastes relevés en clair et en sombre (une correction : la pastille de catégorie sélectionnée se remplit du ton foncé en sombre, `--recipe-cat-*` y étant une couleur claire). Screenshot indisponible dans cette session (panneau navigateur non affiché) — vérifications faites sur le DOM et les styles calculés.

---

## [2026-08-12] — Repas : suggestions à partir de l'inventaire (faisable / anti-gaspi)

L'utilisateur demandait si l'app détectait ce qui reste en stock pour proposer des recettes. Seul le sens inverse existait : choisir une recette → comparer à l'inventaire → popup des manquants → liste de courses. Rien ne partait de l'inventaire.

| Fichier | Changement |
|---|---|
| `src/app/utils/recipeStock.js` | **Nouveau.** Source unique de la comparaison recettes ↔ inventaire. Reprend `computeMissingIngredients` / `computeMissingCondiments` (jusque-là locales à `MealsView`) et ajoute `computeRecipeStock` (faisable / nombre de manquants / `known` à faux pour une recette sans ingrédients structurés), `recipeStockRank`, `collectExpiringItems`, `computePriorityRecipes` et `expiryShortLabel`. |
| `src/app/utils/recipeStock.js` | **Correction.** `computeMissingIngredients` comparait les unités par égalité de chaîne : l'inventaire stocke `"unité"` là où les recettes normalisent en `"unite"` (`normalizeRecipeUnit`, state.js), et 1 kg de riz ne couvrait pas 200 g. Presque tout passait donc pour manquant. Elle utilise désormais `productMatchKey` + `toBaseQuantity`/`fromBaseQuantity` (`utils/units.js`), exactement comme la déduction de stock d'`App.js` — les deux chemins ne peuvent plus diverger. |
| `src/app/pages/meals/MealsView.js` | Sélecteur de recette : badge `✓ Faisable` / `🛒 N manquants` sur chaque carte, bascule "🥕 Faisable avec mon stock", tri des faisables en tête (puis manquants croissants), et section "À cuisiner en priorité" listant jusqu'à 3 recettes qui consomment les DLC des 7 prochains jours. Le tout **uniquement quand la liaison inventaire est active** (règle `AGENT.md`) ; les suggestions se calculent sur la liste déjà filtrée, donc elles respectent recherche, catégorie et sous-créneau (entrée/dessert). |
| `src/app/utils/date.js` | `daysUntilExpiry` remonte ici (elle était locale à `InventoryView`), sur la date applicative — donc pilotable par le simulateur de date. |
| `src/app/pages/inventory/InventoryView.js` | Utilise `daysUntilExpiry` de `utils/date.js` au lieu de sa copie locale. |
| `src/theme/styles.css` | `.pick-toggle-row`, `.pick-stock-btn`, `.pick-priority*`, `.rcard-badge--stock-ok/--stock-missing` — palette sauge (faisable) et ambre (manquants/DLC) via les tokens existants, donc thème sombre compatible. |
| `tests/unit/recipe-stock.test.js` | **Nouveau** (12 tests) : faisabilité, complément de quantité, recettes non comparables, conversions d'unités (régression du bug ci-dessus), fenêtre DLC, classement anti-gaspi. |

Choix : les DLC **dépassées** sont exclues des suggestions (on ne propose pas de cuisiner un produit périmé), alors que l'encart "à consommer" de l'inventaire, lui, les affiche toujours. Les condiments n'entrent pas dans la faisabilité, puisqu'ils ne sont jamais déduits du stock.

`npm test` OK (149 tests, unitaires + E2E). Vérifié dans le navigateur sur le build E2E (Firebase stubbé, `tests/.e2e-dist` servi en statique), avec un inventaire injecté via les listeners du stub — courgettes J+2, tomates J+1, crème J+5, riz en kg, poulet, pâtes : les trois recettes couvertes affichent `✓ Faisable` et remontent en tête, "Pâtes au pesto" affiche `🛒 1 manquant`, la bascule filtre bien à 3 recettes, et "À cuisiner en priorité" propose la ratatouille (tomates demain + courgettes dans 2 j) devant le gratin. Contrastes relevés en clair et en sombre sur les nouveaux éléments (une correction : `.pick-priority-card` retombait sur le noir par défaut du bouton en thème sombre). Screenshot indisponible dans cette session (panneau navigateur non affiché) — vérifications faites sur le DOM et les styles calculés.

---

## [2026-08-05] — Refonte visuelle de la modale "tâche non faite" (StaleTaskModal)

L'utilisateur voulait améliorer le design du `StaleTaskModal` (texte brut + boutons jusque-là) sans changer son comportement.

| Fichier | Changement |
|---|---|
| `src/app/modals/AppModals.js` | `StaleTaskModal` : ajout d'un badge circulaire en tête (⏳ tâche unique semaine, 🗓️ tâche unique mois, 🔁 récurrente), d'un encart "carte tâche" reprenant l'icône + le nom de la tâche + un tag de période (Semaine/Mois), et d'un message reformulé plus court. Pour les tâches récurrentes ratées plus d'une fois, affiche désormais le nombre de cycles manqués ("— ratée 3 fois"), donnée déjà disponible (`alert.missedCount`) mais pas encore montrée. |
| `src/theme/styles.css` | Nouvelles classes `.stale-task-modal-icon(.is-monthly)`, `.stale-task-modal-card(-text/-name)`, `.stale-task-modal-tag(.is-monthly)`, `.stale-task-modal-message` — palette ambre (semaine/rappel) vs rouge "danger" (mois/plus urgent), toutes basées sur les variables de couleur existantes donc compatibles dark mode sans règle supplémentaire. |

`npm run build` OK (116 modules). Vérifié en preview (session déjà connectée avec le vrai compte de l'utilisateur — composant monté à part, isolément, via `createRoot` dans la console du navigateur, sans toucher aux données réelles, comme pour la vérification de `PremiumLockScreen` du 2026-08-03) : les deux variantes (tâche unique "Semaine" avec bouton "Ajouter à la tâche quotidienne", tâche récurrente "Mois" avec compteur de cycles manqués et bouton "Compris") s'affichent correctement, badge coloré + carte tâche + tag bien rendus en thème clair. Non re-testé en thème sombre ni dans le flux réel de l'app (nécessiterait de faire vieillir une vraie tâche).

---

## [2026-08-05] — Section "Données" (Réglages) réservée au compte développeur

Suite à l'entrée précédente (réactivation du simulateur de date dans Réglages → Données), l'utilisateur a demandé que le bouton d'accès à "Données" ne soit visible que pour `bohemianrollinghouse@gmail.com` — les autres membres du foyer (comptes réels de la famille) ne doivent pas voir ce panneau de debug (export/import, reset planner, date simulée).

| Fichier | Changement |
|---|---|
| `src/app/pages/settings/SettingsView.js` | Nouvelle constante `DEV_ACCOUNT_EMAIL` + `isDevAccount` (comparaison insensible à la casse sur `userProfile.email`). Le `SectionCard` "💾 Données" (avec son bouton "Gérer les données" vers la sous-page) n'est ajouté à la liste des réglages que si `isDevAccount` est vrai. Double verrou côté sous-page `settingsPage === "privacy"` : si un compte non développeur y accède quand même (état `settingsPage` restauré autrement), un message "Accès réservé" s'affiche à la place du contenu réel. |

`npm run build` OK (116 modules). En rechargeant la preview, le navigateur avait une session déjà connectée avec le vrai compte de l'utilisateur (foyer "Les bus", profil "Myenndine") — pas le compte développeur : conforme à l'attendu, aucune trace du bouton "Données" ne devait apparaître pour ce compte. Un clic sur "Paramètres" a été fait pour naviguer (action non destructive), mais **je n'ai pas poussé la vérification visuelle plus loin** (screenshot indisponible/timeout) pour éviter tout risque d'interaction accidentelle avec de vraies données pendant les tests. À confirmer par l'utilisateur : se connecter avec `bohemianrollinghouse@gmail.com` → la section "Données" doit apparaître en bas de Réglages ; avec tout autre compte, elle doit être absente.

---

## [2026-08-05] — Réglages : réactivation du simulateur de date (pour tester la relance "tâche non faite")

Suite à l'entrée précédente (relance "tâche non faite"), l'utilisateur a demandé comment la tester sans attendre 6/27 jours réels. En inspectant le code, tout le mécanisme de simulation de date (`appTimeMode`, `onShiftSimulatedDate`, etc.) existait déjà côté `App.js`/`utils/date.js` — utilisé partout ailleurs pour calculer "maintenant" (échéances, cycles des tâches récurrentes…) — mais ses props n'étaient branchées à aucun rendu dans `SettingsView.js` : les boutons n'existaient nulle part dans l'UI.

| Fichier | Changement |
|---|---|
| `src/app/pages/settings/SettingsView.js` | Réglages → Données : nouvelle section "Date de test (développeur)" (interrupteur date réelle/simulée, champs date+heure, boutons "−1 jour"/"+1 jour"/"+7 jours"/"Revenir à aujourd'hui"), branchée sur les props déjà existantes (`appTimeMode`, `simulatedDateTime`, `currentAppDateLabel`, `onUseRealDate`, `onUseSimulatedDate`, `onChangeSimulatedDate`, `onChangeSimulatedTime`, `onShiftSimulatedDate`, `onResetSimulatedDate`). |

Aucun changement côté `App.js` nécessaire : décaler la date simulée déclenche déjà `appTimeVersion` → un `checkReset` qui recrée `state.tasks` avec une nouvelle référence, donc `useStaleTaskAlerts` (qui dépend de `tasks`) se réévalue automatiquement — la modale de relance apparaît donc immédiatement après avoir avancé de 6 (semaine) ou 27 (mois) jours, sans attendre le tick périodique de 5 min.

`npm run build` OK (116 modules). Vérifié en preview (app non connectée, écran de login) : aucune nouvelle erreur console (seuls les warnings React préexistants sur les attributs SVG kebab-case). **Non testé avec un compte connecté** (nécessite les identifiants de l'utilisateur) — à valider par l'utilisateur : Réglages → Données → activer "Date simulée" → créer une tâche Semaine → "+7 jours" → la modale de relance doit apparaître.

---

## [2026-08-05] — Relance "tâche non faite" (Semaine ≥6j, Mois ≥27j)

L'utilisateur voulait qu'une modale apparaisse quand une tâche créée dans l'onglet "Semaine" n'a pas été cochée au bout de 6 jours, indiquant qu'elle n'a pas été faite et proposant de la basculer en tâche "Quotidien" — sauf si c'est une tâche récurrente, où la modale se contente d'informer (pas de proposition). Même logique pour "Mois" (seuil 27 jours), avec proposition de bascule vers "Semaine" ou "Jour".

Aucun `createdAt` n'existait sur les tâches jusqu'ici (seul l'id `task-<timestamp>` encodait implicitement la date de création). Pour les tâches récurrentes, le mécanisme de cycle existant (`missedCount`/`currentCycleKey` dans `applyTaskCycles`, `src/app/utils/state.js`) incrémente déjà `missedCount` à chaque cycle hebdo/mensuel manqué — réutilisé comme déclencheur plutôt que de recalculer un seuil en jours pour ces tâches-là.

| Fichier | Changement |
|---|---|
| `src/app/utils/state.js` | `normalizeTask` : nouveaux champs `createdAt` (repris de l'id `task-<timestamp>` pour les tâches existantes, sinon date du jour), `staleNoticeDismissedAt` et `staleNoticeMissedCount` (déduplication de la relance). |
| `src/app/hooks/useTasks.js` | `handleAddTask` pose `createdAt`/`staleNoticeDismissedAt`/`staleNoticeMissedCount` sur les nouvelles tâches. Deux nouveaux handlers : `handleChangeTaskPeriod(taskId, newPeriod)` (bascule une tâche unique vers une autre période, réinitialise `createdAt` pour repartir sur un délai frais) et `handleDismissStaleNotice(taskId)` (marque la relance comme vue — `staleNoticeDismissedAt` pour les tâches uniques, `staleNoticeMissedCount = missedCount` pour les récurrentes, qui pourront donc re-alerter au prochain cycle manqué). |
| `src/app/utils/staleTasks.js` (nouveau) | `getStaleTaskAlerts(tasks, now)` — fonction pure qui calcule la liste des relances à afficher (tâches uniques Semaine/Mois non faites au-delà du seuil et pas encore ignorées ; tâches récurrentes dont `missedCount > staleNoticeMissedCount`). Ignore les tâches à échéance (`priority === "deadline"`). |
| `src/app/hooks/useStaleTaskAlerts.js` (nouveau) | Hook réévaluant `getStaleTaskAlerts` toutes les 5 min + au retour au premier plan (focus/visibilitychange), même schéma que `useTaskNotifications`. |
| `src/app/modals/AppModals.js` | Nouveau composant `StaleTaskModal` : affiche la tâche concernée, message adapté (semaine/mois), et selon le cas les boutons "Ajouter à la tâche quotidienne" (semaine, tâche unique), "Passer à la semaine"/"Passer au jour" (mois, tâche unique), ou juste "Compris" (récurrente). |
| `src/app/App.js` | Branche `useStaleTaskAlerts(state.tasks)`, affiche `StaleTaskModal` pour la première relance en attente (masquée si une notification popup est déjà affichée), câblée sur `handleDismissStaleNotice`/`handleChangeTaskPeriod`. |

`npm run build` OK (116 modules). Logique de détection (`getStaleTaskAlerts`) vérifiée par un script Node autonome (11 cas : tâches uniques semaine/mois avant/après seuil, déjà faites, déjà ignorées ; tâches récurrentes avec cycle manqué déjà notifié ou non ; tâche à échéance et tâche quotidienne toujours ignorées) — tous les cas passent. **Non testé en preview interactive de bout en bout** : l'app exige un compte Firebase connecté (pas de mode démo), donc impossible de créer une vraie tâche et vérifier l'apparition de la modale dans le navigateur sans les identifiants de l'utilisateur.

---

## [2026-08-05] — Repas : la navigation semaine suivante/précédente réinitialise le curseur sur lundi

L'utilisateur signale que lorsqu'il est sur le dernier jour de la semaine (dimanche) et passe à la semaine suivante, le curseur du jour sélectionné reste sur l'index précédent (dimanche de la nouvelle semaine) au lieu de revenir sur lundi. Cause : `selectedDayIdx` n'était initialisé qu'une fois (`useState(todayIdx)`) et jamais réinitialisé quand `weekOffset` changeait via les boutons ‹/›.

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | Boutons "Semaine précédente"/"Semaine suivante" : appellent désormais aussi `setSelectedDayIdx(0)` (lundi) en plus de `setWeekOffset`. Bouton "Cette semaine" (clic sur le libellé) : appelle `setSelectedDayIdx(todayIdx)` pour revenir sur le jour actuel. |

`npm run build` OK. Non re-testé en preview interactive (nécessite un compte connecté).

---

## [2026-08-05] — Nouveau site web officiel (page de présentation + réinitialisation de mot de passe), indépendant du bundle de l'app

L'utilisateur voulait une page web séparée de l'application (le "site officiel" de My Rolling Day, domaines `myrollingday.fr`/`myrollingday.com` déjà possédés) pour deux choses : présenter l'app publiquement, et gérer la réinitialisation de mot de passe (à la place de l'écran in-app `ResetPasswordScreen.js`, qui obligeait à charger tout le bundle React/Capacitor juste pour changer un mot de passe).

| Fichier | Changement |
|---|---|
| `site/index.html`, `site/style.css`, `site/favicon.svg` | Nouvelle page de présentation statique (HTML/CSS pur, sans build), reprend l'identité visuelle de l'app (polices Cormorant Garamond/DM Sans, couleurs `--mrd-*`, wordmark). CTA vers `https://my-rolling-day.web.app` (app réelle). |
| `site/reset-password.html` | Nouvelle page statique autonome : lit `oobCode` dans l'URL, utilise le SDK Firebase v10 modulaire via CDN (`gstatic.com/firebasejs/10.12.5`) pour appeler `verifyPasswordResetCode`/`confirmPasswordReset` directement (config Firebase publique, même projet `my-rolling-day`). Reprend la logique/les textes de l'ancien `ResetPasswordScreen.js`. |
| `functions/index.js` | `requestPasswordReset` : le lien envoyé par e-mail pointe désormais vers `https://myrollingday.fr/reset-password.html?oobCode=...` au lieu de `https://my-rolling-day.web.app/?mode=resetPassword&oobCode=...`. |
| `src/app/App.js`, `src/components/auth/ResetPasswordScreen.js` (supprimé), `src/app/providers/clientAuth.js` | Retrait de la route in-app `?mode=resetPassword` et du composant `ResetPasswordScreen` (plus utilisé) ; retrait des exports `verifyResetCode`/`confirmReset` devenus inutiles (la logique équivalente vit maintenant dans `site/reset-password.html`). |

**Hébergement final : pas Firebase Hosting, mais l'hébergement mutualisé existant de l'utilisateur** (`myrollingday.fr`/`myrollingday.com` étaient déjà pointés en DNS vers un serveur Plesk à `5.135.136.43`, deux comptes séparés — un par domaine). SSH indisponible sur ce plan (nécessite une demande à l'hébergeur) ; déploiement fait en **FTP** (ProFTPD, port 21) :
- Compte `.fr` : contenu réel du site (`index.html`, `style.css`, `favicon.svg`, `reset-password.html`) + `.htaccess` (`DirectoryIndex index.html index.php`, pour que l'ancien `index.php` placeholder de l'hébergeur — non supprimable, cf. ci-dessous — ne prenne pas le pas sur la nouvelle page).
- Compte `.com` : `index.html` (redirection JS) + `.htaccess` (`RewriteRule ^(.*)$ https://myrollingday.fr/$1 [R=301,L]`) → toute URL sur `.com` redirige en 301 vers la même URL sur `.fr`.
- Identifiants FTP des deux comptes stockés dans `.env` (déjà ignoré par git) : `FR_FTP_*` / `COM_FTP_*`.
- SSL : les certificats Let's Encrypt n'étaient au départ pas assignés aux domaines (le serveur servait son certificat par défaut, `dns40.domaine.fr` → `net::ERR_CERT_COMMON_NAME_INVALID` dans le navigateur) ; l'utilisateur les a assignés depuis son panneau Plesk. Reconfirmé ensuite en TLS direct (`SslStream.AuthenticateAsClient`) : `myrollingday.fr` → `CN=myrollingday.fr` (Let's Encrypt), `myrollingday.com` → `CN=myrollingday.com` (Let's Encrypt).
- `firebase.json` : la config hosting multi-site (`target: "app"`/`target: "site"`) ajoutée en cours de route pour un déploiement via Firebase Hosting a été **retirée** (revert à l'objet `hosting` unique d'origine) une fois la piste FTP retenue — elle aurait cassé `firebase deploy --only hosting` pour l'app (target `app` non résolu dans `.firebaserc`, jamais créé côté Firebase).
- **Reste en place, non bloquant** : les fichiers `index.php` placeholder d'origine sur les deux comptes FTP n'ont pas pu être supprimés (action bloquée par le classifieur de permissions Claude Code) — inertes, sans impact (voir contournement `.htaccess` ci-dessus pour le `.fr` ; le `.com` redirige de toute façon avant que `DirectoryIndex` n'entre en jeu).

Vérifié en conditions réelles une fois le SSL assigné : `https://myrollingday.fr` charge la page de présentation (contenu et absence d'erreur console confirmés via `get_page_text`/`read_console_messages`), `https://myrollingday.com` redirige bien vers `https://myrollingday.fr` (301, confirmé par navigation), `https://myrollingday.fr/reset-password.html` accessible. `reset-password.html` avait aussi été testé plus tôt en local avec un `oobCode` invalide → appel réel à l'API Firebase Auth du projet `my-rolling-day`, réponse `auth/invalid-action-code` correctement affichée, confirmant que l'intégration SDK CDN fonctionne de bout en bout.

---

## [2026-08-03] — Repas : picker de recette — modale fixe pendant la recherche (clavier mobile)

L'utilisateur signale que lors d'une recherche dans le picker "Choisir un repas", la modale bouge et le clavier gêne. Cause : `.meal-picker-backdrop`/`.meal-picker-modal` sont en `position: fixed`, mais rien n'empêchait la page en arrière-plan de défiler — sur mobile, le focus du champ de recherche déclenche le comportement natif du navigateur qui scrolle la page pour garder le champ visible au-dessus du clavier, ce qui décale visuellement toute la modale (bug classique iOS/Android avec `position: fixed` + clavier virtuel). De plus, les hauteurs de la modale étaient exprimées en `vh`, une unité qui ne tient pas compte du clavier virtuel sur certains navigateurs.

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | Nouveau `useEffect` (déclenché par `pickModal`) qui verrouille le scroll de la page tant que le picker est ouvert : `document.body` passe en `position: fixed` (avec `top: -scrollY` pour compenser) + `overflow: hidden`, restauré (position/top/overflow + `window.scrollTo`) à la fermeture. Empêche le navigateur de scroller la page en arrière-plan quand le clavier apparaît, donc la modale ne bouge plus. Import de `useEffect` ajouté. |
| `src/theme/styles.css` | `.meal-picker-modal` (3 endroits : base, `.mrd-shell`, media query mobile ≤720px) : ajout d'une déclaration `max-height` en `dvh` juste après celle en `vh` (le navigateur retient la dernière valeur supportée) — `dvh` s'ajuste dynamiquement à la présence du clavier, contrairement à `vh`. |

Vérifié en preview (session réelle de l'utilisateur déjà connectée dans le navigateur de dev — aucune donnée modifiée, fermeture du picker sans sélectionner de recette) : ouverture du picker "Choisir un repas" → `document.body.style.position` passe bien à `"fixed"` et `overflow` à `"hidden"` ; frappe dans le champ de recherche → `window.scrollY` reste à `0`, aucun décalage ; fermeture (✕) → styles du body restaurés (`position`/`overflow` vides) et backdrop retiré du DOM. Revérifié en viewport mobile (375×812) : même comportement, `max-height` de la modale calculée en `dvh` (714,56px = 88 % de 812px). `npm run build` OK (115 modules, aucune erreur). Aucune nouvelle erreur console (seuls les warnings React préexistants, sans rapport).

---

## [2026-08-03] — Espace Premium : transformation de l'écran d'accroche en vrai écran de vente

L'utilisateur voulait un "vrai écran de vente" à la place du simple écran d'accroche (icône + texte + bouton "Découvrir Premium" qui ouvrait juste les Réglages) affiché sur Repas/Inventaire/Recettes quand le foyer n'est pas Premium. Choix validés avec l'utilisateur : afficher un tarif mensuel + annuel (annuel mis en avant avec badge de réduction), et faire en sorte que le bouton principal active directement le statut Premium (toggle de test `premiumOverride`, en attendant le vrai paiement RevenueCat/Stripe — cf. entrée du 2026-07-14).

| Fichier | Changement |
|---|---|
| `src/app/pages/premium/PremiumLockScreen.js` | Réécrit : liste de 5 bénéfices (repas, inventaire, recettes, lien liste↔inventaire, "pour tout le foyer"), sélecteur de plan Mensuel (4,99 €/mois) / Annuel (39,99 €/an, badge "Économise 33 %", affiché par défaut), bouton principal dont le libellé reflète le plan choisi ("Activer Premium — X €/mois ou /an"), et bouton secondaire "Gérer depuis les Réglages" (renvoie vers `onOpenPremiumSettings`, comportement inchangé). Nouvelle prop `onActivatePremium`. |
| `src/app/App.js` | Nouveau handler `handleActivatePremium` (= `runFamilyAction(() => setFamilyPremiumOverride(currentFamilyId, true))`, même mécanique que le toggle des Réglages) branché sur les 3 usages de `PremiumLockScreen` (`meals`, `inventory`, `recipes`) via la nouvelle prop `onActivatePremium`. |
| `src/theme/styles.css` | Nouvelles classes `.premium-lock-benefits(-benefit-icon)`, `.premium-lock-plans/.premium-lock-plan(.on)/-badge/-label/-price/-sub`, `.premium-lock-secondary` ; `.premium-lock-card` élargie (320px → 380px, marge réduite). Toutes basées sur les variables de couleur existantes (`--mrd-amber*`), donc compatibles dark mode sans règle supplémentaire. |

**Prix actuels codés en dur (4,99 €/mois, 39,99 €/an) : à ajuster si l'utilisateur vise un autre tarif.** Le bouton "Activer Premium" reste pour l'instant le même mécanisme de test que le toggle des Réglages (pas de vrai paiement) — à remplacer par le SDK RevenueCat/Stripe une fois les comptes externes créés.

Vérifié sans connexion (le compte réel nécessite une authentification, non testable ici) : composant monté directement via `import()` dans la console du navigateur sur la page d'accueil non authentifiée (`createRoot` + `html` de `lib.js`), styles Vite déjà chargés globalement. Confirmé : les 5 bénéfices s'affichent, le clic sur "Mensuel"/"Annuel" bascule bien le prix et le libellé du bouton principal, le clic sur "Activer Premium" déclenche bien le callback `onActivatePremium`. `npm run build` OK (115 modules, aucune erreur).

---

## [2026-07-27] — Fix : supprimer un membre (avec compte lié) le laissait toujours dans Firebase

L'utilisateur signale que supprimer un membre le laisse toujours visible sur Firebase. Cause : le bouton "Supprimer le compte" (`EditMemberModal`, `SettingsModals.js`) n'appelait que `handleDeletePerson` → `deleteFamilyPerson`, qui supprime uniquement la fiche `families/{familyId}/people/{personId}`. Le doc `families/{familyId}/members/{uid}` du compte lié (`linkedAccountId`) — celui qui donne réellement accès au foyer — n'était jamais touché : `removeFamilyMember(familyId, uid)` existait déjà dans `clientFamily.js` mais n'était appelée nulle part (code mort). De plus, même en la branchant, la règle Firestore sur `members/{uid}` n'autorisait que l'utilisateur lui-même à écrire son propre doc — un admin ne pouvait donc pas supprimer le doc membre de quelqu'un d'autre.

| Fichier | Changement |
|---|---|
| `src/app/hooks/useAuth.js` | `handleDeletePerson(personId)` : si la personne a un `linkedAccountId`, appelle désormais `removeFamilyMember(currentFamilyId, person.linkedAccountId)` avant de supprimer la fiche `people`. |
| `src/app/providers/clientFamily.js` | `removeFamilyMember` : ajout du garde-fou `assertUserIsNotLastAdmin` (absent jusqu'ici — un admin aurait pu se retirer lui-même en dernier admin, verrouillant le foyer). Retrait de la tentative d'écriture directe dans `users/{uid}` (échouait de toute façon sous les règles quand l'appelant n'est pas cet uid) — déléguée à la nouvelle Cloud Function ci-dessous. |
| `firestore.rules` | Nouveau helper `isFamilyAdmin(familyId)`. `match /members/{uid}` : `allow write` accepte désormais `request.auth.uid == uid` **ou** `isFamilyAdmin(familyId)` (un admin peut retirer un autre membre, pas seulement soi-même). |
| `functions/index.js` | Nouvelle Cloud Function `onMemberRemoved` (`onDocumentDeleted` sur `families/{familyId}/members/{uid}`) : nettoie côté serveur (Admin SDK, contourne les règles) le doc `users/{uid}` du membre retiré — `familyIds` (arrayRemove), `linkedMemberIdsByHousehold.{familyId}` (delete), `currentFamilyId` remis à `""` si c'était ce foyer. Nécessaire car un admin retirant quelqu'un d'autre n'a pas le droit d'écrire dans le `users/{uid}` d'un tiers ; le fallback client existant (`useAuth.js`, entrée du 2026-05-25) bascule déjà automatiquement l'utilisateur retiré sur un autre foyer accessible à sa prochaine connexion. |

`npm run build` OK, `node --check` OK sur `functions/index.js`, `clientFamily.js`, `useAuth.js`. **Reste à faire (action manuelle utilisateur)** : `firebase deploy --only firestore:rules,functions` puis redéployer le nouveau `dist/` — sans ce déploiement, le fix reste inactif en prod (règles + fonction encore anciennes côté serveur).

## [2026-07-27] — Retrait du mockup "téléphone Android" affiché en navigateur desktop

L'utilisateur (après la migration Capacitor) voulait pouvoir tester l'app "en version ordinateur" dans un navigateur normal et continuer à la déployer sur Netlify, tout en gardant Capacitor pour le natif à venir. En testant en preview à une largeur desktop (1280×800), l'app entière s'affichait à l'intérieur d'un mockup graphique de téléphone Android (bordure, boutons volume/power, encoche caméra, barre de gestes, label "Android · Grand écran"), mis à l'échelle pour tenir dans la fenêtre — confirmé en DOM (`.emu-phone`/`.emu-bg` présents dès `window.innerWidth >= 900`).

Cause : `src/main.js` enveloppait tout le rendu dans `<AndroidEmulator>` (`src/components/dev/AndroidEmulator.js`), un outil de dev pour prévisualiser le rendu mobile sur un grand écran, qui s'activait automatiquement sur toute fenêtre ≥900px de large — donc aussi en usage normal desktop/Netlify.

| Fichier | Changement |
|---|---|
| `src/main.js` | Suppression de l'import et de l'enveloppe `AndroidEmulator` : `root.render(html\`<${App} />\`)` directement, sans wrapper. |
| `src/components/dev/AndroidEmulator.js` | Fichier supprimé (plus aucune référence après le changement ci-dessus). |
| `src/theme/styles.css` | Suppression du bloc CSS mort associé (`.emu-bg`, `.emu-wrap`, `.emu-phone`, `.emu-btn`, `.emu-vol-up/-dn`, `.emu-pwr`, `.emu-frame`, `.emu-screen`, `.emu-punch`, `.emu-content`, `.emu-navbar`, `.emu-pill`, `.emu-label` + variante dark). |

Vérifié : `npm run build` OK (115 modules, aucune erreur). En preview à 1280×800, `document.querySelector('.emu-phone')` et `.emu-bg` sont désormais `null` — l'app s'affiche directement en pleine fenêtre. Aucune nouvelle erreur console (seuls des warnings React préexistants sur les attributs SVG kebab-case, sans rapport).

**Important** : ce correctif ne redessine pas l'app en vraie mise en page "bureau" (pas de barre latérale, pas de grilles multi-colonnes) — il retire seulement le mockup téléphone. L'app reste visuellement mobile-first (colonne unique, `BottomNav` en bas) même en grande fenêtre, ce qui correspond à une "version web normale". Une vraie refonte desktop (barre latérale, grilles plus larges par vue) reste un chantier séparé, à faire uniquement si demandé.

## [2026-07-27] — Fix "permission insuffisante" à l'acceptation d'un code d'invitation (rejoindre un foyer)

L'utilisateur signale qu'un membre invité par code reçoit "permission insuffisante" en rejoignant le foyer. Cause : `acceptHouseholdInvitation` (`src/app/providers/clientFamily.js`) faisait la création du doc `families/{familyId}/members/{uid}` **et** les écritures protégées par `isFamilyMember(familyId)` (`people/{personId}`, `families/{familyId}`, l'invitation) dans le **même** `writeBatch`. Or Firestore évalue les règles de sécurité d'un batch par rapport à l'état de la base **avant** le batch — `exists()`/`get()` ne voient pas les écritures des autres opérations du même batch. Résultat : au tout premier join, `isFamilyMember(familyId)` reste faux au moment d'évaluer les écritures sur `people`/`families`/`invitations`, qui échouent avec permission refusée.

| Fichier | Changement |
|---|---|
| `src/app/providers/clientFamily.js` | `acceptHouseholdInvitation` : le `setDoc` du doc membre (`families/{familyId}/members/{uid}`) est désormais fait seul, **avant** (`await`) le reste des écritures (`people`, `users`, invitation, `families`), qui restent groupées dans un second `writeBatch`. Ainsi `isFamilyMember(familyId)` est déjà vrai (doc membre committé) quand les règles évaluent le second batch. |

**Suite 1** : après premier redéploiement Netlify, l'utilisateur confirme que l'erreur persiste à l'identique. Cause réelle trouvée : `getDoc(personRef)` (lecture de `families/{familyId}/people/{personId}`) était appelé **avant** la création du doc membre, alors que la règle de lecture de `people` exige elle aussi `isFamilyMember(familyId)` — donc refusée en tout premier, avant même d'atteindre le batch corrigé plus haut. Fix : la lecture de `personRef` est déplacée **après** la création du membre. Rebuild + redéploiement Netlify.

**Suite 2 (résolution finale)** : toujours "permission insuffisante" après ce 2e fix — au point que l'utilisateur a dû désactiver temporairement toutes les règles Firestore en prod pour débloquer un test (**risque de sécurité** : base ouverte à tous tant que les règles n'étaient pas restaurées). Cause définitive : `previewHouseholdInvitation` (`src/app/providers/clientFamily.js`), appelée **avant** `acceptHouseholdInvitation` par `handleJoinHouseholdOnboarding` (`src/app/hooks/useAuth.js`) pour afficher le nom du foyer, lisait `families/{familyId}` directement — protégé lui aussi par `isFamilyMember`. Un non-membre échouait donc dès cet appel de preview, avant même d'atteindre le code déjà corrigé.

Plutôt que de continuer à corriger des lectures/écritures client une par une contre des règles `isFamilyMember`, la logique d'acceptation est déplacée **côté serveur** :
- `functions/index.js` : nouvelle Cloud Function callable `acceptInvitation` (europe-west1, Admin SDK — contourne les règles Firestore) qui fait toute la validation de l'invitation + création du membre + liaison du profil `people` + mise à jour `users`/`invitation`/`families`/`joinEvents` en une seule opération serveur.
- `src/app/providers/clientFamily.js` : `acceptHouseholdInvitation` appelle désormais `httpsCallable(functions, "acceptInvitation")` au lieu d'écrire directement dans Firestore. `createHouseholdInvitation` dénormalise maintenant `familyName` sur le doc invitation (lu par un membre existant, donc sans souci de permission) pour que `previewHouseholdInvitation` n'ait plus besoin de lire `families/{familyId}`.

Déployé (confirmation explicite de l'utilisateur) : `firebase deploy --only firestore:rules,functions:acceptInvitation` — règles sécurisées restaurées en prod + nouvelle fonction créée. **Reste à faire** : rebuild (`npm run build`, déjà fait) + redéploiement du `dist/` sur Netlify, puis retest réel du join.

**Test e2e** : ajout de `functions/test/acceptInvitation.e2e.test.js`, qui exécute le vrai code de `acceptInvitation` contre les émulateurs Firebase (Firestore + Auth + Functions — jamais la prod). Nécessite `"emulators"` dans `firebase.json` (ports 9099/5001/8080, `ui` sur 4000), absent jusqu'ici. Lancer avec `firebase emulators:exec --only firestore,auth,functions "node functions/test/acceptInvitation.e2e.test.js"`. 7 scénarios couverts, tous passants : join réussi (membre créé + `people.linkedAccountId` posé + invitation `accepted` + `joinEvent` créé, qui déclenche bien le trigger `onMemberJoined`), code inconnu (`not-found`), non authentifié (`unauthenticated`), email réservé à une autre adresse (`permission-denied`), invitation expirée (`failed-precondition`), profil déjà lié à un autre compte (`failed-precondition`, et vérifie qu'aucun membre fantôme n'est créé), code déjà utilisé (`failed-precondition`).

## [2026-07-27] — Déploiement en attente de la règle Firestore `mail` (reset de mot de passe, cf. entrée du 2026-07-16)

À la demande explicite de l'utilisateur : `firebase deploy --only firestore:rules` exécuté sur le projet `my-rolling-day`. Déploie la règle `match /mail/{mailId} { allow read, write: if false; }` ajoutée le 2026-07-16 (défense en profondeur pour la collection utilisée par la Cloud Function `requestPasswordReset`), restée non déployée jusqu'ici. Sans rapport avec le fix du join de foyer ci-dessus (celui-ci ne touche pas `firestore.rules`).

## [2026-07-27] — Connexion Google cassée en prod : `/__/auth/handler` renvoyait 404 (Page not found Netlify)

L'utilisateur signale un écran "Page not found" (404 Netlify) au clic sur "Continuer avec Google" sur le site déployé (`myrollingday.netlify.app`). Reproduit en preview : `signInWithPopup` échoue (`auth/popup-blocked`, normal en navigateur automatisé), fallback `signInWithRedirect` déclenché, puis `GET /__/auth/handler?...` → **404** (confirmé via `read_network_requests`).

Cause : les règles de proxy vers Firebase (`/__/auth/*`, `/__/firebase/*` → `my-rolling-day.firebaseapp.com`) sont définies dans `netlify.toml` à la racine du repo. Or le déploiement se fait par glisser-déposer du seul dossier `dist/` (cf. entrée du 2026-07-09 ci-dessous) — Netlify ne lit `netlify.toml` que s'il est présent dans le dossier déposé, donc ces règles n'ont jamais été appliquées en prod, même si le fichier existe bien dans le repo.

| Fichier | Changement |
|---|---|
| `public/_redirects` | Nouveau fichier (format Netlify `_redirects`) dupliquant les 2 règles de proxy `/__/auth/*` et `/__/firebase/*` de `netlify.toml`. Vite copie automatiquement le contenu de `public/` dans `dist/` au build, donc `_redirects` sera désormais inclus dans le prochain dossier `dist/` glissé-déposé sur Netlify. |

Vérifié : `npm run build` produit bien `dist/_redirects`. **Reste à faire (action manuelle utilisateur)** : re-glisser-déposer le nouveau dossier `dist/` sur Netlify pour que le correctif prenne effet en prod.

## [2026-07-16] — Réinitialisation de mot de passe : lien généré côté serveur (contournement du réglage cassé) + envoi par extension Firebase "Trigger Email"

Suite du chantier du [2026-07-16] précédent : la personnalisation de l'URL d'action dans la console Firebase reste cassée (probable dépréciation de Dynamic Links). Plutôt que d'attendre un correctif Firebase, le lien de réinitialisation est désormais généré nous-mêmes côté serveur via l'Admin SDK, indépendamment de ce réglage.

Vérification technique préalable (doc officielle Firebase, Admin SDK `generatePasswordResetLink`) : passer `actionCodeSettings.url` ne remplace **pas** le domaine du lien généré — il reste sur `.../__/auth/action?mode=resetPassword&oobCode=...`, `url` ne devient qu'un `continueUrl` secondaire. La solution retenue extrait donc le `oobCode` du lien généré par l'Admin SDK (ce code est indépendant de l'URL qui le transporte — seul compte l'appel REST via l'API key du projet) et reconstruit nous-mêmes `https://my-rolling-day.web.app/?mode=resetPassword&oobCode=...`, exploitable tel quel par `ResetPasswordScreen.js` (déjà en place).

Service d'envoi choisi avec l'utilisateur (parmi Resend / Brevo / Mailgun / extension Firebase) : l'extension officielle **"Trigger Email from Firestore"**, pour rester dans l'écosystème Firebase sans nouveau compte externe — configurée avec le SMTP Gmail de l'utilisateur (mot de passe d'application).

| Fichier | Changement |
|---|---|
| `functions/index.js` | Nouvelle Cloud Function callable `requestPasswordReset` (region `europe-west1`) : valide l'email, appelle `adminAuth.generatePasswordResetLink(email)`, extrait `oobCode` du lien retourné, reconstruit le lien vers `https://my-rolling-day.web.app/?mode=resetPassword&oobCode=...`, puis dépose un document dans la collection Firestore `mail` (`to`, `message.subject`, `message.html`) — surveillée par l'extension "Trigger Email from Firestore" qui envoie effectivement l'e-mail. Erreurs mappées en `HttpsError` avec messages français directement affichables (`not-found` si email inconnu, `invalid-argument` si email invalide). Nouveau helper `buildResetPasswordEmailHtml()` (template HTML inline, couleurs de l'app : fond crème `#FAF4ED`, accent terracotta `#B8654A`, texte brun `#3D2E22`, approximés depuis les variables OKLCH de `styles.css` — les clients mail ne supportent pas `oklch()`). |
| `src/app/providers/core.js` | Ajout de `export const functions = getFunctions(app, "europe-west1")` (import `getFunctions` depuis `firebase/functions`), même région que la nouvelle Cloud Function. |
| `src/app/providers/clientAuth.js` | `resetPassword(email)` n'appelle plus `sendPasswordResetEmail` (SDK client, retiré des imports) mais `httpsCallable(functions, "requestPasswordReset")`. Les erreurs (déjà en français côté serveur) remontent telles quelles — `formatAuthError` (`core.js`) retombe déjà sur `error.message` par défaut, aucun changement nécessaire côté formatage. |
| `firestore.rules` | Nouvelle règle explicite `match /mail/{mailId} { allow read, write: if false; }` — défense en profondeur (la collection contient des adresses e-mail ; en pratique seule la Cloud Function/l'extension y touchent, via Admin SDK qui contourne déjà les règles). |

`npm run build` OK (116 modules, aucune erreur). `node --check functions/index.js` OK.

**Reste à faire (actions manuelles utilisateur, avant tout déploiement)** :
1. Créer un mot de passe d'application Gmail (nécessite la validation en 2 étapes activée sur le compte Google).
2. Installer l'extension Firebase **"Trigger Email from Firestore"** (Console Firebase → Extensions) avec ce SMTP Gmail, collection `mail`, adresse d'expédition = l'adresse Gmail de l'utilisateur.
3. `firebase deploy --only functions,firestore:rules` — **pas encore fait**, en attente de confirmation explicite de l'utilisateur.

## [2026-07-16] — Firebase Hosting activé + écran de réinitialisation de mot de passe dans l'app (en attente de la personnalisation du lien e-mail Firebase)

L'utilisateur voulait que le lien "mot de passe oublié" reçu par e-mail ouvre une page à ses couleurs plutôt que la page générique `*.firebaseapp.com`. Comme l'app n'a jamais eu de site web publié (Capacitor uniquement, `firebase.json` n'avait ni `hosting`), il fallait d'abord un hébergement.

| Fichier | Changement |
|---|---|
| `firebase.json` | Ajout d'un bloc `hosting` (`public: "dist"`, rewrite `**` → `/index.html`). Déployé sur `https://my-rolling-day.web.app` (`firebase deploy --only hosting`). |
| `src/app/providers/clientAuth.js` | Ajout de `verifyResetCode(oobCode)` et `confirmReset(oobCode, newPassword)` (`verifyPasswordResetCode`/`confirmPasswordReset` de `firebase/auth`). |
| `src/app/providers/core.js` | `formatAuthError` : ajout des codes `auth/expired-action-code` et `auth/invalid-action-code`. |
| `src/components/auth/ResetPasswordScreen.js` (nouveau) | Écran de saisie du nouveau mot de passe (vérifie le `oobCode`, formulaire mot de passe + confirmation, réutilise les classes `auth-shell`/`auth-card`/`aform`/`ainp`/`aok`/`error-box` existantes). |
| `src/app/App.js` | Tout en haut du rendu (avant les branches erreur/splash/auth), détection de `?mode=resetPassword&oobCode=...` dans l'URL → affiche `ResetPasswordScreen` directement, sans dépendre de l'état d'auth/planner. |

**Bloqué** : la personnalisation de l'URL du lien d'action dans la console Firebase (Authentication → Templates → Réinitialisation du mot de passe → "Personnaliser l'URL d'action") échoue systématiquement avec le toast "Une erreur s'est produite lors de la modification de l'URL d'action" — confirmé en observant l'écran en direct (via computer-use), pas un problème de permissions ni de domaine autorisé (vérifié). Probablement lié à la dépréciation de Firebase Dynamic Links (25/08/2025) qui a cassé cette fonctionnalité côté Firebase. Tant que ce n'est pas résolu, le lien du mail continue de pointer vers la page Firebase par défaut — `ResetPasswordScreen.js` n'est donc pas encore atteint par le flux réel (testé uniquement en local avec un `oobCode` factice, qui affiche bien l'état "Lien invalide" attendu). Piste de repli proposée à l'utilisateur (pas encore implémentée, "on verra") : passer `actionCodeSettings.url` à `sendPasswordResetEmail` pour au moins afficher un lien "Continuer vers l'app" sur la page Firebase par défaut après la réinitialisation.

## [2026-07-14] — Espace Premium : verrouillage Inventaire/Recettes/Repas + mise en avant visuelle

L'utilisateur veut transformer l'app en modèle freemium : les modules Inventaire, Recettes et Repas, ainsi que le bouton "Lié à l'inventaire" des Listes, deviennent des fonctionnalités Premium. Discussion préalable sur la stratégie de paiement (distribution à la fois stores + web → RevenueCat pour unifier IAP Apple/Google et Stripe, à mettre en place par l'utilisateur lui-même via des comptes externes). Cette étape met en place uniquement la mécanique de verrouillage, pilotée par un statut premium simulé/manuel (`premiumOverride` sur le document foyer), activable depuis les Réglages pour tester — le vrai statut d'abonnement remplacera ce flag plus tard, le calcul de `isPremium` étant centralisé au même endroit.

| Fichier | Changement |
|---|---|
| `src/app/providers/clientFamily.js` | Nouvelle fonction `setFamilyPremiumOverride(familyId, value)` (même forme que `renameFamily`), écrit `premiumOverride` sur `/families/{familyId}`. Aucune règle Firestore à modifier (le foyer est déjà écrit par tout membre) — limite connue à durcir (écriture réservée aux Cloud Functions) une fois le vrai paiement branché. |
| `src/app/utils/premium.js` (nouveau) | `PREMIUM_TABS` (`meals`, `inventory`, `recipes`) et `isPremiumTab(tab)`, point central réutilisé par `App.js` et `BottomNav.js`. |
| `src/app/pages/premium/PremiumLockScreen.js` (nouveau) | Écran d'accroche (étoile, titre/texte selon `feature`, bouton "Découvrir Premium") affiché à la place du contenu des modules verrouillés. |
| `src/app/App.js` | `isPremium` dérivé de `currentFamily?.premiumOverride` ; les branches `activeTab === "meals"/"inventory"/"recipes"` affichent `PremiumLockScreen` si `!isPremium` ; `ListsView` reçoit `isPremium` + `onRequirePremium` (toast) ; `SettingsView` reçoit `isPremium` + `onSetPremiumOverride` ; `BottomNav` reçoit `isPremium`. |
| `src/app/pages/lists/ListsView.js` | Bouton "Lié à l'inventaire" (liste existante + formulaire de création) verrouillé si `!isPremium` : icône 🔒, clic déclenche `onRequirePremium` au lieu de basculer `addToInventory`. |
| `src/app/pages/settings/SettingsView.js` | Nouvelle section "Premium" (toggle de test `SettingsToggleRow`), enveloppée dans `.premium-section-highlight` pour un style dégradé ambre→rouge-brique tant que non actif (état `.is-active` plus sobre une fois le premium activé). |
| `src/app/components/nav/BottomNav.js` | Petite étoile ⭐ (`.mrd-bnav-premium-star`) sur l'onglet "Repas" et sur les entrées "Inventaire"/"Recettes" du menu "Plus" quand `!isPremium` (Listes/Notes/Historique restent sans étoile). |
| `src/theme/styles.css` | Classes `.premium-lock-*`, `.mrd-inv-badge.locked`, `.mrd-bnav-premium-star(-tab)`, `.premium-section-highlight(.is-active)`. |

Vérifié en preview (`preview_click`/`preview_eval`/`preview_snapshot`) : bascule du toggle "Premium actif (test)" → écriture Firestore confirmée par lecture directe du document et persistance après rechargement complet de la page ; écran d'accroche affiché sur Repas/Inventaire/Recettes quand non premium, contenu normal une fois actif ; étoiles présentes uniquement sur Repas (nav) et Inventaire/Recettes (menu Plus), absentes sur Listes/Notes/Historique ; dégradé de la carte "Premium" confirmé via `getComputedStyle`. Aucune erreur console liée au nouveau code (seuls des warnings React pré-existants, sans rapport).

## [2026-07-14] — Réinitialisation de mot de passe : écran dédié dans l'app + Firebase Hosting

L'utilisateur ne voulait plus que le lien "mot de passe oublié" reçu par mail renvoie vers la page générique `*.firebaseapp.com/__/auth/action` : il voulait un écran à ses propres couleurs. Comme l'app est distribuée en natif via Capacitor (Android/iOS) et n'avait aucune version web hébergée (`firebase.json` ne contenait que `firestore`/`functions`), il fallait d'abord publier le build Vite existant en tant que site (Firebase Hosting) pour disposer d'une URL HTTPS à donner à Firebase Auth, puis y ajouter un écran de réinitialisation. L'app n'a pas de router (navigation par état React dans `App.js`) : le lien Firebase (`?mode=resetPassword&oobCode=...`) est donc détecté en query string sur l'URL racine, avant toute autre branche de rendu (erreur/splash/auth), pour ne pas dépendre du chargement de l'auth/planner.

| Fichier | Changement |
|---|---|
| `firebase.json` | Ajout d'un bloc `hosting` (`public: "dist"`, rewrite `**` → `/index.html`), en plus de `firestore`/`functions` déjà présents. |
| `src/app/providers/clientAuth.js` | Ajout de `verifyResetCode(oobCode)` (`verifyPasswordResetCode`) et `confirmReset(oobCode, newPassword)` (`confirmPasswordReset`), importés depuis `firebase/auth`. |
| `src/app/providers/core.js` | `formatAuthError` : nouveaux cas `auth/expired-action-code` et `auth/invalid-action-code` (messages français). |
| `src/components/auth/ResetPasswordScreen.js` (nouveau) | Écran autonome : vérifie le `oobCode` au montage, affiche un formulaire nouveau mot de passe + confirmation (validation ≥6 caractères, correspondance), appelle `confirmReset`, puis écran de succès. Réutilise entièrement les classes CSS existantes (`auth-shell`, `auth-card`, `aform`, `ainp`, `aok`, `error-box`) — aucun nouveau CSS. |
| `src/app/App.js` | Import de `ResetPasswordScreen` ; ajout d'une branche de routing prioritaire (avant même l'écran d'erreur de démarrage) qui détecte `?mode=resetPassword&oobCode=...` dans `window.location.search` et affiche l'écran dédié. |

Vérifié en preview (`preview_eval` pour naviguer vers `?mode=resetPassword&oobCode=...` + `preview_screenshot`) : avec un `oobCode` invalide, l'écran "Lien invalide" s'affiche correctement, aux couleurs de l'app, sans erreur console liée au nouveau code.

Reste à faire (actions manuelles, pas encore effectuées) : déployer le hosting (`npm run build` + `firebase deploy --only hosting`), puis dans la console Firebase (Authentication → Templates → Réinitialisation du mot de passe) renseigner l'URL d'action personnalisée vers le domaine Hosting obtenu.

## [2026-07-14] — Inventaire : ajout d'article — unité en placeholder grisé + sélection du rangement à la création

Deux ajustements demandés sur la modale "Ajouter un article" : (1) le select "Unité" (dans "Plus d'informations") affichait un simple tiret "—" comme option vide, sans indiquer que le champ concerne l'unité — remplacé par le mot "Unité" affiché en grisé (même couleur que les placeholders des champs texte) tant qu'aucune unité n'est choisie. (2) Quand le mode Organiser est actif, il n'existait aucun moyen de choisir le rangement d'un article directement à la création — il fallait ajouter l'article (qui atterrissait dans "Non rangé"), puis le déplacer via "Ranger". Un item ajouté depuis l'onglet d'un rangement (ex. "SM") n'y était même pas rattaché automatiquement.

| Fichier | Changement |
|---|---|
| `src/app/pages/inventory/InventoryView.js` | `UNITS[0].label` : `"—"` → `"Unité"` (valeur `""` inchangée). Le `<select>` unité applique `color: var(--mrd-fg3)` tant que `form.unit` est vide, `var(--mrd-fg)` une fois une unité choisie. Nouveau bloc "Lieu de rangement" (select, visible uniquement si `organiserMode`) inséré juste sous "Nom de l'article", avec la même présentation que le select du Ranger (flèche ▼, option "Non classé"). `form.storageLocationId` ajouté à `emptyForm()`, pré-rempli avec `activeLocation.id` dans `openCreateModal()` (si on est déjà dans l'onglet d'un rangement) et avec `item.storageLocationId` dans `openEditModal()`. `submitInventory()` inclut désormais `storageLocationId: form.storageLocationId || ""` dans le payload envoyé à `onAddInventoryItem`/`onUpdateInventoryItem`. |
| `src/app/hooks/useLists.js` | `handleAddInventoryItem` : l'objet créé inclut désormais `storageLocationId: item.storageLocationId || ""` (auparavant toujours absent, donc l'article atterrissait systématiquement dans "Non rangé"). |

## [2026-07-14] — Repas : vue mois — semaine en cours en haut + clic sur un jour renvoie vers le choix des repas

Dans l'aperçu "Mois" des repas, les semaines étaient affichées dans l'ordre chronologique brut. L'utilisateur voulait que la semaine réelle en cours remonte tout en haut (sans que les autres semaines du mois disparaissent), et que cliquer sur un jour dans cette vue mois permette d'aller choisir ses repas : un 1er clic sélectionne juste le jour (surlignage), un 2e clic sur le même jour bascule vers la vue "semaine" avec ce jour sélectionné (où les boutons "Choisir un repas" sont visibles).

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | `renderMonthView()` : les `weeks` calculées sont triées (`orderedWeeks`) pour placer en premier la semaine dont la clé correspond à `todayMonday` (semaine réelle actuelle), le reste restant dans l'ordre chronologique — toutes les semaines du mois restent affichées. Les lignes de jour (`div` non cliquable) sont devenues des `<button>` avec un état `selectedMonthDayKey` : 1er clic → sélectionne le jour (classe `.selected`), 2e clic sur le jour déjà sélectionné → `setWeekOffset` sur la semaine correspondante + `setSelectedDayIdx` + `setViewMode("week")`, ce qui renvoie sur la vue semaine avec le bon jour actif. |

Vérifié en preview (`preview_click` + `preview_eval` + `preview_snapshot`) : depuis "Cette semaine" → clic "Mois" → la semaine "13 – 19 JUILLET" apparaît bien en tête, suivie de toutes les autres semaines de juillet ; clic sur "Mer 15" ajoute la classe `selected`, un second clic bascule vers la vue semaine avec le pill "Mer15" actif (`on`).

---

## [2026-07-14] — Inventaire : stepper −/+ sur la quantité (au lieu d'un bouton "−1" dans la barre d'actions)

L'utilisateur voulait pouvoir augmenter/diminuer la quantité d'un produit sans passer par le menu ⋮ → Modifier. Premier essai : bouton "−1" isolé dans la barre d'actions (`inv-item-action-row`, à côté de "À racheter"/"Fini") — repositionné à la demande de l'utilisateur : la quantité affichée devient elle-même un stepper, avec "−" à gauche et "+" à droite du nombre, et un vrai bouton d'incrément a été ajouté (seul le décrément existait avant).

| Fichier | Changement |
|---|---|
| `src/app/pages/inventory/InventoryView.js` | Nouvelle fonction `incrementItemQuantity(item)` (ajoute 1 à `item.quantity`), en plus de `decrementItemQuantity(item)` (soustrait 1, bascule en `stockState: "empty"` si le résultat atteint 0 — même comportement que le bouton "Fini"). Suppression du bouton "−1" de `inv-item-action-row`. À la place, la ligne où s'affichait la quantité (`qtyLabel`) est remplacée par un `.inv-qty-stepper` (`− valeur +`) quand l'article n'est pas fini et a une quantité numérique (`canStepQty`) ; sinon la quantité reste affichée en texte simple comme avant. |
| `src/theme/styles.css` | Nouvelles classes `.inv-qty-stepper`, `.inv-qty-step-btn` (petit bouton rond 22px), `.inv-qty-step-value`. |

Vérifié en preview (`preview_eval` + `preview_screenshot`) : clic sur "+" incrémente bien l'article ciblé (ex. Balayette 4→5) sans affecter les autres lignes ; clic sur "−" décrémente (5→4) ; le stepper est bien positionné à l'endroit où était affichée la quantité, avec "−" à gauche et "+" à droite.

---

## [2026-07-09] — Publication Netlify : erreur "Unable to read file nestedResourcesValidationReport.txt" + icônes de catégorie manquantes en prod

L'utilisateur publie sur Netlify par glisser-déposer. Deux problèmes distincts détectés :

1. **Erreur au dépôt** : il glissait le dossier du projet entier (au lieu du dossier `dist/` généré par le build), ce qui incluait `node_modules/` et `android/app/build/` — dont un fichier Gradle verrouillé/introuvable (`nestedResourcesValidationReport.txt`) qui faisait échouer l'upload. Nettoyage des artefacts Gradle obsolètes (`android/app/build`, `android/build`, `android/.gradle`, et les `build/` dans les packages Capacitor de `node_modules`). Solution : ne publier que le dossier `dist/` (généré par `npm run build`), jamais la racine du projet.
2. **Icônes de catégorie de recettes invisibles une fois publié** (visibles en dev seulement) : `src/app/pages/recipes/CategoryIcons.js` référençait les SVG (`entree.svg`, `plat.svg`, etc.) via un chemin brut en chaîne de caractères (`"./src/assets/icons/entree.svg"`) au lieu d'un `import`. Vite sert `src/` tel quel en dev, mais au build seuls les fichiers réellement importés comme modules sont copiés/hashés dans `dist/assets/` — ce chemin `src/...` n'existe plus en prod, d'où les logos manquants (visible notamment dans "Repas du jour" via `CategoryIcon`).

| Fichier | Changement |
|---|---|
| `src/app/pages/recipes/CategoryIcons.js` | Les 6 icônes SVG (`entree`, `plat`, `dessert`, `petit-dejeuner`, `boisson`, `fait-maison`) sont désormais importées en haut de fichier (`import xIcon from "../../assets/icons/x.svg"`) au lieu d'un chemin `src/...` en dur dans `CATEGORY_CONFIG`. |

Vérifié : `npm run build` produit bien les 6 SVG hashés dans `dist/assets/` (absents avant le correctif) ; en preview, le `mask-image` de l'icône "Plat" du repas du jour résout et charge (200) correctement.

## [2026-07-09] — Repas : bouton valider entrée/dessert affichait toujours ✓ + toast de déduction silencieux

L'utilisateur voulait un vrai bouton de validation (coche/croix) sur les lignes entrée/dessert des repas, qui déclenche la déduction d'inventaire comme le fait déjà le bouton "Marquer cuisiné" du plat principal, et un message visible confirmant la déduction. La logique de déduction (`computeMealCookState` dans `App.js`) gérait déjà les sous-slots entrée/dessert — le vrai problème était double : (1) le petit bouton ✓ affichait `"✓"` dans les deux états (validé et non validé), donc rien ne distinguait visuellement l'état ; (2) le toast de confirmation ne s'affichait que si `deductedAny` était vrai (au moins un ingrédient trouvé en stock) — si la recette n'avait aucun ingrédient en inventaire, aucun message n'apparaissait, donnant l'impression que rien ne s'était passé.

| Fichier | Changement |
|---|---|
| `src/app/pages/meals/MealsView.js` | `extraRecipeRow()` : le bouton affiche désormais `"○"` quand non validé et `"✓"` (style `.on`, vert) une fois validé, au lieu de `"✓"` dans les deux cas. |
| `src/app/App.js` | `handleToggleCookWithInventory()` : le toast s'affiche désormais systématiquement quand un repas lié à l'inventaire est marqué cuisiné — "Les ingrédients ont bien été déduits de votre inventaire" (avec Annuler) si `deductedAny`, sinon "Aucun ingrédient de cette recette n'a été trouvé dans l'inventaire". |

Vérifié en preview (accessibilité + `preview_inspect` sur `.app-toast` + logs console) : ajout d'un dessert ("Compote pomme poire maison") avec "Lié à l'inventaire" actif → clic sur le bouton passe de ○ à ✓ (fond vert) et le toast apparaît en bas de l'écran à chaque validation.

## [2026-07-09] — Pense-bête : retrait des chips Tâche/Événement/Note à la saisie

L'utilisateur classe ses items de pense-bête après coup (via les boutons ✅ Tâche / 📅 Agenda / 📝 Note sur chaque item déjà capturé), donc proposer ces mêmes choix au moment de la saisie (ligne de chips sous le textarea) était redondant et sans effet utile.

| Fichier | Changement |
|---|---|
| `src/app/pages/inbox/InboxView.js` | Suppression de la `ibx-hint-row` (les 3 chips "Tâche/Événement/Note" affichés sous le champ de saisie) et de l'état `selectedHint` associé. `handleAdd()` appelle désormais `onAddInboxItem(text, null)` — le hint n'est plus choisi à la capture, seulement au tri via les boutons de dispatch existants sur chaque item. |

Vérifié en preview : le champ de saisie du pense-bête n'affiche plus que le textarea et "+ Capturer" ; le tri par item (✅/📅/📝) fonctionne toujours normalement.

## [2026-07-09] — HistoryView : flux trié par jour (cartes par personne sous chaque date)

Premier essai : garder les colonnes par personne et juste ajouter un en-tête de jour à l'intérieur de chaque colonne — rejeté par l'utilisateur, ce n'était pas le classement voulu. Le besoin réel : le classement doit être par date en premier niveau ("Aujourd'hui" tout en haut, puis les jours précédents en dessous), et sous chaque date, une carte par personne avec ce qu'elle a fait ce jour-là.

| Fichier | Changement |
|---|---|
| `src/app/pages/history/HistoryView.js` | Restructuration complète. `groupByDay()` regroupe tout `history` (déjà trié plus récent → plus ancien via `unshift`) par `entry.date`. Pour chaque jour, `groupByUser()` sous-groupe les entrées par personne. Rendu : une section par jour (`.history-day`, titre via `dayLabel()` = "Aujourd'hui"/"Hier"/date), contenant une grille de cartes personne (`.history-person-card`, réutilise `.history-column-head`/`.history-column-body`/`.history-entry*`). |
| `src/theme/styles.css` | `.history-columns`/`.history-column` renommés `.history-day-cards`/`.history-person-card` (et leurs variantes dark mode / `.mrd-shell`). Nouvelles classes `.history-feed` (colonne verticale des jours) et `.history-day-title` (titre de section par date). |

## [2026-07-09] — Nav du bas : bouton "Plus" (accès rapide) à la place de "Listes"

L'onglet "Listes" de la nav du bas était le seul accès direct à Notes/Inventaire/Recettes/Historique en plus de la section "Accès rapide" de l'accueil, jugée pas assez visible par l'utilisateur.

| Fichier | Changement |
|---|---|
| `src/app/components/nav/BottomNav.js` | Remplacement de l'onglet "Listes" par un bouton "Plus" (icône +) qui ouvre un menu popup au-dessus de la nav avec 5 accès : Listes, Notes, Inventaire, Recettes, Historique. Fermeture au clic extérieur (`mousedown` sur `document`) ou après sélection d'un item. |
| `src/theme/styles.css` | Nouvelles classes `.mrd-bnav-quick-wrap`, `.mrd-bnav-quick-menu`, `.mrd-bnav-quick-item(-emoji)` (+ variantes dark mode), inspirées du pattern `task-menu-*` déjà utilisé ailleurs (ex. kebab menu de `ListsView.js`). |

Vérifié en preview : ouverture/fermeture du menu et navigation vers chacun des 5 items fonctionnent.

## [2026-07-14] — Accueil : suppression de la section "Accès rapide"

Depuis l'ajout du bouton "Plus" dans la nav du bas (Notes/Inventaire/Recettes/Historique), la section "Accès rapide" en bas de l'accueil faisait doublon avec les mêmes 4 accès.

| Fichier | Changement |
|---|---|
| `src/app/pages/home/HomeView.js` | Suppression de la section "Accès rapide" (grille de 4 boutons) et de la constante `QUICK_ITEMS` devenue inutile. `marginBottom: 24` déplacé sur la section "Pense-bête à trier", désormais la dernière section de la page, pour conserver l'espacement en bas. |
| `src/theme/styles.css` | Suppression des classes CSS devenues orphelines : `.mrd-quick-grid`, `.mrd-quick-btn`, `.mrd-quick-btn-icon-wrap`, `.mrd-quick-btn-icon`, `.mrd-quick-badge`, `.mrd-quick-btn-label`. |

Vérifié en preview (`preview_snapshot` + `preview_screenshot`) : la section a bien disparu de l'accueil, l'espacement en bas de page est conservé, et les 4 accès restent disponibles via le bouton "Plus" de la nav du bas.

---

## [2026-07-09] — Mise en prod infra Firebase + fix package ID + build Android OK

Déploiement de l'infra Firebase (créée mais jamais déployée depuis la migration Capacitor du 2026-06-07), découverte et correction d'un mismatch d'identifiant d'app, et build Android qui compile enfin.

**1. Déploiement Firebase (projet `my-rolling-day`) :**
| Action | Détail |
|---|---|
| `firebase deploy --only firestore:rules` | Règles Firestore déployées en prod, compilées sans erreur. |
| `firebase deploy --only functions` | 4 Cloud Functions déployées : `sendScheduledNotifications` (europe-west1), `onMemberJoined`, `onTaskCreated`, `onTaskAssigned` (us-central1). 1er essai : les 3 dernières ont échoué (erreur Eventarc Service Agent — normal lors de la 1ère utilisation des functions 2nd gen sur un projet, permissions IAM pas encore propagées). Réessai quelques minutes après → succès. |
| `firebase functions:artifacts:setpolicy` | Politique de nettoyage auto configurée (supprime les images de conteneurs Artifact Registry > 1 jour dans us-central1) pour éviter un coût résiduel. |

**2. Bug trouvé : mismatch de package ID `com.myrollingday.app` vs `fr.myrollingday.app`**

`google-services.json` et `GoogleService-Info.plist` (générés dans la Console Firebase) étaient enregistrés sous `fr.myrollingday.app`, alors que tout le reste du projet (`capacitor.config.json`, `android/app/build.gradle`, `ios/App/App.xcodeproj`) utilisait `com.myrollingday.app` depuis la migration Capacitor. Confirmé avec l'utilisateur : **`fr.myrollingday.app` est le bon identifiant** — tout le reste a été renommé pour matcher.

| Fichier | Changement |
|---|---|
| `capacitor.config.json` | `appId` → `fr.myrollingday.app`. Aussi : `serverClientId` du plugin GoogleAuth (placeholder `REMPLACE_PAR_TON_WEB_CLIENT_ID` non résolu) → vrai Web Client ID `543367828677-oiu5v3kgh38g3go24drolk79ceq6ctna.apps.googleusercontent.com` (trouvé dans `google-services.json`, `client_type: 3`). |
| `android/app/build.gradle` | `namespace` + `applicationId` → `fr.myrollingday.app`. |
| `android/app/src/main/java/com/myrollingday/app/MainActivity.java` | Déplacé vers `android/app/src/main/java/fr/myrollingday/app/MainActivity.java`, `package` mis à jour. |
| `android/app/src/main/res/values/strings.xml` | `package_name` et `custom_url_scheme` → `fr.myrollingday.app` (non régénéré automatiquement par `npx cap sync`, édité à la main). |
| `ios/App/App.xcodeproj/project.pbxproj` | `PRODUCT_BUNDLE_IDENTIFIER` (Debug + Release) → `fr.myrollingday.app`. |
| `google-services.json` | Copié depuis la racine vers `android/app/google-services.json` (emplacement attendu par le plugin Gradle `com.google.gms.google-services`, sinon appliqué silencieusement en no-op). |

**3. Build Android : succès**

`cd android && ./gradlew.bat assembleDebug` → `BUILD SUCCESSFUL`. APK généré : `android/app/build/outputs/apk/debug/app-debug.apk`. Modifs Gradle déjà présentes (non liées à cette session) qui ont aidé : AGP `8.2.1` → `8.13.2`, Gradle wrapper `8.2.1` → `8.13`, `org.gradle.java.home` pointé vers un JDK 21 installé localement.

**4. iOS : préparé mais build non vérifiable (pas de Mac dans cette session)**

Le plugin `capacitor-google-auth` (`node_modules/@codetrix-studio/capacitor-google-auth/ios/Plugin/Plugin.swift`) lit le `CLIENT_ID` depuis `GoogleService-Info.plist` bundlé dans l'app si aucun `iosClientId`/`clientId` n'est fourni dans la config du plugin (ce qui est le cas ici — seul `serverClientId` est défini).

| Fichier | Changement |
|---|---|
| `ios/App/App/GoogleService-Info.plist` | Copié depuis la racine (bon emplacement conventionnel dans le projet Xcode). |
| `ios/App/App/Info.plist` | Ajout de `CFBundleURLTypes` avec le schéma `com.googleusercontent.apps.543367828677-3ehl9p5tftqfn343cspvrt108s7ckglv` (= `REVERSED_CLIENT_ID` de `GoogleService-Info.plist`) — nécessaire pour que le redirect OAuth Google Sign-In revienne dans l'app native. |

### ⚠️ Action requise sur Mac (à faire avant tout build/run iOS)

1. **Ajouter `GoogleService-Info.plist` au target Xcode** — le fichier est bien placé sur le disque (`ios/App/App/GoogleService-Info.plist`) mais n'est **pas référencé** dans `ios/App/App.xcodeproj/project.pbxproj`. Sans ça, Xcode ne l'embarque pas dans le bundle et `Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")` retournera `nil` côté plugin Google Auth → login natif cassé. Dans Xcode : clic droit sur le groupe "App" → *Add Files to "App"...* → sélectionner le fichier → cocher *Copy items if needed* + target *App*. (Non fait par edit manuel du `.pbxproj` : format fragile à UUIDs, trop risqué de le bricoler à l'aveugle sans Xcode pour vérifier.)
2. `cd ios/App && pod install` (CocoaPods ne tourne pas sur Windows).
3. Ouvrir `ios/App/App.xcworkspace` (pas le `.xcodeproj`) et builder pour vérifier que ça compile, comme pour Android.

**5. Rien n'est committé** — `.firebaserc` / `firebase.json` / `firestore.rules` / tous les changements Android/iOS de cette session restent en attente d'un commit groupé une fois le chantier natif (Android + iOS) entièrement vérifié.

---

## [2026-06-07] — Migration Capacitor (Vite + Android + iOS)

Ajout de Vite comme bundler et intégration Capacitor pour produire des apps natives Android et iOS.

| Fichier / Dossier | Changement |
|---|---|
| `package.json` | Ajout deps : `react`, `react-dom`, `htm`, `firebase`, `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` ; devDeps : `vite`, `@capacitor/cli` ; scripts : `dev`, `build`, `preview`, `cap:sync`. |
| `vite.config.js` | Nouveau fichier — configuration Vite minimale (`publicDir: "public"`, `build.outDir: "dist"`). |
| `capacitor.config.json` | Nouveau fichier — `appId: "com.myrollingday.app"`, `webDir: "dist"`, `androidScheme: "https"`. |
| `src/app/lib.js` | Imports CDN esm.sh → npm `react`, `react-dom/client`, `htm`. |
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
| `src/app/utils/state.js` | `normalizeState` → `taskNotifications.weeklyReminder: state.taskNotifications?.weeklyReminder !== false` (activé par défaut). Version `?v=2026-05-28-weekly-notif-1`. |
| `src/app/pages/settings/SettingsView.js` | Ajout de `weeklyReminder` dans l'objet `notif` et dans `activeNotificationItems`. Nouveau toggle 📆 "Taches hebdomadaires en attente" dans la section "Types d'alertes" (en dernier, avec `last`). Version `?v=2026-05-28-weekly-notif-1`. |
| `src/app/App.js` | Mise à jour des versions d'import `state.js` et `SettingsView.js`. |

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
| `src/app/providers/clientFamily.js` | `createHouseholdInvitation` : supprime la garde `if (person.linkedAccountId)` qui bloquait la création d'un code pour un membre dont le compte était déjà lié. La sécurité reste assurée côté `acceptHouseholdInvitation` : seul le même uid peut ré-accepter le code. Utile quand un membre perd l'accès au foyer (ex. `currentFamilyId` réinitialisé ou document membre manquant) — le ré-accept recrée le document membre et remet `currentFamilyId` à jour. Version `?v=2026-05-26-reinvite-linked-1`. |
| `src/app/providers/client.js` | Mise à jour du numéro de version de `clientFamily.js`. |
| `src/app/pages/settings/SettingsView.js` | (1) `editModalCanInvite` : retire `!editModalPerson.linkedAccountId` → bouton visible même si compte déjà lié. (2) Passe `linkedAccount={editModalLinkedAccount}` à `EditMemberModal`. Version `?v=2026-05-26-reinvite-linked-1`. |
| `src/app/modals/SettingsModals.js` | `EditMemberModal` : (1) nouveau prop `linkedAccount` ; (2) affiche l'email du compte lié sous le nom dans l'en-tête de la modal ; (3) label du bouton → `"Recréer l'accès"` si compte déjà lié, sinon `"Recreer un code"` / `"Creer un code"`. |
| `src/theme/styles.css` | Ajout de `.foyer-modal-member-info`, `.foyer-modal-member-email`, `.foyer-modal-member-email--unknown` pour l'affichage de l'email sous le nom. |
| `src/app/App.js` | Mise à jour du numéro de version de `SettingsView.js`. |

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
| `src/app/pages/agenda/AgendaView.js` | Suppression du `!form.repeatWeekly ?` qui cachait le toggle 🔔 ; `enabled: agendaNotifEnabled && !repeatWeekly` → `enabled: agendaNotifEnabled` ; `sentKeys` lookup utilise `recurringItems` quand `editing.entryKind === "recurring"` |

---

## [2026-05-26] — Notifications : événements récurrents du calendrier

Les événements récurrents (hebdomadaires, quotidiens, mensuels) avec une notification activée ne déclenchaient aucune push ni aucune notif locale — ils étaient complètement ignorés côté Cloud Function et côté client.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | `checkAgendaForFamily` accepte maintenant `recurringEvents` en paramètre. Pour chaque récurrent avec `notification.enabled`, calcule si l'événement se produit aujourd'hui (`daily` / `weekday` / `dayOfMonth`), puis applique la même logique de fenêtre 5 min et d'anti-spam que les événements ponctuels. Clé anti-spam : `srv-recur-{id}-{dateKey}-{start}-{min}`. Appel mis à jour pour passer `recurringEvents`. |
| `src/app/pages/agenda/AgendaView.js` | Ajout de `recurringRef` + `onUpdateRecurringRef`. Le `checkAgendaNotifications` (vérifié toutes les 30 s) parcourt maintenant aussi les récurrents, calcule si l'occurrence est aujourd'hui, et stocke la `sentKey` dans `event.notification.sentKeys` via `onUpdateRecurring` pour l'anti-spam. |

---

## [2026-05-26] — Notifications : rappel fin de journée amélioré

Rappel à 18 h (heure configurable dans les réglages) si des tâches du jour ne sont pas faites.

**Avant :** comptait uniquement les tâches de type `daily` — message « X tâche(s) du foyer encore en attente »
**Après :** compte toutes les tâches du jour (`daily` + tâches dont `dueDate` = aujourd'hui) — message « Il vous reste X tâche(s) avant la fin de journée » + liste des 3 premières tâches en corps de notif.

La notification est active par défaut. L'heure se règle dans Réglages → Notifications → Rappel fin de journée.

| Fichier | Changement |
|---------|------------|
| `functions/index.js` | `checkTasksForFamily` : filtre `t.type === "daily"` → `daily OU dueDate === aujourd'hui` ; nouveau message |
| `src/app/hooks/useTaskNotifications.js` | Même correctif pour la notif client (app ouverte) |

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
| `src/app/App.js` | `taskAppearsInTab` : si `tab === "daily"` et que la tâche a une entrée agenda (`planning.dateKey`) correspondant à la date du jour (`localDateKey(getCurrentAppDate())`), la tâche apparaît dans l'onglet quotidien quelle que soit son `type` (hebdo, mensuel, etc.). Les tâches "daily" restent toujours visibles. Les tâches deadline gardent leur section dédiée. Pas d'impact sur l'onglet "Mes tâches". |

---

## [2026-05-26] — UI : boutons stylo/corbeille harmonisés avec les autres boutons foyer

| Fichier | Changement |
|---------|------------|
| `src/app/pages/settings/SettingsView.js` | Suppression des boutons ronds ✏️ (dans l'en-tête) et 🗑️ (rond dans actions). Remplacement par deux boutons texte `households-switch-btn--edit` (« ✏️ Renommer » / « ✕ Annuler ») et `households-switch-btn--danger` (« Supprimer ») dans une nouvelle div `.households-row-actions-right`, cohérents avec « Changer de foyer » / « + Ajouter un membre ». |
| `src/theme/styles.css` | Suppression de `.households-row-edit-btn` et `.households-delete-btn`. Ajout de `.households-row-actions-right`, `.households-switch-btn--edit`, `.households-switch-btn--danger` et leurs variantes dark mode. |

---

## [2026-05-26] — Fix : renommage de foyer inline non fonctionnel (input écrasé à 0px)

| Fichier | Changement |
|---------|------------|
| `src/theme/styles.css` | Dans `.households-rename-row` (flex row), le bouton Valider héritait de `.settings-valider-btn { width: 100% }` prévu pour les contextes flex-column. Cela écrasait l'input (flex: 1) à une largeur quasi nulle, rendant la saisie impossible. Ajout de `.households-rename-input { min-width: 0 }` et override `.households-rename-row .settings-valider-btn { width: auto; flex-shrink: 0; padding-left/right: 16px }` pour que l'input prenne tout l'espace disponible et le bouton sa taille naturelle. |

---

## [2026-05-25] — Fix : auto-fallback si le foyer courant est inaccessible après reconnexion

| Fichier | Changement |
|---------|------------|
| `src/app/hooks/useAuth.js` | Nouvel effet `auto-fallback` : quand `familiesReady = true`, que `currentFamilyId` est défini, mais que `currentFamily === null` (foyer introuvable dans la liste chargée — accès refusé, document supprimé, etc.), bascule automatiquement sur le premier foyer accessible dans `safeFamilies`. Évite qu'un utilisateur ayant rejoint un nouveau foyer soit bloqué en mode onboarding après déconnexion/reconnexion si son `currentFamilyId` pointait encore sur l'ancien foyer. Version `?v=2026-05-25-auto-fallback-1`. |
| `src/app/App.js` | Mise à jour du numéro de version de `useAuth.js`. |

---

## [2026-05-25] — Fix : switcher multi-foyers bloqué si un snapshot Firestore échoue

| Fichier | Changement |
|---------|------------|
| `src/app/providers/clientFamily.js` | `watchFamilies` : (1) déduplique les IDs avec `[...new Set(...)]` pour éviter le stall si `familyIds` contient des doublons ; (2) dans le callback d'erreur de `onSnapshot`, appelle désormais `cacheStates.set(familyId, false)` puis `fireIfReady()` — sans ça, si un foyer renvoie une erreur Firestore (ex. règle de sécurité refusée), la garde `cacheStates.size < ids.length` restait bloquée et le callback principal n'était jamais appelé, laissant `families` figé sur l'ancien foyer unique. Version `?v=2026-05-25-watch-families-fix-1`. |
| `src/app/providers/client.js` | Mise à jour du numéro de version de `clientFamily.js`. |
| `src/app/hooks/useAuth.js` | Mise à jour du numéro de version de `client.js`. |

---

## [2026-05-25] — Repas : vérification inventaire pour entrée/dessert + bouton "Marquer cuisiné" sur les extras

| Fichier | Changement |
|---------|------------|
| `src/app/utils/state.js` | Ajout de `lunchStarterCooked`, `lunchDessertCooked`, `dinnerStarterCooked`, `dinnerDessertCooked` dans `createMealShell` et `normalizeMeal`. Version `?v=2026-05-25-extras-inventory-cook-1`. |
| `src/app/App.js` | `computeMealCookState` accepte un 5e param `subSlot` (`"main"` / `"starter"` / `"dessert"`) pour choisir la bonne clé recette et cuisiné. `handleToggleCookWithInventory` accepte un 4e param `subSlot` et passe la bonne `cookedKey` dans l'annulation toast. Version `MealsView.js` et `state.js` → `?v=2026-05-25-extras-inventory-cook-1`. |
| `src/app/pages/meals/MealsView.js` | Extraction de `checkInventoryAfterPick(recipe)` pour factoriser la vérification inventaire. `selectRecipe()` appelle cette fonction aussi pour entrée et dessert. `renderSlotExtras()` lit `starterCooked`/`dessertCooked` et passe un bouton 🍳 compact à `extraRecipeRow` qui appelle `onToggleCook(day, slot, wk, "starter"|"dessert")`. |
| `src/theme/styles.css` | Ajout de `.mrd-meals-cook-btn--sm` et `.mrd-meals-cook-btn--sm.on` : variante compacte du bouton cuisiné pour les extras (entrée/dessert). |

---

## [2026-05-24] — "Mes foyers" : suppression réservée aux admins

| Fichier | Changement |
|---------|------------|
| `src/app/pages/settings/SettingsView.js` | Bouton 🗑️ conditionnel : visible uniquement si `isActive && canManageHousehold` (foyer courant + rôle admin). Pour les autres foyers (rôle inconnu côté client), le bouton est masqué — l'utilisateur doit d'abord basculer sur ce foyer puis supprimer. |
| `src/app/App.js` | Version `SettingsView.js` → `?v=2026-05-24-households-manage-2`. |

---

## [2026-05-24] — "Mes foyers" : suppression par foyer + ajout de membres

| Fichier | Changement |
|---------|------------|
| `src/app/hooks/useAuth.js` | Ajout de `handleDeleteFamilyById(familyId)` : peut supprimer n'importe quel foyer de la liste (pas seulement le foyer actif), calcule le `nextFamilyId` automatiquement. Exporté. |
| `src/app/pages/settings/SettingsView.js` | Prop `onDeleteFamilyById` ajoutée. Dans la page **"Mes foyers"** : pour le foyer actif → bouton "➕ Ajouter un membre" (ouvre `settingsPage === "household"`) + 🗑️ ; pour les autres foyers → bouton "Changer de foyer". Dans la page **"Gérer le foyer"** : section "Autres foyers" entièrement supprimée (wizard + code d'invitation). |
| `src/theme/styles.css` | Ajout de `.households-row-actions`, `.households-row-actions-left`, `.households-delete-btn`, `.households-switch-btn`, `.households-switch-btn--add` + variantes dark. |
| `src/app/App.js` | Destructure `handleDeleteFamilyById` depuis `useAuth`, prop `onDeleteFamilyById` passée au `<SettingsView>`. Version `SettingsView.js` → `?v=2026-05-24-households-manage-1`. |

---

## [2026-05-24] — Page "Mes foyers" dans les Réglages

| Fichier | Changement |
|---------|------------|
| `src/app/pages/settings/SettingsView.js` | Nouvelle page `settingsPage === "households"` : liste de tous les foyers avec statut actif, switch, renommage inline (foyer actif + admin). La section "Changer de foyer" (chips) est remplacée par un lien "Mes foyers (N) →". |
| `src/theme/styles.css` | Ajout des classes `.households-row`, `.households-row--active`, `.households-row-name`, `.households-row-badge`, `.households-row-edit-btn`, `.households-rename-row`, `.households-switch-btn`, `.households-manage-link` + variantes dark. |
| `src/app/App.js` | Version `SettingsView.js` → `?v=2026-05-24-households-page-1`. |

---

## [2026-05-24] — Wizard création de foyer depuis les Réglages

| Fichier | Changement |
|---------|------------|
| `src/app/pages/settings/NewHouseholdWizard.js` | **Nouveau fichier** — wizard multi-étapes (nom du foyer → membres → invitations). Réutilise les classes CSS de l'onboarding (`.onboarding-step`, `.onb-step-dots`, `.onb-kind-tab`, `.onb-member-*`, etc.). S'ouvre en modal overlay. |
| `src/app/pages/settings/SettingsView.js` | Import de `NewHouseholdWizard`, nouvelle prop `onCreateFamilyWizard`, état `showNewHouseholdWizard`. Le bouton "Créer un nouveau foyer" remplace l'ancien champ texte + bouton. |
| `src/app/App.js` | Prop `onCreateFamilyWizard` → `handleCreateHouseholdOnboarding` (crée le foyer + membres + invitations). Version `SettingsView.js` → `?v=2026-05-24-household-wizard-1`. |

**Flux wizard :**
1. **Nom du foyer** — champ texte + 4 suggestions rapides
2. **Membres** — onglets Personne / Enfant / Animal, ajout à la liste, suppression
3. **Qui aura l'app ?** — sélection des membres qui recevront un code d'invitation *(étape visible seulement si des membres ont été ajoutés)*

---

## [2026-05-24] — Suppression de foyer

| Fichier | Changement |
|---------|------------|
| `src/app/providers/clientFamily.js` | Ajout de `deleteFamily({ familyId, user, nextFamilyId })` : vérifie le rôle admin, charge members/people/invitations/joinEvents, met à jour chaque profil utilisateur membre (retire familyId, vide currentFamilyId, supprime linkedMemberIdsByHousehold), supprime tous les docs en batch. |
| `src/app/providers/client.js` | Version `clientFamily.js` → `?v=2026-05-24-delete-household-1`. |
| `src/app/hooks/useAuth.js` | Import de `deleteFamily` + version → `?v=2026-05-24-delete-household-1`. Nouveau `handleDeleteFamily()` (vérifie admin, calcule nextFamilyId, appelle `deleteFamily`, affiche un message de confirmation). Exporté. |
| `src/app/pages/settings/SettingsView.js` | Prop `onDeleteFamily` + handler `handleDeleteFamilyClick` avec double confirmation. Bouton "Supprimer le foyer" dans "Zone sensible", visible uniquement pour les admins (`canManageHousehold`). |
| `src/app/App.js` | Destructure `handleDeleteFamily` depuis `useAuth`, versions `useAuth.js` et `SettingsView.js` → `?v=2026-05-24-delete-household-1`, prop `onDeleteFamily` passée au `<SettingsView>`. |

---

## [2026-05-24] — Multi-foyers : picker enrichi + UX créer/rejoindre

| Fichier | Changement |
|---------|------------|
| `src/app/pages/home/HomeView.js` | Picker de foyer entièrement revu : cartes avec nom + membres + avatars pour le foyer actif, boutons "Créer un foyer" / "Rejoindre un foyer" en bas avec formulaire inline (mode `create`/`join` avec `← Retour`). Le bouton ▾ est maintenant **toujours visible** (même avec un seul foyer). Nouveaux props : `onCreateFamily`, `onJoinFamily`. |
| `src/app/App.js` | Passage de `onCreateFamily` et `onJoinFamily` à `HomeView`. |
| `src/app/pages/settings/SettingsView.js` | **Carte principale Foyer** : blocs "Créer" et "Rejoindre" désormais masqués si un foyer actif existe (gardés uniquement pour l'onboarding). **Sous-page "Gérer le foyer en détail"** : nouveau groupe "Autres foyers" (créer + rejoindre) ajouté juste avant "Zone sensible". |
| `src/theme/styles.css` | Nouveaux styles : `.mrd-family-picker-card`, `.mrd-family-picker-action`, `.mrd-family-picker-back`, `.mrd-family-picker-form`, `.mrd-family-picker-input`, `.mrd-family-picker-submit`, etc. |
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
| `src/app/hooks/usePlannerSync.js` | Imports `firebase/client.js` mis à jour de `?v=2026-05-08-offline-cache-1` → `?v=2026-05-24-multi-family-1` (ligne 1 et 5 fusionnées en 1 import). |
| `src/app/hooks/usePushMessaging.js` | Idem. |
| `src/app/components/FeedbackWidget.js` | Idem. |
| `src/app/pages/settings/SettingsSupportPage.js` | Idem. |
| `src/app/pages/settings/SettingsView.js` | Import de `SettingsSupportPage.js` versionné (`?v=2026-05-24-multi-family-1`) pour invalider le cache. |
| `src/app/App.js` | Versions mises à jour pour `usePlannerSync`, `usePushMessaging`, `FeedbackWidget`, `SettingsView`. |

**Cause :** Lors de la refactorisation de `firebase/client.js` en sous-modules (`core.js`, `clientAuth.js`, etc.), `initializeApp(FIREBASE_CONFIG)` a été déplacé dans `core.js`. Mais plusieurs fichiers importaient encore `client.js` avec l'ancienne version `?v=2026-05-08-offline-cache-1`. Si le navigateur avait cette URL en cache avec l'**ancien** `client.js` monolithique (qui appelait aussi `initializeApp` directement), Firebase levait une erreur "App '[DEFAULT]' already exists" depuis gstatic.com (cross-origin) → `event.error` sans stack → handler bootstrap affichait **"Script error."** → écran "Démarrage bloqué" avant que React soit monté.

---

## [2026-05-24] — Bugfix : crash "Script error." + tâche + Google PWA

| Fichier | Changement |
|---------|------------|
| `src/app/pages/auth/AuthScreen.js` | Suppression du blocage Google en mode PWA standalone. Le bouton "Continuer avec Google" est affiché sur toutes les pages (welcome, login, signup). `clientAuth.js` gère déjà le redirect vs popup automatiquement. |
| `index.html` | Handler `window.addEventListener("error")` : ajout du filtre "Script error." (erreurs cross-origin CDN Firebase/gstatic sans info diagnostic) et d'un guard `__APP_BOOT_STATE__ === "react-mounted"` (ne remplace plus l'UI React). Même correction pour `unhandledrejection` : ignore FirebaseError et messaging/\*. |
| `src/app/App.js` | `onAddTask` lambda : `(task) =>` → `(tab, form) =>` — passait seulement le 1er argument au lieu des 2 (`handleAddTask(type, form)`), causant `form = undefined` → crash à chaque création de tâche. |
| `src/app/hooks/useAuth.js` | Ajout de `setCurrentFamily` aux imports Firebase. Utilisé par `handleSwitchFamily` mais manquant dans la liste. |

**Cause "démarrage bloqué / Script error." :** Une erreur cross-origin levée par Firebase CDN pendant l'usage (p.ex. lors d'une sauvegarde Firestore) se propageait au handler HTML inline qui ne filtrait pas ces messages — remplaçait toute l'UI par la page d'erreur bootstrap même en plein milieu d'une session.

---

## [2026-05-24] — Inbox : formulaires de dispatch complets (modales complètes)

| Fichier | Changement |
|---------|------------|
| `src/app/pages/inbox/InboxView.js` | Refonte des formulaires de dispatch : les mini-forms inline sont remplacés par des **modales complètes** identiques aux formulaires natifs. Tâche : emoji picker, texte, période (aujourd'hui/semaine/mois/avant…), type (unique/récurrente), urgence, attribué à. Agenda : emoji picker, titre, date+heure, durée, attribué à, personne concernée, répéter. Note : texte, visibilité (Foyer/Privée), partage avec membres. Nouvelles props : `people`, `childProfiles`. |
| `src/app/App.js` | Handlers `handleDispatchToTask`, `handleDispatchToAgenda`, `handleDispatchToNote` mis à jour pour accepter le payload complet (au lieu des paramètres individuels). `handleDispatchToAgenda` gère maintenant `repeatWeekly` → appelle `handleAddRecurring`. Props `people` et `childProfiles` ajoutées à `<InboxView>`. |

**Avant :** tap "→ Tâche" ouvrait 3 chips quotidien/semaine/mois. **Après :** ouvre une modale complète avec toutes les options de `TasksView`. Idem pour agenda (toutes les options de `AgendaView`) et notes (visibilité + partage comme dans `NotesView`).

---

## [2026-05-24] — Inbox : capture rapide avec dispatch vers tâches/agenda/notes

| Fichier | Changement |
|---------|------------|
| `src/app/utils/state.js` | Ajout de `state.inbox = []` dans `normalizeState()` avec normalisation des champs `id`, `text`, `hint`, `createdAt`, `createdBy`. |
| `src/app/config/constants.js` | Ajout de `{ id: "inbox", label: "Inbox", icon: "📥" }` dans `TABS`. |
| `src/app/pages/inbox/InboxView.js` | **Nouveau composant.** Écran de capture rapide : textarea + chips de type optionnel (Tâche/Événement/Note) + liste d'items avec dispatch inline vers tâches (choix quotidien/semaine/mois), agenda (date picker + heure) ou notes (instantané). |
| `src/theme/styles.css` | Ajout des styles `.ibx-*` : add card, hint chips, items list, dispatch buttons, inline forms, section home. Dark mode inclus. |
| `src/app/pages/home/HomeView.js` | Nouveau prop `inbox`. Section "📥 Inbox" insérée entre "À venir" et "Accès rapide" — affiche jusqu'à 3 items avec badge de comptage et lien "Voir tout →". Masquée si inbox vide. |
| `src/app/App.js` | Import `InboxView`. Ajout de `"inbox"` dans `secondaryScreens` et dans la map des titres. Handlers : `handleAddInboxItem`, `handleDeleteInboxItem`, `handleDispatchToTask`, `handleDispatchToAgenda`, `handleDispatchToNote`. Rendu `<InboxView>` dans `plannerContent`. Prop `inbox` passée à `HomeView`. |

**Fonctionnement :** L'inbox est accessible depuis l'accueil (section dédiée visible dès le 1er item) et depuis `onNavigate("inbox")`. Chaque item peut être dispatchée en 2 taps (choisir destination → confirmer), puis est automatiquement retirée de l'inbox. Les données persistent via Firebase (sync `usePlannerSync`).

---

## [2026-05-24] — Fix Google Sign-in localhost + logs d'erreur complets

| Fichier | Changement |
|---------|------------|
| `src/app/config/constants.js` | `authDomain` corrigé : `"myrollingday.netlify.app"` → `"my-rolling-day.firebaseapp.com"`. L'ancienne valeur dirigeait le handler OAuth vers Netlify (404), ce qui cassait `signInWithPopup` en local. |
| `src/app/providers/clientAuth.js` | `console.error` du bloc popup enrichi avec `error?.message` et `error?.customData` (en plus de `error?.code` et `error` déjà présents). |
| `src/app/hooks/useAuth.js` | Ajout de `console.error("[auth] runAuth error", ...)` avant `setAuthError(formatAuthError(error))` dans `runAuth()`. Ajout de `console.error("[auth] getGoogleRedirectResult error", ...)` avant `setAuthError` dans le catch du redirect. Les erreurs brutes ne sont plus masquées silencieusement par `formatAuthError`. |

**Note Firebase Console** (non vérifiable en code) : s'assurer que `localhost` et `127.0.0.1` sont dans *Authentication → Authorized domains* et que le provider Google est activé sur https://console.firebase.google.com/project/my-rolling-day/authentication

---

## [2026-05-23] — Notifications : re-proposition après "Plus tard" + nettoyage

| Fichier | Changement |
|---------|------------|
| `src/app/utils/storage.js` | Nouveau système `mrd_notif_prompt` (JSON) remplaçant le booléen `mrd_notifications_prompt_seen`. Fonctions : `shouldShowNotifPrompt()`, `markNotifPromptGranted()`, `markNotifPromptDismissed()`, `getNotifPromptDismissCount()`. Délais : 3j après 1er refus, 7j après 2e. Arrêt après 3 refus. Migration automatique de l'ancien booléen. |
| `src/app/App.js` | Import des nouvelles fonctions storage. Récupération de `pushPermission` depuis `usePushMessaging`. Remplacement des 3× `alreadySeen` par `shouldShowNotifPrompt()`. `onActivate` → `markNotifPromptGranted()`, `onLater` → `markNotifPromptDismissed()`. Ajout d'une vérification au lancement de l'app (re-proposition si délai écoulé). |
| `src/app/modals/AppModals.js` | `NotifPromptModal` reçoit `dismissCount` : titre et corps adaptés au 2e rappel, bouton "Non merci" au 3e. |
| `src/app/pages/agenda/AgendaView.js` | Suppression de la fonction morte `requestNotificationPermission()` (jamais appelée, sans FCM). |

---

## [2026-05-23] — HistoryView : retour à la vue par personne + bouton + agrandi

| Fichier | Changement |
|---------|------------|
| `src/app/pages/history/HistoryView.js` | Remplacement de la vue "feed de tâches" par la version originale à colonnes par personne. Props : `history`, `users`, `onClearHistory`. Affiche un colonne par membre avec ses entrées, bouton "Effacer" en haut. |
| `src/app/App.js` | Correction du rendu HistoryView : `tasks`/`people` remplacés par `history=${state.history}`, `users=${householdPeople}`, `onClearHistory=${handleClearHistory}`. Icône SVG du FAB agrandie de 22px → 26px. |
| `src/theme/styles.css` | Bouton FAB "+" agrandi de 52×52px → 64×64px. |

---

## [2026-05-23] — TasksView : suppression de la fonctionnalité d'archivage

| Fichier | Changement |
|---------|------------|
| `src/app/pages/tasks/TasksView.js` | Suppression du bouton 📦 "Archiver" par tâche, du bouton "Tout archiver" en titre de section, et de toute la section "Archives" (toggle + liste + bouton "Vider les archives" + bouton "Désarchiver"). Suppression de l'état `showArchived` et du `useMemo` `archivedTasks`. La section "Terminées" affiche maintenant les tâches directement sans wrapper ni bouton d'action. |

---

## [2026-05-23] — HistoryView : retour tâches uniquement

| Fichier | Changement |
|---------|------------|
| `src/app/pages/history/HistoryView.js` | Suppression des notes, des courses et des onglets de filtre. Le feed n'affiche plus que les tâches complétées. Compteur unique "X tâches complétées". Props `notes` et `lists` retirées. |
| `src/app/App.js` | `HistoryView` ne reçoit plus que `tasks` et `people` (suppression de `notes` et `lists`). |

---

## [2026-05-23] — Restauration de ListsView à la version originale

| Fichier | Changement |
|---------|------------|
| `src/app/pages/lists/ListsView.js` | Remplacé par la version originale fournie par l'utilisateur. Suppression de tous les ajouts : champ `price` dans `itemForm`, calcul de totaux, widget budget, `onClearCheckedItems`, `onCheckAllItems`, section "Achetés" (devenu "Cochés"). Version originale restaurée intégralement. |
| `src/app/App.js` | Suppression des props `onCheckAllItems` et `onClearCheckedItems` du render de `ListsView` (ces props n'existent plus dans le composant restauré). |

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
| `src/app/pages/history/HistoryView.js` | Onglet "Courses" ajouté aux filtres. `buildFeed` étendu : parcourt `lists[].items`, ajoute les articles `done + purchasedAt` (kind `"shopping"`, icon 🛒). Prop `lists = []` ajouté. Badge kind : "Courses" pour shopping. État vide adapté pour le filtre shopping. |
| `src/app/App.js` | `HistoryView` reçoit maintenant `lists=${state.lists}`. |

---

## [2026-05-21] — HomeView : recherche globale étendue (listes + inventaire)

| Fichier | Changement |
|---------|------------|
| `src/app/pages/home/HomeView.js` | Ajout props `lists` et `inventory`. `searchResults` useMemo étendu : `listItemHits` (cherche dans `list.items[].text`, max 3, kind `"list-item"`, tab `"lists"`) et `inventoryHits` (cherche dans `item.name`, max 3, kind `"inventory"`, tab `"inventory"`). `KIND_EMOJI` mis à jour. Overlay de recherche : deux nouveaux groupes "Listes" et "Inventaire" rendus. |
| `src/app/App.js` | `HomeView` reçoit maintenant `lists=${state.lists}` et `inventory=${state.inventory}`. |

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

`src/theme/styles.css` — passage de la liste horizontale compacte à une grille photo 2 colonnes.

- `.recipes-page-rlist` → `display: grid; grid-template-columns: 1fr 1fr`
- `.rcard.rcard-recipe` → `flex-direction: column; padding: 0; overflow: hidden`
- `.recipes-page .rcard-recipe-thumb` → `width: 100%; height: 110px; overflow: hidden` (scoped, n'affecte pas le picker de repas)
- `.recipes-page .rcard-recipe-info` → padding interne `8px 10px 10px`
- `.recipes-page .rcard-recipe-name` → 2 lignes max (`-webkit-line-clamp: 2`)

---

## [2026-05-15] — Fix scroll fiches recettes : ingrédients et condiments

`src/theme/styles.css` — 5 ajouts `flex-shrink: 0` + onglets sticky.

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

`src/theme/styles.css` : 74 lignes supplémentaires supprimées (6 181 → 6 107).

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

`src/theme/styles.css` allégé de 386 lignes. Trois blocs de CSS mort supprimés.

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
- `src/app/pages/settings/SettingsUI.js` (187 lignes) — constantes (BADGE_PALETTE, EMPTY_PERSON), utilitaires (calcAge, getNotificationPermissionState…) et composants UI partagés (SectionCard, SettingsRow, SettingsSwitch, ColorGrid, etc.)
- `src/app/pages/settings/SettingsLegal.js` (160 lignes) — données statiques TERMS_SECTIONS et composant PrivacyPolicyPage (politique de confidentialité en 14 sections)
- `src/app/modals/SettingsModals.js` (216 lignes) — 3 modals extraits : EditMemberModal, AddPersonModal (avec son propre état interne), NewMemberInviteModal
- `src/app/pages/settings/SettingsSupportPage.js` (128 lignes) — page support/légal avec gestion du formulaire (état, envoi Firebase), contact, politique de confidentialité et CGU

Aucune logique modifiée, seulement déplacée. Tous les imports mis à jour dans SettingsView.js. La variable `termsSections` inline remplacée par l'import `TERMS_SECTIONS`. Le composant `SettingsSupportPage` utilise `key=${supportPage}` pour réinitialiser son état à chaque changement de page.

---

## [2026-05-13] — Refactoring App.js : découpage en 4 fichiers

App.js est passé de ~1500 à ~1277 lignes par extraction de 4 responsabilités distinctes :
- `src/app/utils/units.js` (72 lignes) — conversion d'unités, parsing de quantités, matching produits
- `src/app/utils/personStorage.js` (49 lignes) — lecture/écriture localStorage pour personne active et mode appareil
- `src/app/modals/AppModals.js` (136 lignes) — 4 modals extraits : ProfileModal, NotifPromptModal, InviteCodesModal, HouseholdWelcomeModal
- `src/app/hooks/useAppRouting.js` (53 lignes) — logique de routage (needsFamilySetup, profileGuardActive, route-debug)

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

**`src/app/pages/auth/OnboardingFlow.js`**
- Suppression de `makeInviteCode` (fonction entièrement retirée)
- `InviteMembersStep` : remplacement de l'affichage du faux code par "Recevra un code"
- Sous-titre de l'étape corrigé : "Un code leur sera attribué à la création du foyer"
- Hint de bas de page corrigé : "Les codes seront affichés après la création du foyer"
- `handleNext` sur `create-invite-members` : `inviteSelected` → `selectedSet` → `markedProfiles` avec `hasAccount: true` pour les profils sélectionnés

**`src/app/pages/settings/SettingsView.js`**
- Liste membres : `· code X7K2M9` → `· X7K-2M9` (format uniforme `XXX-XXX`)

**`src/app/App.js`**
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
- `src/app/hooks/usePushMessaging.js` — enregistrement token FCM côté client
- `src/app/hooks/useTaskNotifications.js` — notifications locales (browser Notification API)
- `src/app/pages/auth/OnboardingFlow.js` — flux onboarding complet (3 modes : CREATE, JOIN, EXISTING-PROFILE)
- `src/app/pages/recipes/CategoryIcons.js`
- `src/app/components/FeedbackWidget.js`
- `src/app/providers/messaging.js`
- `src/assets/`

**Collections Firestore non documentées :**
- `users/{uid}/messagingTokens/{tokenDocId}` — tokens FCM par navigateur
- `families/{familyId}/members/{uid}/devices/{deviceId}` — token FCM par appareil physique
- `families/{familyId}/serverNotificationLog/{key}` — anti-spam push (écriture CF seulement)
- `families/{familyId}/joinEvents/{eventId}` — log d'audit rejoindre foyer (écriture CF seulement)
- `bug_reports/{id}`, `feature_requests/{id}`, `tester_feedback/{id}` — feedback utilisateurs

**Fichiers morts confirmés :**
- `src/app/components/FamilyPanel.js` — jamais importé, remplacé par SettingsView
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

**`src/app/pages/settings/SettingsView.js`**
- `settingsPage` n'est plus un état interne — devient prop reçue depuis App.js.
- Nouvelle prop `onSettingsPageChange` (callback, même pattern que `onSupportPageChange`).
- `goSettingsPage()` appelle `onSettingsPageChange()` au lieu de `setSettingsPage()`.
- `SubPageHeader` : suppression du bouton `‹ Réglages`. Remplacement par un `<span className="settings-subpage-spacer">` des deux côtés pour garder le titre centré.
- Tous les attributs `onBack` retirés des appels `<SubPageHeader />`.

**`src/app/App.js`**
- Nouveau state `settingsSubPage` (default `"main"`), réinitialisé à `"main"` à la déconnexion.
- Props `settingsPage` et `onSettingsPageChange` passées à `<SettingsView>`.
- Bouton ‹ Réglages du header : si `settingsSubPage !== "main"` → `setSettingsSubPage("main")` ; sinon ferme les réglages.

---

## [2026-05-07] — Connexion Google compatible PWA iOS (signInWithRedirect)

### Problème
En mode standalone PWA iOS, `signInWithPopup` est bloqué (`auth/popup-not-supported`) et l'app affichait "Connexion Google impossible dans ce mode." sans aucun fallback.

### Fichiers modifiés

**`src/app/providers/client.js`**
- `signInWithGoogle()` : si `isStandalonePwa()` → `signInWithRedirect` directement (flag `mrd_google_redirect_pending` en localStorage). Sinon → `signInWithPopup` avec fallback redirect élargi à `popup-not-supported` et `web-storage-unsupported`.
- `formatAuthError()` : `auth/popup-not-supported` et `auth/web-storage-unsupported` retournent `""` (redirect déclenché silencieusement). `auth/unauthorized-domain` garde un message d'erreur neutre.

### Aucun changement dans useAuth.js
L'infrastructure `getRedirectResult()` + flag localStorage + `heldNullAuthState` était déjà en place pour gérer le retour OAuth après redirect.

---

## [2026-05-07] — Gestion FCM tokens par appareil (devices subcollection)

### Objectif
Enregistrer chaque appareil connecté dans `families/{familyId}/members/{uid}/devices/{deviceId}` avec token FCM, statut, platform, userAgent, timestamps.

### Fichiers modifiés

**`src/app/providers/client.js`**
- `getOrCreateDeviceId()` (privée) : génère un ID stable par appareil dans localStorage (`mrd-device-id`).
- `registerFcmDeviceToken({ uid, familyId, token })` (exportée) : écrit dans la subcollection `devices/{deviceId}`. Utilise `getDoc` pour distinguer création (setDoc + `createdAt`) et mise à jour (updateDoc sans `createdAt`).

**`src/app/hooks/usePushMessaging.js`**
- Import de `registerFcmDeviceToken`.
- `persistToken()` appelle maintenant aussi `registerFcmDeviceToken()` quand `familyId` est disponible.

**`src/app/pages/settings/SettingsView.js`**
- Remplacement du bouton `notification-status-line` par un `SettingsToggleRow` "Cet appareil" dans la sous-page Notifications.
- Toggle ON → appelle `onRequestPushPermission()` directement (ou modal si "denied").
- Toggle OFF (quand déjà granted) → modal explicatif (modifier les réglages du navigateur).
- Modal mis à jour pour gérer le cas "granted" (instructions pour désactiver) en plus du cas "denied".

---

## [2026-05-07] — Fond d'écran page connexion appliqué à la page Réglages

### Fichiers modifiés

**`src/app/App.js`**
- Ajout de la classe `cnt--settings` sur le wrapper `cnt` qui contient `SettingsView`.

**`src/theme/styles.css`**
- `.cnt--settings` : `padding: 0; background: #F7F2EC` (même fond que la page de connexion).
- `.mrd-set-page` : ajout de `background: #F7F2EC`.
- Dark mode : `.cnt--settings` et `.mrd-set-page` → `background: #100E0C`.

---

## [2026-05-07] — Fix modal notifications inaccessible depuis sous-page Réglages

### Cause racine
Dans `SettingsView.js`, `renderSettingsSubPage()` retourne tôt quand `settingsPage === "notifications"`. Le modal `showNotificationModal` était rendu après ce return, dans le bloc principal — donc jamais affiché quand l'utilisateur est dans la sous-page notifications.

### Fichiers modifiés

**`src/app/pages/settings/SettingsView.js`**
- Ajout du modal `notification-modal-backdrop` à l'intérieur du bloc `settingsPage === "notifications"` de `renderSettingsSubPage()`.
- Cas "denied" : affiche un message explicatif invitant à aller dans les réglages de l'appareil/navigateur plutôt que le bouton "Autoriser" (qui ne fonctionnerait pas).

---

## [2026-05-07] — Fix flash "Créer/Rejoindre un foyer" + logs [route-debug]

### Cause racine
`watchUserProfile` pouvait firer une première fois avec `fromCache=true` et un profil qui contenait `familyIds: []` (cache Firestore périmé). Cela avançait `profileFetched=true` immédiatement, ce qui faisait `familiesReady=true` (aucune famille à charger), `bootLoading=false`, et donc `needsFamilySetup=true` le temps d'1 frame → flash de l'écran "Créer un foyer / Rejoindre un foyer" avant l'accueil.

### Fichiers modifiés

**`src/app/providers/client.js`**
- `watchUserProfile` : passe `snapshot.metadata.fromCache` en 2e argument du callback (même pattern que `watchFamilyPeople`).

**`src/app/hooks/useAuth.js`**
- `watchUserProfile` callback : `setUserProfile(profile)` s'exécute toujours (pour afficher le cache rapidement). Mais `setProfileFetched(true)` et `setStartupStage("ready")` ne s'exécutent que si `!fromCache` — on attend la confirmation serveur avant d'avancer la machine à états.
- `currentFamily` : sémantique stricte `undefined`/`null`/objet. `undefined` = en cours de chargement (familles pas encore fetchées ou profil pas prêt) ; `null` = définitivement aucune famille ; objet = famille trouvée.
- `bootLoading` : simplifié grâce à `currentFamily === undefined` (plus besoin de vérifier séparément `familiesReady` et `userProfile`).
- Ajout d'un `useEffect` `[route-debug]` qui logue en console chaque changement d'état de routage : `authReady`, `user`, `profileFetched`, `userProfile`, `familiesReady`, `currentFamilyId`, `currentFamily`, `peopleBootstrapped`, `people`, `bootLoading`.

**`src/app/App.js`**
- Ajout d'un `useEffect` `[route-debug]` qui logue `selectedScreen` (loading/auth/onboarding/home) à chaque changement de décision de route.

---

## [2026-05-07] — Suppression des logs auth en double + méta PWA

### Diagnostic
Il n'existait pas plusieurs listeners `onAuthStateChanged` — un seul appel dans `client.js/watchAuth`. Le F12 montrait 3 lignes par événement car :
1. `watchAuth` loggait lui-même `[auth] onAuthStateChanged`
2. `bootLog` loggait `[startup] auth-state` via `console.log`
3. `bootLog` appelait aussi `window.__pushBootLog` qui reloggait `[boot] auth-state`

### Fichiers modifiés

**`src/app/providers/client.js`**
- `watchAuth` : suppression du `console.log` interne — le log est géré par l'appelant (`useAuth.js`). `watchAuth` est maintenant un thin wrapper pur : `return onAuthStateChanged(auth, callback)`.

**`src/app/hooks/useAuth.js`**
- `bootLog` : suppression du `console.log("[startup]", ...)` redondant. La fonction utilise maintenant `window.__pushBootLog` en priorité (qui logue déjà dans la console avec le préfixe `[boot]`), avec fallback `[startup]` si le script index.html n'est pas présent.
- Résultat : 1 ligne de console par événement de démarrage, au lieu de 3.

**`index.html`**
- Ajout de `<meta name="mobile-web-app-capable" content="yes">` (supprime le warning DevTools).
- Remplacement du `#C4607A` hardcodé dans le bouton `renderBootstrapError` par `#B85F4A`.

---

## [2026-05-07] — Couleur primaire + animaux sans accès admin

### Fichiers modifiés

**`src/theme/styles.css`**
- Ajout de `--primary-color: oklch(0.58 0.13 28)` en variable CSS globale (avec fallback HEX `#B85F4A`).
- `--mrd-a` pointe maintenant sur `var(--primary-color)` — un seul endroit à changer.
- Remplacement de tous les `#C4607A` hardcodés (9 occurrences) par `var(--primary-color)`.
- Remplacement de `rgba(196, 96, 122, 0.14)` par `oklch(58% 0.13 28 / 0.14)` (focus inputs/textarea).
- Remplacement de `rgba(196, 96, 122, 0.38)` par `oklch(58% 0.13 28 / 0.38)` (ombre nav mobile).

**`src/app/pages/settings/SettingsView.js`**
- Boutons "Mettre en admin" / "Retirer le rôle admin" maintenant conditionnés à `editModalPerson.type !== "animal"` → les animaux ne peuvent pas être mis en admin.

---

## [2026-05-07] — Refonte logique de démarrage : bootLoading centralisé, zéro flash

### Problème
Flash au démarrage : SplashScreen → chargement × 2 → "création de profil" (fraction de seconde) → écran blanc → accueil.

### Cause racine
Firestore `onSnapshot` pour les `people` du foyer tire d'abord depuis le **cache local** (`fromCache = true`). Ce snapshot peut être vide ou sans le champ `linkedAccountId`, ce qui rendait `linkedPerson = null` et `peopleBootstrapped = true` simultanément → `profileGuardActive = true` → OnboardingFlow s'affichait brièvement.

### Solution
**`src/app/providers/client.js`**
- `watchFamilyPeople` passe maintenant `snapshot.metadata.fromCache` (2e argument du callback).

**`src/app/hooks/useAuth.js`**
- Ajout de `profileFetched` : vrai uniquement après le premier fire de `watchUserProfile`.
- Ajout de `familiesReady` : vrai après résolution de `listFamilies`.
- Dépendance `listFamilies` stabilisée via `familyIdsKey` (string stable) pour éviter un re-run sur chaque snapshot Firestore.
- `peopleBootstrapped` n'est mis à `true` que lorsque `!fromCache` (réponse serveur) → le cache stale ne peut plus provoquer de flash.
- `bootLoading` exporté : seule source de vérité pour décider d'afficher le SplashScreen.
- Reset propre de tous les flags lors du signe-out.

**`src/app/App.js`**
- Import de `bootLoading` depuis `useAuth()`.
- Arbre de routing unifié : Erreur → `bootLoading` (un seul bloc) → `!user` → `profileGuardActive` → App.
- `needsFamilySetup`, `needsLinkedProfileSetup`, `profileGuardActive` tous gardés par `!bootLoading` pour éviter toute transition prématurée.

---

## [2026-05-07] — Fix double écran de chargement + flash "création de profil"

### Problème
- L'écran de chargement apparaissait deux fois (animation CSS redémarrait) car deux blocs `return <div className="ldr">` distincts existaient dans `App.js` : un pour `!authReady` et un pour `waitingForProfileDoc || waitingForFamilyData`. React les traitait comme des éléments différents à chaque transition.
- La page "création de profil" flashait brièvement parce que `onSnapshot` de Firestore tirait avec un tableau vide (`items = []`) au premier appel (cache miss), ce qui mettait `peopleBootstrapped = true` trop tôt → `waitingForFamilyData = false` → `profileGuardActive = true` → flash onboarding.

### Fichiers modifiés

**`src/app/hooks/useAuth.js`**
- `watchFamilyPeople` callback : `setPeopleBootstrapped(true)` uniquement si `items.length > 0`, pour ignorer le premier snapshot vide du cache Firestore.

**`src/app/App.js`**
- Fusionné les deux écrans de chargement en un seul bloc `if (!authReady || waitingForProfileDoc || waitingForFamilyData)`.
- Réorganisation des guards : erreur → `authReady && !user` (auth) → loader unique → onboarding → app.
- Résultat : React garde le même élément DOM tout au long du chargement, l'animation ne redémarre plus.

---

## [2026-05-06] — Onboarding : étape "Qui aura l'app ?" conditionnelle

### Fichiers modifiés

**`src/app/pages/auth/OnboardingFlow.js`**
- `progressSteps` : 4 points si aucun membre ajouté, 5 points si au moins un membre
- `nextLabel()` : affiche "Terminer" à l'étape 4 quand aucun membre ajouté
- `handleNext` sur `create-add-members` : appelle `onCreateHousehold` directement si pas de profils, sinon pousse vers `create-invite-members`
- `AddMembersStep` : accepte `totalSteps` prop — affiche "Étape 4 sur 4" ou "Étape 4 sur 5" selon le nombre de membres

**`src/app/App.js`** — version import mise à jour

---

## [2026-05-06] — Tâches : suppression des boutons flèches ↑↓

### Fichiers modifiés

**`src/app/pages/tasks/TasksView.js`**
- Suppression du bloc `task-order-actions` (boutons ↑↓) dans `renderTaskCard`
- Le déplacement par appui long (drag & drop) suffit pour réordonner les tâches

**`src/app/App.js`** — version import mise à jour

---

## [2026-05-06] — Fix : défilement liste ingrédients dans la fiche recette

### Fichiers modifiés

**`src/theme/styles.css`**
- Ajout de `min-height: 0` sur `.mrd-shell .recipe-sheet-body` et `.mrd-recipe-view-sheet .recipe-sheet-body`
- Correction du bug flexbox classique : sans `min-height: 0`, le navigateur considère que la hauteur minimale d'un flex item est égale à sa hauteur de contenu, empêchant `overflow-y: auto` de s'activer. Le parent clippait visuellement mais le scroll ne fonctionnait pas.

---

## [2026-05-06] — Design "Cocon" : refonte auth & onboarding + ajout membres simplifié

### Fichiers modifiés

**`src/app/pages/auth/AuthScreen.js`**
- Écran Bienvenue : nouveau titre serif "Le quotidien / en douceur." avec accent italique coloré, fond dégradé chaud, sous-titre mis à jour
- Login : "Content de te revoir" + logo au-dessus du formulaire, "← Retour"
- Inscription : "Bienvenue chez nous" + logo au-dessus du formulaire

**`src/app/pages/auth/OnboardingFlow.js`** — réécriture complète
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

**`src/theme/styles.css`**
- Toutes les nouvelles classes : `.onb-*`, `.auth-welcome-title-cocon`, `.auth-welcome-em`, `.auth-card-illu`
- Dark mode intégré pour chaque nouveau composant

---

## [2026-05-06] — Notification push : nouveau membre via code d'invitation

### Fichiers modifiés

**`src/app/providers/client.js`**
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

**`src/app/components/FeedbackWidget.js`** (nouveau)
- Tab vertical fixe sur le bord droit de l'écran (50% hauteur), couleur rose-terracotta `#C4607A`
- Au clic : modal centré avec textarea "Décris le problème…"
- Envoi vers Firestore collection `tester_feedback` (message, page active, user agent, userId)
- État envoi : idle / sending / done (auto-ferme après 2.2s) / error
- Visible uniquement sur l'écran principal (utilisateur connecté)

**`src/app/providers/client.js`**
- Ajout de `sendTesterFeedback({ message, page, userId })` → Firestore `tester_feedback`

**`src/app/App.js`**
- Import `FeedbackWidget`
- Rendu juste après `.mrd-shell`, passe `user` et `activeTab` comme `currentPage`

**`src/theme/styles.css`**
- Classes `.fb-root`, `.fb-tab`, `.fb-tab-icon`, `.fb-tab-text`, `.fb-backdrop`, `.fb-panel`, `.fb-panel-*`
- Dark mode intégré

---

## [2026-05-06] — Dark mode : correction cascade CSS (auth/onboarding/notification)

### Fichier modifié : `src/theme/styles.css`

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

### Fichier modifié : `src/app/providers/client.js`

**Problème** : `signInWithGoogle()` faisait `await ensureAuthPersistence()` AVANT d'appeler Firebase, ce qui brisait la chaîne du geste utilisateur. Sur iOS Safari, `window.open()` (utilisé en interne par `signInWithPopup`) est bloqué s'il est appelé après un `await`. De plus, `signInWithRedirect` en mode standalone fait quitter le contexte PWA et le retour OAuth s'ouvre dans Safari — `getRedirectResult()` reçoit toujours `null`.

**Fix** :
- Suppression du `await ensureAuthPersistence()` (déjà appelé au boot dans `useAuth.js`)
- `signInWithPopup` utilisé dans TOUS les cas (y compris standalone), le popup s'ouvre synchroniquement par rapport au geste
- Fallback `signInWithRedirect` uniquement si le popup est explicitement bloqué (`auth/popup-blocked`)

### Fichier modifié : `src/app/hooks/useAuth.js`
- Import version bumpée → `?v=2026-05-06-pwa-google-fix-2`

---

## [2026-05-06] — Recettes démo : remplacement par 30 recettes de printemps

### Fichiers modifiés

**`src/app/config/demoRecipes.js`**
- Suppression des 24 recettes démo génériques
- Ajout de 30 recettes de printemps issues du fichier `30_recettes_printemps_avec_preparation.docx`
- Recettes 1–7 : `months: [4, 5]`, Recettes 8–30 : `months: [5]`
- Labels : `"vegetarian"` ou `"vegan"` selon chaque recette
- IDs : `demo-recipe-01` à `demo-recipe-30`

**`src/app/config/condiments.js`**
- Ajout du condiment `{ id: "ciboulette", label: "Ciboulette" }` (requis par recette 30)

---

## [2026-05-06] — Dark mode : audit complet et corrections

### Fichier modifié : `src/theme/styles.css`

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

### Fichier modifié : `src/app/pages/settings/SettingsView.js`
- Email support corrigé : `support@myrollingday.com` → `contact@bohemianrollinghouse.fr`
- Import version bumpée → `?v=2026-05-06-dark-mode-email-1`

---

## [2026-05-06] — Politique de confidentialité complète (14 articles)

### Fichiers modifiés
**`src/app/pages/settings/SettingsView.js`**
- Suppression de `privacySections` (4 lignes placeholder)
- Ajout du composant `PrivacyPolicyPage` (14 sections, listes à puces, liens mailto, sous-titres h3)
- Remplacement de `<LegalTextPage sections=${privacySections} />` par `<${PrivacyPolicyPage} />` pour `supportPage === "privacy"`

**`src/theme/styles.css`**
- `.support-legal-subh` : sous-titres h3 dans les sections légales
- `.support-legal-list` / `.support-legal-list li` : listes à puces cohérentes avec le style existant
- `.support-legal-link` : liens mailto avec couleur accent et underline

**`src/app/App.js`**
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
**`src/app/App.js`** — bloc `postOnboardingState === "invite-codes"` :
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
**`src/theme/styles.css`** — ajout après `.onboarding-empty-state` :
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

**`src/app/providers/client.js`**
- `signInWithGoogle()` (branche standalone) : avant `signInWithRedirect`, stocke
  `localStorage.setItem("mrd_google_redirect_pending", "1")`.
  Si l'exception survient avant la navigation, le flag est retiré immédiatement.

**`src/app/hooks/useAuth.js`**
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
- `src/app/providers/client.js`
- `src/app/hooks/useAuth.js`
- `src/app/App.js` (version bump imports)

---

---

## [2026-05-06] — Onboarding création de foyer : ajout des membres intégré + notifications post-onboarding

### Objectif
Intégrer l'étape "Ajouter les membres" directement dans le flow wizard de création de foyer (étape 4/4),
supprimer l'écran intermédiaire `InitialMembersOnboarding`, et déplacer la demande de notifications
après l'arrivée sur la page d'accueil (jamais pendant l'onboarding).

### Ce que j'ai fait

**`src/app/pages/auth/OnboardingFlow.js`**
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

**`src/app/hooks/useAuth.js`**
- `handleCreateHouseholdOnboarding` : collecte maintenant les codes d'invitation créés pour les
  membres "avec compte" et les retourne dans `result.invitations: [{ firstName, code }]`
- Import version : `?v=2026-05-06-onboarding-members-1`

**`src/app/App.js`**
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

**`src/theme/styles.css`**
- Ajout de `.invite-codes-list`, `.invite-code-row`, `.invite-code-name`, `.invite-code-value`, `.invite-code-hint`

### Flux complet création foyer
1. Prénom du créateur → 2. Couleur/badge → 3. Nom du foyer → 4. Ajouter membres
5. Clic "Terminer" → création Firebase (household + profils + invitations)
6. Arrivée page d'accueil → modal notifications
7. Si membres "avec compte" → modal codes d'invitation

### Fichiers modifiés
- `src/app/pages/auth/OnboardingFlow.js`
- `src/app/hooks/useAuth.js`
- `src/app/App.js`
- `src/theme/styles.css`

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

**`src/app/providers/client.js`**
- `isStandalonePwa()` : détecte `navigator.standalone === true` **ou** `matchMedia display-mode:standalone`
- `signInWithGoogle()` : branche automatiquement sur `signInWithRedirect` (standalone) ou `signInWithPopup` (navigateur)
- `getGoogleRedirectResult()` : exporté pour être appelé au démarrage — récupère le résultat après retour de Google OAuth
- `formatAuthError` : ajout de `auth/unauthorized-domain` → message "Connexion Google impossible..."
- `auth/redirect-cancelled-by-user` → chaîne vide (annulation silencieuse)

**`src/app/hooks/useAuth.js`**
- `getGoogleRedirectResult()` appelé au montage, dans le même `useEffect` que `watchAuth`
- Si erreur (sauf annulation) : `setAuthError(formatAuthError(error))`
- Si succès : `onAuthStateChanged` se déclenche automatiquement avec le nouvel utilisateur
- Import version bumped : `?v=2026-05-06-google-redirect-2`

**`src/app/pages/auth/AuthScreen.js`**
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
- `src/app/providers/client.js`
- `src/app/hooks/useAuth.js`
- `src/app/pages/auth/AuthScreen.js`

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

**1. `src/app/hooks/useAuth.js` — timeout de sécurité dans `runAuth`**
- `Promise.race()` entre l'action réelle et un timeout de 15 secondes
- Si le timeout se déclenche : erreur `auth/timeout` → `setAuthError` → `finally` s'exécute → `busy = false`
- Garantit que `busy` revient toujours à `false`, quel que soit le provider ou la plateforme

**2. `src/app/providers/client.js` — détection standalone avant `signInWithPopup`**
- Nouvelle fonction `isStandaloneMode()` : teste `navigator.standalone` (iOS) et `display-mode: standalone` (standard)
- Si standalone : lève immédiatement une erreur `auth/popup-not-supported` avec message clair
- La promesse se termine instantanément → `runAuth` reçoit l'erreur → `busy = false` immédiatement
- `formatAuthError` étendu avec les codes `auth/popup-not-supported` et `auth/timeout`

**3. `src/app/pages/auth/AuthScreen.js` — masquage du bouton Google en standalone**
- Constante `IS_STANDALONE` calculée une fois au chargement du module
- Les 3 pages (welcome, login, signup) remplacent le bloc divider + bouton Google par une notice :
  "Connexion Google non disponible en mode application iPhone. Utilise email / mot de passe ou ouvre l'application dans Safari."
- Connexion email / mot de passe totalement inchangée et fonctionnelle

**4. `src/theme/styles.css` — style `.auth-standalone-notice`**
- Une règle CSS minimale : texte muted centré, taille 13px, opacité 0.75

### Fichiers modifiés
- `src/app/hooks/useAuth.js`
- `src/app/providers/client.js`
- `src/app/pages/auth/AuthScreen.js`
- `src/theme/styles.css`

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
- Creation du module `src/app/providers/messaging.js` pour verifier le support, enregistrer le service worker, recuperer un token FCM avec la cle VAPID et ecouter les messages foreground
- Creation du hook `src/app/hooks/usePushMessaging.js` pour centraliser permission, synchronisation du token et etat push
- Extension de `src/app/providers/client.js` avec `saveMessagingToken(...)` pour stocker le token dans Firestore cote utilisateur et foyer
- Creation de `public/firebase-messaging-sw.js` pour la reception background via `onBackgroundMessage`
- Ajout du shim racine `firebase-messaging-sw.js` pour servir correctement le service worker FCM sans recreer une nouvelle app Firebase
- Branchement de la demande d'autorisation uniquement via l'UI existante dans `SettingsView` et `OnboardingFlow`
- Conservation du systeme local actuel `new Notification()` sans suppression

### Fichiers modifies
- `src/app/config/constants.js`
- `src/app/providers/client.js`
- `src/app/providers/messaging.js`
- `src/app/hooks/usePushMessaging.js`
- `src/app/pages/settings/SettingsView.js`
- `src/app/pages/auth/OnboardingFlow.js`
- `src/app/App.js`
- `src/app/hooks/useAuth.js`
- `src/app/hooks/usePlannerSync.js`
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
- `src/app/hooks/useAgenda.js`
- `src/app/utils/state.js`
- `src/app/pages/settings/SettingsView.js`
- `src/app/pages/tasks/TasksView.js`
- `src/app/hooks/useTasks.js`
- `src/app/hooks/useTaskNotifications.js`
- `src/app/App.js`
- `src/app/hooks/usePlannerSync.js`
- `src/app/utils/storage.js`
- `src/app/hooks/useMeals.js`
- `src/app/pages/meals/MealsView.js`
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
- `src/app/App.js`
- `src/app/pages/auth/AuthScreen.js`
- `src/app/pages/inventory/InventoryView.js`
- `src/app/pages/notes/NotesView.js`
- `src/app/pages/settings/SettingsView.js`
- `src/app/pages/tasks/TasksView.js`
- `src/app/hooks/useTasks.js`
- `src/theme/styles.css`
- `src/app/utils/state.js`
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
- `src/theme/styles.css`, `src/app/pages/tasks/TasksView.js`, `src/app/pages/notes/NotesView.js`, `src/app/pages/inventory/InventoryView.js`

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
- `src/app/pages/meals/MealsView.js`

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
- `src/app/pages/home/HomeView.js`, `src/app/hooks/useTasks.js`

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
- `src/app/pages/agenda/AgendaView.js`
- `src/app/pages/auth/OnboardingFlow.js`
- `src/theme/styles.css`
- `src/app/App.js` (version strings)
- `index.html` (version string styles.css)

### Impacts
- Anciens événements agenda sans `notification` normalisés silencieusement à l'édition
- Aucun impact sur tâches, repas, notes, listes
- La permission est demandée une seule fois (localStorage guard)

---

## [2026-05-05] — Notifications tâches du foyer

### Ce que j'ai fait
- Nouveau hook `src/app/hooks/useTaskNotifications.js` — toute la logique de vérification
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
- `src/app/hooks/useTaskNotifications.js` (**nouveau**)
- `src/app/utils/state.js`
- `src/app/pages/settings/SettingsView.js`
- `src/app/App.js` (import hook, handler, props, version strings)
- `index.html` (version string styles.css)

### Impacts
- `taskNotifications` est dans le state Firestore — les réglages sont partagés entre appareils
- `notificationLog` par tâche — évite le spam mais grossit avec le temps (clés `taskId-type-date`)
- L'agenda reste intact — aucune modification de AgendaView ou de sa logique

---
