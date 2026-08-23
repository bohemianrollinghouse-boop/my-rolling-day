# Captures d'écran — garde anti-régression visuelle

Outillage mis en place pour la migration Ionic (`docs/MIGRATION_IONIC.md`) :
prendre une photo de chaque écran avant de toucher à quoi que ce soit, puis
recomparer après chaque phase.

## Usage

```bash
# Référence, avant migration (déjà versionnée dans baseline/)
node tests/screenshots/capture.mjs baseline

# Après une phase
node tests/screenshots/capture.mjs phase-2
node tests/screenshots/compare.mjs baseline phase-2
```

19 écrans × 3 variantes (`mobile-light`, `mobile-dark`, `mobile-xl-light`) = 57
captures. Compter ~10 min par exécution, build Vite compris.

Les 5 derniers écrans sont des **états de modale** (`modal-*`), ajoutés en
phase 7 : sans eux la garde visuelle aurait été aveugle sur la conversion des
16 overlays. Deux réserves à connaître :

- `modal-note` capture en fait l'**édition en ligne** : une note qu'on possède
  s'édite sur place, la modale ne s'ouvre que pour la note d'un autre membre.
- `desktop-light` a disparu en phase 6 avec le rendu bureau, remplacé par
  `mobile-xl-light` (430×932). Sa référence pré-Ionic a été régénérée depuis le
  commit de la phase 0, dans un worktree git.

## Zones sûres — `safe-area.mjs`

```bash
node tests/screenshots/safe-area.mjs           # tableau de mesures
node tests/screenshots/safe-area.mjs --shots   # + captures dans safe-area/
```

**À lire avant de faire confiance aux 57 captures ci-dessus.** Chrome headless
n'expose **aucun** inset : `env(safe-area-inset-*)` vaut 0, donc toute la garde
visuelle est aveugle aux marges système. Trois défauts de zone sûre ont traversé
la migration Ionic avec 57/57 `IDENTIQUE` — barre d'onglets écrasée sur
l'indicateur d'accueil, accueil et repas collés à l'heure du téléphone.

`Emulation.setSafeAreaInsetsOverride` (CDP) force de vrais insets. Ce banc
simule un iPhone 15 (393×852, insets 59/34) et **mesure la géométrie** plutôt
que de comparer des pixels : où commence le premier élément peint, quelle
hauteur utile reste aux boutons de la barre. Deux seuils :

- `hContenu >= 59` — le contenu commence sous l'encoche ;
- `utile >= 48` — les boutons gardent une cible tactile correcte.

Le parcours d'onboarding est importé de `capture.mjs` plutôt que recopié : ce
fichier exporte ses aides et ne lance ses captures que s'il est exécuté
directement.

## Ce que ça vaut, et ce que ça ne vaut pas

Le but annoncé n'est **pas** le pixel perfect : c'est de repérer une grosse
régression de mise en page. `compare.mjs` mesure la part de **blocs de 16×16
pixels** franchement différents, pas la part de pixels — un texte relissé
touche beaucoup de pixels dans peu de blocs, un bloc déplacé allume des blocs
entiers. Verdicts : `IDENTIQUE` < 0,5 % · `PROCHE` < 3 % · `ECART` < 15 % ·
`REGRESSION` au-delà (ou dimensions changées, ou capture manquante).

Un `ECART` n'est pas un échec : après la Phase 2 la barre d'onglets Ionic ne
fera pas la même hauteur au pixel que `.mrd-bnav`, et tout le bas d'écran
bougera légitimement. **L'œil tranche, pas le pourcentage.**

## Mesurer un décalage vertical

```bash
node tests/screenshots/shift.mjs baseline phase-3 mobile-light__notes.png …
```

Un décalage vertical uniforme allume énormément de blocs sans être une vraie
régression : chaque carte se retrouve dans le bloc du dessus. `shift.mjs`
cherche, par corrélation sur les moyennes de lignes, le décalage qui minimise
l'écart — et donne donc **de combien** il faut corriger, en pixels CSS.

C'est ce qui a permis d'ajuster les en-têtes Ionic de la phase 3 sur des
mesures (« il manque 10 px sur les écrans à titre seul, 0 sur ceux à barre
segmentée ») au lieu de tâtonner à l'œil.

## Comment ça marche

- `seed.mjs` — jeu de données injecté dans `window.__E2E_PLANNER_SEED`, lu par
  le stub Firestore. Sans lui, les 14 écrans rendent des états vides et la
  comparaison ne prouve rien. La date est figée (`FROZEN_DATE`) via
  `mrd-app-time-mode` : sinon « Aujourd'hui » et la grille de semaine changent
  d'un jour à l'autre et tout devient du bruit.
- `capture.mjs` — build Vite avec stubs Firebase, serveur statique, Chrome
  headless via CDP. Traverse l'onboarding, puis navigue d'écran en écran.
  Les animations sont neutralisées à l'injection (sinon une capture attrape une
  transition à mi-course).
- `shift.mjs` — mesure du décalage vertical entre deux captures (voir plus haut).
- `png.mjs` — décodeur PNG minimal (zlib + défiltrage). Aucune dépendance
  ajoutée : le projet n'en a que deux et une comparaison d'image ne justifie
  pas la troisième.

## Navigation à double détente

`capture.mjs` sait atteindre chaque écran de deux façons : les sélecteurs
maison d'aujourd'hui (`.mrd-bnav-btn`, `.mrd-bnav-quick-item`, `.mrd-gear-btn`)
et, dès que le router existe, l'URL. Il détecte lui-même la présence d'Ionic
(`ion-tab-bar`) et bascule. C'est ce qui permet au **même** script de servir
avant et après la migration — sans quoi la référence serait perdue à la
première phase.

## Piège : la page visible

Avec `IonRouterOutlet`, la page quittée reste montée (`.ion-page-hidden`), et
**une modale apporte sa propre `.ion-page`** (classe `ion-delegate-host`). Un
`document.querySelector` global renvoie donc souvent le mauvais élément : la
capture de la modale d'inventaire ouvrait en fait celle des tâches, depuis la
page précédente. Le script et les tests e2e ciblent maintenant la dernière page
visible **hors modale**.

## Prérequis

Chrome, Edge ou Chromium installé. Les chemins sont dans
`tests/helpers/cdp-browser.js` (`BROWSER_CANDIDATES`) ; `BROWSER_PATH` permet
de forcer un binaire.
