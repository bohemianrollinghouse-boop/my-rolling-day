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

14 écrans × 3 variantes (`mobile-light`, `mobile-dark`, `desktop-light`) = 42
captures. Compter ~4 min par exécution, build Vite compris.

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

## Prérequis

Chrome, Edge ou Chromium installé. Les chemins sont dans
`tests/helpers/cdp-browser.js` (`BROWSER_CANDIDATES`) ; `BROWSER_PATH` permet
de forcer un binaire.
