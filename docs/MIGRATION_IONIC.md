# MIGRATION IONIC — plan de chantier

Audit du 21 août 2026. Statut : **Phases 0 à 5 terminées.** Branche `feat/ionic`.

Décisions tranchées avec Steve le 21 août : router adopté (D2 option B), et
consigne explicite de pousser Ionic aussi loin que possible — « le moins de
custom possible, tout ce qu'on peut passer en Ionic sans perdre le rendu
visuel ». Le périmètre « volontairement non migré » du §3 est donc revu à la
baisse : les formulaires (`ion-input`, `ion-item`) passent aussi, écran par
écran, avec le rendu comme seul arbitre.

Contexte : l'app est une PWA Vite + React 18 / HTM + Firebase, sur laquelle
Capacitor 6 a été ajouté le 8 août 2026 (voir `TODO_NATIF.md`). Objectif de ce
chantier : confier à Ionic tout ce qui est aujourd'hui recodé à la main —
navigation, coque d'écran, safe areas, overlays, contrôles natifs — et **garder**
le système de design maison (`styles.css`, tokens `--mrd-*`) qui fait l'identité
de l'app.

Légende : 🔴 bloquant · 🟠 gros morceau · 🟡 confort · ⚪ optionnel

---

## 1. État des lieux

| Fait | Chiffre |
|---|---|
| `src/styles.css` | 7 133 lignes, tout en global, tokens `--mrd-*` en source de vérité |
| `src/App.js` | 1 635 lignes — orchestrateur + coque + routage `activeTab` + 6 modales |
| Routage | **aucun router**. `activeTab` / `showSettings` / `settingsSubPage` / `settingsSupportPage` en `useState` |
| Syntaxe | HTM (`html\`...\``), **pas de JSX**, ~35 500 lignes de `src/` |
| Safe areas | 22 `env(safe-area-inset-*)` écrits à la main dans `styles.css` |
| Overlays maison | 16 fichiers avec un `backdrop` / `-overlay` / `-sheet` propre |
| Appels de toast | 40 (`setToast` / `showToast`) |
| `<select>` natifs | 12, dans 8 fichiers |
| `input type=date/time` | 14, dans 5 fichiers |
| `window.confirm` | 3 fichiers |
| Onglets segmentés | `SegmentedTabs` utilisé dans 6 vues |
| `type="search"` | 4 |

Point de vigilance immédiat : `docs/ARCHITECTURE.md` **est périmé** — il décrit
encore « pas de bundler, React via CDN esm.sh, imports `?v=...` ». La réalité
est Vite + npm depuis le passage à Capacitor. À corriger en Phase 0, sinon tout
le monde (humain ou agent) travaille sur une carte fausse.

---

## 2. Décisions d'architecture

Ces cinq décisions conditionnent tout le reste. À trancher **avant** la Phase 1.

### D1 — On garde HTM, pas de passage à JSX ✅ recommandé

Les composants Ionic React s'utilisent tels quels en HTM :
`html\`<${IonButton} onClick=${fn}>Valider<//>\``. Convertir 35 500 lignes en JSX
serait un chantier plus gros que la migration Ionic elle-même, pour zéro gain
fonctionnel. Vite compile déjà le JSX dans les fichiers `.jsx` si un jour un
écran neuf mérite l'exception — mais on ne mélange pas les deux dans un même
fichier.

Coût du choix : la syntaxe de fermeture HTM (`<//>`) est verbeuse sur les
arbres Ionic profonds (`IonPage > IonHeader > IonToolbar > IonTitle`). Acceptable.

### D2 — On adopte `@ionic/react-router` 🔴 recommandé, à valider

`ion-tabs` **ne fonctionne pas sans router** : la barre d'onglets Ionic est
pilotée par `IonRouterOutlet`. Deux voies :

| | A — `ion-tab-bar` seul, piloté par `activeTab` | B — `IonReactRouter` + `IonTabs` |
|---|---|---|
| Coût | faible | 🟠 gros (Phase 2 + 4 + 5) |
| Transitions de page natives | ❌ | ✅ |
| Geste swipe-back iOS | ❌ | ✅ |
| Bouton retour Android | à câbler à la main | ✅ géré par Ionic |
| Deep links (invitations, cf. `TODO_NATIF` §3) | ❌ | ✅ |
| Suite | cul-de-sac, la nav serait à refaire | définitive |

**Recommandation : B.** L'option A donne l'apparence d'Ionic sans ce qui le rend
utile, et il faudrait refaire la nav une deuxième fois. Le prix à payer est
réel : il faut traduire en routes `activeTab`, `showSettings`, `settingsSubPage`,
`settingsSupportPage`, les 5 écrans secondaires, la garde d'onboarding
(`profileGuardActive`) et le paywall premium. C'est l'objet des Phases 2, 4 et 5,
découpées pour rester livrables une par une.

Versions : `@ionic/react-router@9` exige `react-router-dom` **>=6.4 <7** →
épingler `6.30.6` (surtout **pas** v7).

### D3 — `setupIonicReact({ mode: 'ios' })` ✅ recommandé

Par défaut Ionic rend `md` sur Android et `ios` sur iOS. Le design maison est
chaud, arrondi, feutré : le rendu `ios` en est beaucoup plus proche, et forcer
un seul mode évite d'avoir à retoucher chaque composant deux fois. Un seul
rendu à vérifier au lieu de deux.

### D4 — Import CSS minimal + fichier passerelle de tokens 🔴

`styles.css` a son propre reset (`* { box-sizing; margin: 0; padding: 0 }`,
`html, body { overflow: hidden }`). Importer toute la pile CSS d'Ionic
écraserait la typo et les espacements partout.

- On importe **uniquement** `@ionic/react/css/core.css` (obligatoire) et
  `@ionic/react/css/palette/dark.class.css`.
- On **n'importe pas** `normalize.css`, `structure.css`, `typography.css`,
  `display.css` — conflit direct avec le reset existant.
- Nouveau `src/theme/ionic-bridge.css` : mappe les `--ion-*` sur les `--mrd-*`
  existants. Les tokens `--mrd-*` restent la **seule** source de vérité couleur
  (règle déjà gardée par `tests/unit/design-tokens.test.js`).

Le thème sombre passe aujourd'hui par `html[data-theme="dark"]`
(`App.js:293`, `SettingsView.js:178`). `dark.class.css` attend la classe
`.ion-palette-dark`. Il faut poser **les deux** au même endroit — un seul point
d'écriture, sinon on aura une app sombre avec des composants Ionic clairs.

### D5 — Capacitor 6 → 8 : hors périmètre ⚪

`@ionic/react@9` ne dépend pas de Capacitor et fonctionne avec Capacitor 6.
Capacitor 8.5 est sorti. C'est un chantier distinct (natif, gradle, pods,
plugins communautaires à revalider) qui n'a pas à être mélangé à celui-ci.
À noter comme dette, à ne pas ouvrir ici.

---

## 3. Ce qui est migré, ce qui ne l'est pas

### Migré vers Ionic

| Aujourd'hui à la main | Remplacé par | Phase |
|---|---|---|
| `BottomNav` — `.mrd-bnav` (219 l., 5 SVG inline) | `ion-tabs` / `ion-tab-bar` / `ion-tab-button` + `ion-badge` | 2 |
| Menu « Plus » (dropdown maison + listener `document mousedown`) | `ion-action-sheet` | 2 |
| `SidebarNav` — `.mrd-sidebar` en `@media (min-width: 900px)` | `ion-split-pane` + `ion-menu` | 6 |
| `.mrd-shell` / `.mrd-screen` / `.cnt` + 22 safe areas manuelles | `ion-app` / `ion-page` / `ion-content` | 1, 3 |
| `.mrd-back-hdr` + bouton retour SVG (App.js:1286) | `ion-header` / `ion-toolbar` / `ion-back-button` + swipe-back | 4 |
| `.mrd-screen-hdr` (titres d'écran) | `ion-title` | 3 |
| 16 overlays maison, `.modal-backdrop` / `.modal-card`, keyframes `mrdSlideUp/Down` | `ion-modal` (+ `breakpoints` pour les feuilles basses) | 7 |
| `document.documentElement.style.overflow = "hidden"` (`ListsView.js:165`) | géré par `ion-modal` | 7 |
| `.app-toast` / `.mrd-home-toast` — 40 appels | `ion-toast` (avec bouton d'action) | 8 |
| `window.confirm` × 3 | `ion-alert` | 8 |
| `<select>` × 12 | `ion-select` / `ion-select-option` | 8 |
| `input type=date` / `type=time` × 14 | `ion-datetime` en `ion-modal` | 8 |
| `.mrd-fab` (App.js) | `ion-fab` / `ion-fab-button` | 3 |
| `SegmentedTabs` / `.mrd-subtabs` × 6 vues | `ion-segment` / `ion-segment-button` | 8 |
| `.mrd-hdr-switch` (interrupteur maison, en-tête inventaire) | `ion-toggle` | 8 |
| `type="search"` × 4 | `ion-searchbar` | 8 |
| Spinners et `.ldr` | `ion-spinner` / `ion-loading` | 8 |
| Clavier qui masque les champs (`TODO_NATIF` 🔴 1) | `ion-content` + `ion-footer` + `@capacitor/keyboard` | 3, 9 |
| Bouton retour Android câblé à la main | `IonReactRouter` | 2 |
| — (inexistant) | `ion-refresher` : tirer pour rafraîchir | 9 ⚪ |
| — (inexistant) | `ion-item-sliding` : glisser pour supprimer | 9 ⚪ |

### Volontairement **non** migré

- **`styles.css` et les tokens `--mrd-*`** — l'identité visuelle reste maison.
  Ionic apporte la structure et le comportement, pas la peau.
- **`ion-list` / `ion-item` pour les cartes métier** (`task-card`, notes,
  recettes, inventaire) : design sur-mesure, aucun gain, régression visuelle
  garantie. Les `ion-item` ne servent que **dans** les overlays Ionic.
- **`ion-input` / `ion-textarea` partout** : ~50 champs, chacun stylé. On les
  introduit uniquement dans les overlays refaits en Phase 7, et on juge sur
  pièce avant d'aller plus loin. Décision reportée, volontairement.
- **Firebase, hooks métier, `utils/`, Cloud Functions** : intouchés. Aucune
  phase de ce plan ne doit modifier `src/firebase/`, `src/hooks/` (hors routage)
  ni `src/utils/` (hors `statusBar.js`).

---

## 4. Phases

Chaque phase se termine par : `npm test` vert, `npm run build` vert, et une
vérification à l'œil en clair **et** en sombre. Une phase = un commit.

### Phase 0 — 🔴 Terrain (préalable, aucun code Ionic) — ✅ TERMINÉE

- [x] Mettre `docs/ARCHITECTURE.md` à jour : Vite + npm, plus de CDN, plus de
      `?v=`. La section « Cache-busting rule » est remplacée par une interdiction
      explicite de réintroduire des `?v=`. Ajout des sections « Routage » et
      « Tests ».
- [x] Mettre `docs/AGENT.md` à jour (chemin de projet Windows périmé, « pas de
      `package.json` visible » faux, règle `?v=` obsolète).
- [x] 🔴 **Réparer le harnais e2e.** `tests/helpers/cdp-browser.js` ne cherchait
      le navigateur qu'aux chemins **Windows** et lançait `curl.exe` : sur macOS
      `findAvailableBrowser()` renvoyait `null` et **les 24 tests CDP se
      skippaient en silence**. La suite affichait « 0 fail » sans avoir jamais
      ouvert de navigateur — autrement dit, la migration aurait avancé sans
      aucun filet. Corrigé : chemins macOS / Linux / Windows, `/json/new` en
      PUT via `fetch` (un GET renvoie 405 depuis Chrome 111), et rattachement à
      l'onglet réellement ouvert au lieu du premier venu.
      **Avant : 155 pass / 24 skipped. Après : 179 pass / 0 skipped.**
- [x] Vérifier l'état de départ. Contrairement à ce qu'annonçait
      `TODO_NATIF` §4 (« 2 tests smoke + 1 test Settings en échec »), **aucun
      test n'échoue** — les 3 en question étaient parmi les 24 qui ne
      s'exécutaient pas. Build vert.
- [x] Créer une branche `feat/ionic`.
- [x] 🔴 **Garde anti-régression visuelle** — `tests/screenshots/` :
      42 captures de référence (14 écrans × mobile clair / mobile sombre /
      bureau clair), un comparateur par blocs, et un décodeur PNG sans
      dépendance. Voir `tests/screenshots/README.md`.
      Deux ajouts test-only nécessaires pour que les captures aient un sens :
      `window.__E2E_PLANNER_SEED` (sinon les 14 écrans rendent des états vides)
      et `window.__E2E_PREMIUM` (sinon Repas / Inventaire / Recettes rendent le
      paywall au lieu de la vraie vue).

**Repère bundle avant Ionic : `1 505 kB` (380 kB gzip), un seul chunk.**

**Bug préexistant relevé au passage, non corrigé** (hors périmètre) : le logo
de la barre latérale bureau (`SidebarNav`, `./src/assets/brand/mark.svg`) est
une image cassée dans l'app buildée — chemin relatif non résolu par Vite.
Visible sur `tests/screenshots/baseline/desktop-light__*.png`.

### Phase 1 — 🔴 Socle Ionic — ✅ TERMINÉE

Sortie obtenue : **42/42 captures IDENTIQUE au pixel.** Ionic est chargé, son
thème lit les tokens de la marque, et rien n'a bougé à l'écran.

- [x] `npm i @ionic/react@9 @ionic/react-router@9 react-router-dom@6.30.6 ionicons@8`
- [x] `setupIonicReact({ mode: "ios" })` dans `src/main.js`.
- [x] Import de `@ionic/react/css/core.css` puis
      `@ionic/react/css/palettes/dark.class.css` puis `theme/ionic-bridge.css`,
      en tête de `styles.css` (et non depuis `main.js` : `styles.css` est chargé
      par un `<link>` dans `index.html`, l'ordre entre ce lien et un CSS importé
      depuis le JS n'est pas garanti). Le dossier est `palettes/` **au pluriel**
      en Ionic 9. Les 4 CSS optionnels ne sont pas importés : le pari a tenu,
      d'où les 42 captures identiques.
- [x] `src/theme/ionic-bridge.css` — 60 variables Ionic, **zéro valeur
      littérale**, uniquement des `var(--mrd-*)`.
- [x] Bascule de thème centralisée dans **`src/utils/theme.js`** (`applyTheme`,
      `readStoredTheme`). Elle était écrite à trois endroits (`App.js`,
      `SettingsView.js`, script inline d'`index.html`) ; il fallait désormais y
      ajouter `.ion-palette-dark`, soit une quatrième copie. `applyStatusBarTheme`
      n'est plus appelée que de là.
- [x] Tests de garde étendus (`tests/unit/design-tokens.test.js`, 6 → 11 tests)
      et **nouvelle suite `tests/e2e/ionic-theme.test.js`**.

#### Le piège de spécificité — et pourquoi la suite e2e valait le coup

Les tests unitaires étaient tous verts, le fichier était correct, et pourtant
**le thème sombre affichait le noir d'Ionic (`#000000`) au lieu du brun de la
marque.** `palettes/dark.class.css` ne se contente pas de `.ion-palette-dark` :
il pose aussi un bloc `.ion-palette-dark.ios` (et `.md`) pour les fonds, le
texte et les surfaces. Deux classes = spécificité (0,2,0), contre (0,1,0) pour
`:root` — le bloc d'Ionic battait la passerelle. Et seulement en sombre, et
seulement sur les fonds : `--ion-color-primary` était correct, ce qui rendait le
défaut d'autant plus facile à rater.

Trouvé parce que `tests/e2e/ionic-theme.test.js` lit les variables **résolues
par le navigateur** au lieu de relire le fichier. Corrigé par un bloc de
réaffirmation à spécificité égale, et verrouillé par un test unitaire qui lit la
palette d'Ionic dans `node_modules` et exige que toute variable surchargée en
(0,2,0) soit réaffirmée — donc qui tiendra aussi au prochain `npm update` d'Ionic.

Deux autres pièges au passage :
- `getComputedStyle` renvoie **`oklch(...)`**, pas du `rgb()`, quand la source
  est en oklch — Chrome conserve l'espace colorimétrique. Les couleurs sont donc
  converties dans la page via un canvas 2D, ce qui vérifie du même coup que la
  valeur est une couleur valide (une variable non résolue donne du noir).
- Ionic exprime ses états en `rgba(var(--ion-color-X-rgb), .08)`, et `rgb()` ne
  sait pas manger d'oklch. D'où 7 nouveaux tokens `--mrd-*Rgb` (× 2 thèmes),
  **avec un test qui refait la conversion oklch → sRGB et compare** : changer un
  oklch sans son triplet casse un test, au lieu de délaver un bouton en silence.

#### Coût réel du socle

| | Avant | Après | Écart |
|---|---|---|---|
| JS | 1 505 kB (gzip 380) | 2 324 kB (gzip 555) | **+818 kB** (gzip +175) |
| CSS | 312 kB (gzip 46) | 332 kB (gzip 50) | +20 kB |

Le CSS d'Ionic est négligeable (`core.css` = 11 K) : les 332 kB sont notre
`styles.css`. Le coût est entièrement dans le JS, et il est là dès maintenant
alors qu'aucun composant Ionic n'est encore utilisé — `@ionic/core` enregistre
tous ses éléments. Le code-splitting par route (Phase 9) devient nettement plus
intéressant qu'avant.

**Bug préexistant corrigé au passage** (une ligne, même sujet) : la balise
`<meta name="theme-color">` sombre annonçait `#1F1A17` alors que
`THEME_COLOR_DARK` (= `--mrd-bg` sombre) vaut `#211A15`. Le script de boot
portait la même faute.

### Phase 2 — 🔴🟠 Navigation : la barre du bas passe à Ionic — ✅ TERMINÉE

Le cœur de la demande. Bilan visuel : **14 IDENTIQUE · 20 PROCHE · 3 ÉCART ·
5 RÉGRESSION**, les 5 étant toutes voulues (3 menus « Plus » devenus feuille
d'actions, 2 Repas dont le contenu remonte de ~28 px).

- [x] `IonApp` > `IonReactRouter` > `AppShell` > `IonTabs` > (`IonRouterOutlet` +
      barre d'onglets). L'ancien `App` est devenu `AppShell` : il utilise
      `useLocation` / `useNavigate`, qui exigent d'être sous le routeur.
- [x] Routes : `/home`, `/tasks/:period`, `/agenda`, `/meals`, plus les 6 écrans
      secondaires et `/settings`. `*` redirige sur `/home`.
- [x] `src/routes.js` — **nouveau**, module pur, 12 tests unitaires.
- [x] 5e bouton « Plus » → `IonActionSheet`. Supprime l'état `showQuickMenu` et
      l'écouteur `document mousedown`.
- [x] Badge des retards → `ion-badge`. Étoile premium conservée.
- [x] Les 5 SVG maison sont gardés, extraits dans `components/nav/NavIcons.js`
      pour être partagés avec la barre latérale.
- [x] `padding-bottom: 64px` de `.mrd-screen` supprimé, et les 22 safe areas
      manuelles de la barre du bas avec.
- [x] Suites e2e reprises **dans la même phase** (règle du §5).

#### Le choix qui a tout rendu possible

`activeTab` et `setActiveTab` **gardent leur nom et leur vocabulaire**
(« daily », « weekly »… et non « tasks ») : seules leurs définitions changent —
l'un devient `tabFromPath(location.pathname)`, l'autre
`navigate(pathForTab(tab))`. Les 34 lectures et 17 écritures réparties dans
`App.js` continuent de fonctionner sans être touchées, et toute la traduction
tient dans `src/routes.js`. Sans ça, la phase aurait été une réécriture d'`App.js`.

`showSettings` disparaît comme état : c'est désormais `isSettingsPath(pathname)`.
Les `setShowSettings(false)` suivis d'un `setActiveTab(...)` ont été supprimés —
ils provoquaient deux navigations, donc un aller-retour visible.

#### `plannerContent` : d'une valeur à une fonction

`plannerContent` était calculé pour l'onglet courant. `IonRouterOutlet` garde la
page sortante montée le temps de la transition : elle aurait affiché le contenu
de la page entrante pendant l'animation. C'est devenu `renderScreen(tab)`, et
chaque route rend son propre contenu.

Même piège sur la route paramétrée des tâches, résolu par un repli :
`TASK_PERIODS.includes(activeTab) ? activeTab : lastTaskTab`. Pendant la
transition qui quitte les tâches, `activeTab` vaut déjà la destination.

#### Quatre pièges, et comment ils se sont manifestés

1. **`${/* … */null}` dans `IonRouterOutlet`** — la convention de commentaire de
   HTM injecte un enfant `null`, et le gestionnaire de routes d'Ionic itère ces
   enfants sans filtrer : « Cannot read properties of null (reading 'type') ».
   L'app montait, puis mourait à la première navigation. Les commentaires sont
   maintenant des commentaires JS, hors du template.

2. **La barre latérale bureau avait disparu.** `IonTabs` ne rend pas seulement
   `<ion-tabs>` : il s'enveloppe dans un `<div class="ion-page">` posé en
   `position: absolute; inset: 0` sur toute la largeur. La barre était bien
   rendue, à la bonne taille, aux bonnes coordonnées — simplement recouverte.
   Invisible dans le CSS, trouvé en inspectant le DOM. D'où
   `IonTabs className="mrd-tabs-host"` et une règle qui le remet dans le flux.
   Le sélecteur passe par cette classe et pas par `.ion-page`, qui sert aussi
   aux pages de l'outlet — elles doivent rester absolues.

3. **`lists` avait gagné un bouton retour.** J'avais défini
   `SECONDARY_SCREENS = QUICK_SCREENS + inbox`, or l'original excluait `lists`,
   qui pose son propre titre sur la ligne de son bouton « + Nouvelle ».
   Résultat : deux titres empilés. **Trouvé par les captures d'écran, par rien
   d'autre.** La liste est maintenant figée par un test.

4. **La navigation par URL ne pilote pas Ionic.** Le script de captures
   naviguait par `history.pushState` + `popstate` synthétique. L'URL changeait,
   la barre d'onglets s'allumait au bon endroit, et `IonRouterOutlet` gardait la
   page précédente : les captures montraient l'accueil sous le titre
   « Agenda ». Le script clique désormais comme un utilisateur.

#### Ce qu'Ionic expose vraiment (vérifié, pas déduit)

- L'onglet actif porte `selected="true"` et la classe `tab-selected`. **Pas**
  `aria-selected`, ni `aria-current="page"` (c'était la barre maison).
- `IonTabBar` peut être enveloppé dans un composant : il reçoit ses props par le
  contexte `IonTabsContext`. Seul `IonRouterOutlet` doit être un enfant
  **direct** d'`IonTabs`, qui lève une erreur explicite sinon.
- Les boutons d'`ion-action-sheet` vivent dans un shadow root, hors de portée de
  `document.querySelector`.
- **Une requête DOM non scopée n'a plus de sens** : la page quittée reste montée
  avec `.ion-page-hidden`. Un test lisait « Tâches » en étant sur l'agenda. Les
  helpers e2e visent maintenant `.ion-page:not(.ion-page-hidden)`.

### Phase 3 — 🟠 Coque d'écran : `IonPage` / `IonContent` — ✅ TERMINÉE

Bilan : **3 IDENTIQUE · 16 PROCHE · 17 ÉCART · 6 RÉGRESSION**, et les 6 sont
toutes connues (3 menus « Plus », 2 Repas héritées de la phase 2, 1 Tâches où
le FAB ne chevauche plus la dernière carte — une amélioration).

- [x] Une page = `IonPage` > `IonHeader` > `IonContent`. Les en-têtes sont
      sortis du flux de défilement, et Ionic calcule `--offset-top` du contenu.
- [x] `<main class="cnt">` → `ion-content.cnt`, marges via `--padding-*`.
- [x] `padding-bottom: calc(96px + safe-area)` supprimé : il compensait une
      barre du bas absolue, `ion-tabs` la met dans le flux.
- [x] `.mrd-screen` retiré des écrans d'onglet (il ne sert plus qu'au volet
      Réglages, jusqu'à la phase 5).
- [x] `.mrd-home` ne défile plus lui-même — deux conteneurs de défilement
      imbriqués cassent l'élan iOS et les gestes Ionic.
- [x] FAB → `IonFab slot="fixed"`, qui vit maintenant **dans la page** et non
      plus dans la coque : la condition `["daily",…].includes(activeTab)`
      disparaît.
- [x] **`.mrd-shell` gardé comme classe** sur la coque, exactement comme le
      prévoyait le §5 : ~200 règles en dépendent pour leur spécificité.

#### Ce qui a résisté, et pourquoi

**`--min-height: auto` écrase une toolbar Ionic.** Posé pour laisser le titre
dicter la hauteur, il a fait l'inverse : la toolbar est tombée à 12 px (la
hauteur de son seul padding) et le titre débordait au-dessus du bord de
l'écran. Parce qu'en mode `ios`, Ionic pose `ion-title` en
`position: absolute; inset: 0` pour le centrer entre les boutons — un titre
absolu dans une toolbar plus courte que lui sort du cadre. La réponse n'est pas
de rallonger la toolbar mais de repasser le titre en `position: relative` : il
redevient un élément du flux, la toolbar prend sa hauteur, et il se place
naturellement après le bouton retour. Diagnostic par mesure du DOM (`top: -9`,
`height: 31` dans une toolbar de 12), pas à l'œil.

**Le filet de séparation d'Ionic.** `.header-ios:not(.header-collapse-main)::after`
vaut (0,2,0) : un `.mrd-ion-header::after` (0,1,0) perdait contre lui. Même
famille de piège que la palette sombre en phase 1.

**Le volet Réglages a perdu son défilement** — et je ne l'avais pas touché. La
règle `.cnt` a migré sur `ion-content.cnt`, or les Réglages sont encore un
`<div class="cnt">`. Il leur fallait leur propre règle, avec le `padding:
10px var(--mrd-sp) 88px` d'origine : sans lui les cartes perdaient 14 px de
retrait. Rappel utile que déplacer une règle CSS n'est pas la renommer.

**L'accueil s'est resserré de 14 px de chaque côté.** Il n'était pas dans
`.cnt` avant la phase 3 mais enfant direct de `.mrd-screen`, sans padding de
coque, et pose ses propres marges. Les cumuler rétrécit toutes les cartes.

**`ion-content` ne se laisse pas remodeler de l'extérieur.** Quatre règles
`:has()` transformaient `.cnt` en conteneur flex ou coupaient son défilement
(fiche recette, édition recette, grille de la semaine, sélecteur). Le
défilement d'`ion-content` a lieu dans son shadow DOM : `overflow: hidden` ou
`display: flex` sur l'hôte n'y changent rien. Ionic expose `::part(scroll)` —
c'est là que ces règles s'appliquent maintenant.

#### Les décalages, mesurés et non devinés

Après conversion, tous les écrans étaient décalés verticalement — assez pour
allumer 15 à 30 % des blocs sans qu'aucun élément ne soit vraiment déplacé.
Plutôt que d'ajuster à l'œil, `tests/screenshots/shift.mjs` (nouveau) cherche
par corrélation le décalage qui minimise l'écart entre deux captures :

| Écran | Avant réglage | Après |
|---|---|---|
| notes, inventaire, historique | −12 px | 0 |
| agenda | −9 px | +1 px |
| tâches (les 4 périodes) | +3,5 px | −0,5 px |
| listes | 0 | 0 |

Le signe opposé des tâches vient de leur seconde toolbar (la barre segmentée),
qui apporte déjà la respiration. D'où deux règles distinctes selon la forme de
l'en-tête, et non une valeur unique.

### Phase 4 — 🟠 Écrans secondaires : pile de navigation + geste de retour — ✅ TERMINÉE

**42/42 captures IDENTIQUE** par rapport à la phase 3 : `IonBackButton` rend au
pixel comme le bouton maison qu'il remplace.

- [x] Les 6 écrans secondaires sont empilés par-dessus l'accueil (déjà le cas
      depuis la phase 2 : `navigate()` empile) et portent un `IonBackButton`
      avec `defaultHref="/home"` comme repli — arrivée directe par URL, ou
      reprise sur un deep link.
- [x] Le bouton retour maison et son SVG chevron sont supprimés. Il sautait en
      dur sur l'accueil ; celui d'Ionic remonte la pile, donc les trois chemins
      de retour (bouton, geste, retour matériel Android) font enfin la même
      chose.
- [x] Cas inventaire : l'interrupteur « Organiser » passe en `slot="end"` de
      l'`IonToolbar`.
- [x] Cas recettes : l'écran pose son propre en-tête avec ses actions, il
      n'reçoit pas d'`IonHeader` de coque (sinon deux barres de titre).
- [x] **Geste de balayage vérifié pour de vrai**, par événements tactiles CDP :
      `/notes` → glissement depuis le bord gauche → `/home`, accueil affiché.
      C'était le gain annoncé de la phase, il est constaté et couvert par un
      test permanent (`navigation.test.js` [5] et [6]).

#### Deux conditions non évidentes pour que le geste réponde

Le geste a d'abord semblé cassé alors qu'il était armé. Deux causes, chacune
invisible dans le code :

1. **L'émulation tactile doit précéder le chargement.** Ionic arme le geste à
   l'initialisation de l'outlet ; activer `setTouchEmulationEnabled` après coup
   laisse le geste inerte. Le test échouait en restant sur `/notes` alors que
   le même scénario passait quand l'émulation venait avant.

2. **La modale « Activer les notifications ? » avalait le geste.** Elle s'ouvre
   juste après l'onboarding et couvre tout l'écran :
   `elementFromPoint(3, 400)` renvoyait `div.notif-prompt-overlay`. Le test
   marque désormais la demande comme traitée, ce qui reproduit l'état d'un
   utilisateur qui revient — le seul contexte où le geste a un sens.

#### Régression attrapée à l'œil, pas par la mesure

`InventoryView` a son **propre** FAB, en `<button class="mrd-fab">`. La phase 3
avait converti ce CSS en variables `ion-fab-button`, qui ne s'appliquent pas à
un bouton ordinaire : le FAB de l'inventaire était devenu un carré gris sans
style, en bas à gauche. Le comparateur l'avait bien signalé — mais à 3,5 %
seulement, un FAB étant petit, et je l'avais classé comme bruit. C'est en
regardant la capture que le carré gris saute aux yeux.

Corrigé en convertissant ce FAB en `IonFab` aussi, plutôt qu'en restaurant
l'ancien CSS : `slot="fixed"` remonte jusqu'à l'`ion-content` de la page, même
depuis l'intérieur d'une vue.

**Leçon pour les phases suivantes** : un petit pourcentage n'est pas un feu
vert. Le comparateur dit *où* regarder, pas *si* c'est grave.

### Phase 5 — 🟠 Réglages, onboarding, paywall — ✅ TERMINÉE

- [x] Réglages : `showSettings` + `settingsSubPage` + `settingsSupportPage`
      étaient trois `useState` composant une pile à la main. Ce sont maintenant
      trois niveaux de routes (`/settings`, `/settings/:section`,
      `/settings/support/:page`), et la **cascade de retour codée à la main a
      disparu** au profit d'un `IonBackButton` : chaque niveau est une entrée
      d'historique.
- [x] La page Réglages est un `IonPage` > `IonHeader` > `IonContent`.
- [x] `PremiumLockScreen` reste un rendu conditionnel — ce n'est pas une
      destination.
- [x] `console.log("[route-debug]…")` retiré de `useAppRouting.js` : son propre
      commentaire le disait temporaire, et l'écran affiché se lit maintenant
      dans l'URL.
- [x] Le gestionnaire de bouton retour Android réimplémentait la cascade. Il
      délègue désormais à `history.back()`, sauf sur l'accueil où il sort de
      l'app. Vérifié qu'Ionic n'intercepte pas ce bouton à notre place :
      `ion-app` écoute l'événement DOM `backbutton`, convention Cordova que
      Capacitor ne déclenche pas — pas de double retour. **À valider sur
      device**, comme tout le natif (cf. `TODO_NATIF`).

#### Auth et onboarding : décision de ne pas les router

Le plan prévoyait de remplacer leur rendu conditionnel par des redirections.
Écarté après examen : ce sont des prises de contrôle plein écran *avant* que
l'app existe, la redirection n'apporterait aucun gain Ionic et ajouterait un
risque de boucle de garde. `OnboardingFlow` garde sa machine à 14 états.

#### Trois structures essayées pour les réglages

C'est là qu'est passé le temps de la phase.

1. **Dans l'outlet des onglets, barre d'onglets masquée.** Donnait la
   transition de page. Mais Ionic protestait à chaque navigation —
   `[ion-tabs] Tab with id: "undefined" does not exist`, la route des réglages
   n'ayant aucun onglet — et l'arbre d'éléments de `SettingsView` (~70 props)
   était reconstruit **trois fois par rendu**, une par route. Sous la charge de
   la suite e2e complète, le navigateur finissait par mourir : un sous-test
   expirait à 240 s, puis les suivants tombaient en « fetch failed ». Le même
   sous-test passait seul — le symptôme classique d'un problème de ressources,
   pas de logique.
2. **Un outlet parent** (`/settings/*` d'un côté, les onglets de l'autre) :
   la structure canonique d'Ionic, et le bon choix sur le papier. Écartée faute
   de pouvoir la valider — les outlets imbriqués avec react-router v6 sont
   précisément là où se cachent les bugs, et il n'y a pas de documentation.
3. **Retour anticipé**, la structure d'avant la phase. Retenue. On perd
   l'animation de poussée en entrant dans les réglages ; on garde l'URL comme
   source de vérité, les sous-pages en routes, et l'`IonBackButton` — qui
   remonte la pile même hors outlet.

#### Deux bugs que seul le passage aux routes pouvait créer

**Un rendu conditionnel est réversible, une entrée d'historique non.**
`plannerUnlocked = hasFamily && people.length > 0`, et `hasFamily` passe à vrai
avant que les personnes n'arrivent de Firestore. J'avais remplacé le rendu du
volet Réglages dans cette fenêtre par une redirection vers `/settings` : elle
partait bien, mais rien ne ramenait ensuite l'utilisateur — l'app restait sur
les réglages une fois l'onboarding terminé. Revenu à un rendu.

**Un effet de remise à zéro devenu trois navigations.** Un `useEffect` sur
`[user]` remettait l'écran des réglages à zéro à la déconnexion :
`setShowSettings(false)`, `setSettingsSupportPage("")`,
`setSettingsSubPage("main")`. Inoffensif tant que c'étaient des `useState` ;
devenus des navigations, les deux derniers empilaient **deux entrées
`/settings`** — et cet effet tourne aussi au démarrage, `user` valant `null`
avant la réponse de Firebase. L'historique après onboarding était
`/ → /settings → /settings → /home`, et deux retours depuis n'importe quel
écran ramenaient dans les réglages. **Rien ne se voyait à l'écran** : l'app
s'affichait correctement, seule la pile était polluée. Trouvé en instrumentant
`pushState` / `replaceState`, et verrouillé par un test (`navigation` [7]).

La remise à zéro ne touche plus à l'URL qu'au terme d'une vraie déconnexion,
distinguée du démarrage par un `wasSignedInRef` : au boot, toucher à l'URL
détruirait un lien profond avant même que l'utilisateur soit connu.

#### Deux sélecteurs périmés, silencieux

- `document.querySelector(".mrd-screen .cnt")` dans `SettingsView` et
  `SettingsSupportPage` : les deux sélecteurs ont disparu avec `ion-content`,
  et le retour en haut de page ne faisait plus rien — un `querySelector` qui ne
  trouve rien ne lève pas. Remplacé par `src/utils/scroll.js`, qui passe par
  l'API `scrollToTop` d'`ion-content` et cible la page **visible** (la page
  quittée reste montée).
- Sur écran large, `max-width: 820px; margin: auto` sur `.cnt` rétrécissait
  l'`ion-content` sans le recentrer : les réglages se retrouvaient collés à
  gauche. La contrainte porte maintenant sur `::part(scroll)`.

### Phase 6 — 🟡 Bureau : `IonSplitPane`

- [ ] `SidebarNav` + le `@media (min-width: 900px)` de `styles.css:274-320`
      → `IonSplitPane` + `IonMenu` + `IonList`.
- [ ] Le recentrage du contenu à `max-width: 820px` reste du CSS maison.
- [ ] Vérifier qu'`IonSplitPane` masque bien la `ion-tab-bar` en large, sans
      le `display: none` manuel actuel.

### Phase 7 — 🟠 Overlays : `IonModal`

16 fichiers, à faire **un par un**, en commençant par les plus simples.

- [ ] Ordre proposé : `AppModals.js` (6 modales, les plus simples) →
      `SettingsModals.js` → `NotesView` → `InboxView` → `TasksView` (formulaire
      de tâche, le plus gros) → `AgendaView` → `InventoryView` → `ListsView` →
      `MealsView` / `RecipePicker` → `RecipeSheet` / `RecipesView` →
      `FeedbackWidget` → `VoiceCookingMode` (mode cuisine : à traiter en
      dernier, il a ses propres contraintes de veille et de voix).
- [ ] Feuilles basses (`.mrd-recipe-view-sheet`, panneau bas de `MealsView`) →
      `IonModal` avec `breakpoints` / `initialBreakpoint`, ce qui donne la
      poignée et le glissement gratuitement.
- [ ] Supprimer au fur et à mesure : `.modal-backdrop`, `.modal-card`, les
      keyframes `mrdSlideUp` / `mrdSlideDown` / `mrdFadeIn` / `mrdFadeOut`, et
      le verrou de défilement de `ListsView.js:165-176`.
- [ ] Garder les classes de contenu harmonisées (`.mrd-mhd`, `.mrd-mtitle`,
      `.mrd-mbody`, `.mrd-mact`) : elles stylent l'**intérieur** des modales,
      Ionic ne fournit que le contenant.
- [ ] 🔴 `tests/e2e/tasks.test.js` cible `.task-modal-redesign` (21
      occurrences) — à reprendre quand `TasksView` passe.
- [ ] Nettoyer les règles CSS mortes en fin de phase (le projet a déjà fait ce
      travail, cf. les 116 règles supprimées au log du 13 août).

### Phase 8 — 🟡 Contrôles

Phase peu risquée, très rentable en confort natif. Peut se découper.

- [ ] `ion-toast` : les 40 appels passent par un helper unique
      (`useToast`), pas par 40 `IonToast` inline. Le bouton d'action existant
      (`toast.action`) se mappe sur `buttons`.
- [ ] `ion-alert` : les 3 `window.confirm` (`SettingsModals`, `SettingsView`,
      `RecipesView`) — un `confirm()` bloquant en WebView natif est à éviter.
- [ ] `ion-select` : les 12 `<select>` (roue native au lieu du menu système).
- [ ] `ion-datetime` : les 14 `input type=date|time` (`AgendaView` 2,
      `InventoryView` 1, `InboxView` 4, `SettingsView` 3, `TasksView` 4). ⚠️
      Vérifier le format renvoyé — le code lit `event.target.value` en
      `YYYY-MM-DD`, `IonDatetime` renvoie de l'ISO 8601. Passer par
      `utils/date.js`, ne pas parser à la main dans les vues.
- [ ] `ion-segment` : `SegmentedTabs` devient une enveloppe autour d'
      `IonSegment` (API de props inchangée → les 6 vues appelantes ne bougent
      pas). Retirer les règles `.mrd-subtab*`. ⚠️ Le variant `stacked`
      (emoji + libellé) doit survivre.
- [ ] `ion-searchbar` : les 4 `type="search"`.
- [ ] `ion-toggle` : `.mrd-hdr-switch` et les interrupteurs des réglages.
- [ ] `ion-spinner` / `ion-loading` : les 10 états de chargement. Le splash
      `.ldr` d'`index.html` **reste maison** — il s'affiche avant que React
      soit monté, Ionic n'est pas encore là.

### Phase 9 — ⚪ Gains natifs nouveaux (facultatif, après stabilisation)

- [ ] `ion-refresher` sur Accueil / Tâches / Listes (tirer pour rafraîchir).
- [ ] `ion-item-sliding` : glisser pour supprimer sur les listes de courses,
      les tâches, l'inventaire.
- [ ] `@capacitor/keyboard` + `ion-footer` si la Phase 3 n'a pas suffi à régler
      les champs masqués.
- [ ] Deep links pour les invitations, maintenant que le router existe
      (rouvre la piste fermée dans `TODO_NATIF` §3).
- [ ] Code-splitting par route — le router rend enfin le découpage naturel, et
      le bundle mono-chunk de 1,46 Mo est une dette connue.

---

## 5. Risques transverses

| Risque | Portée | Parade |
|---|---|---|
| 🔴 Les 5 suites e2e ciblent des classes maison qui disparaissent (`.mrd-bnav` ×16, `.task-modal-redesign` ×21, `.onboarding-shell` ×13, `.onb-footer-next` ×21) | Phases 2, 5, 7 | Reprendre les sélecteurs **dans la même phase** que le changement, jamais après. Une phase qui laisse un test rouge n'est pas finie. |
| 🔴 `navigation.test.js` réimplémente `NAV_TABS` et `getBottomId` en Node pur | Phase 2 | Ces fonctions disparaissent avec le router. Réécrire la section 1 du test ou la supprimer — pas la laisser tester du code mort. |
| 🔴 ~200 règles CSS préfixées `.mrd-shell` | Phase 3 | Garder `.mrd-shell` comme classe sur `IonContent`. |
| 🟠 Cascade CSS : Ionic style ses composants par variables `--*`, pas par sélecteurs | toutes | Ne jamais forcer un composant Ionic au `!important` depuis `styles.css`. Passer par ses variables, dans `ionic-bridge.css`. |
| 🟠 Thème sombre écrit à deux endroits | Phase 1 | Centraliser avant d'ajouter `.ion-palette-dark`, sinon ce sera trois endroits. |
| 🟠 `IonDatetime` renvoie de l'ISO, le code attend `YYYY-MM-DD` | Phase 8 | Conversion dans `utils/date.js` uniquement. |
| 🟡 Taille du bundle | Phase 1 | Mesurer avant / après. |
| 🟡 `applyStatusBarTheme` (`utils/statusBar.js`) | Phase 1 | Reste valable, mais vérifier qu'il ne se contredit pas avec la gestion de safe area d'Ionic. |
| 🟡 `react-router-dom` v7 | Phase 1 | Épinglé en `6.30.6`. Un `npm update` distrait casse la nav. |

## 6. Ordre de bataille

```
Phase 0  terrain, docs remises à jour      ── préalable, sans code
Phase 1  socle Ionic + thème               ── invisible à l'œil
Phase 2  barre du bas Ionic                ── la demande, le cœur
Phase 3  IonPage / IonContent              ── safe areas, défilement, FAB
Phase 4  écrans secondaires + swipe-back
Phase 5  réglages / onboarding / auth
Phase 6  IonSplitPane (bureau)
Phase 7  overlays → IonModal (16 fichiers, un par un)
Phase 8  contrôles (toast, alert, select, datetime, segment…)
Phase 9  gains natifs nouveaux             ── facultatif
```

Les Phases 1 à 3 forment le minimum cohérent : en dessous, on a payé le coût
d'Ionic sans en tirer la structure. Les Phases 7 et 8 sont interruptibles à
tout moment — un overlay migré et dix qui ne le sont pas, ça cohabite.

## 7. Suivi

Consigner chaque phase terminée dans `docs/PROJECT_LOG.md` au format habituel
(tableau fichier / changement), et cocher ici. Mettre `docs/ARCHITECTURE.md` à
jour **à la fin de chaque phase structurelle** (1, 2, 3, 5) — pas seulement à
la fin du chantier, c'est comme ça qu'il s'est périmé la première fois.
