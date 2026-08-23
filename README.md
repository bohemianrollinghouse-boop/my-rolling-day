# My Rolling Day

Application familiale de planification du quotidien, en français. Un foyer
partage tâches, calendrier, repas, recettes, listes de courses, inventaire,
notes et pense-bête, synchronisés en temps réel.

**Applications iOS et Android** (Capacitor). Il n'y a pas de version ordinateur :
`dist/` reste publié sur Firebase Hosting, mais seulement parce que la
redirection d'authentification Google et la page de réinitialisation de mot de
passe en dépendent.

> 📍 **Tu viens travailler sur le code ? Lis [`AGENT.md`](AGENT.md).**
> C'est la carte complète du projet : structure, modèle de données, règles
> produit, zones sensibles, pièges connus. Ce README ne fait que présenter le
> projet et donner de quoi le démarrer.

## Stack

- **Vite 5** + npm
- **React 18 + HTM** — pas de JSX, les composants écrivent des templates ``html`...` ``
- **Ionic** (`@ionic/react` 9) pour la coque, la navigation et les overlays
- **Capacitor 6** pour iOS / Android (`capacitor.config.ts`)
- **Firebase** Auth + Firestore + Cloud Messaging, depuis npm
- Cloud Functions **Node 20** (`functions/`) et **Python 3.13** (`functions-py/`)
- CSS global unique dans `src/theme/styles.css`, tokens `--mrd-*`

Structure du code inspirée du projet COBA — voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Démarrer

```bash
npm install
npm run dev          # serveur Vite, http://localhost:5173
```

C'est une application buildée : **la servir en statique ne marche pas** (les
imports npm nus ont besoin de Vite pour être résolus). Pour vérifier un build
de production :

```bash
npm run build        # vers dist/
npm run preview
```

### Sur téléphone

```bash
npm run build:ios:fast       # build + cap copy + ouvre Xcode
npm run build:android:fast   # build + cap copy + ouvre Android Studio
```

Les variantes sans `:fast` refont un `cap sync` complet — utile seulement après
l'ajout ou la mise à jour d'un plugin Capacitor. Table complète des commandes,
secrets de release et prérequis Android : [`scripts/README.md`](scripts/README.md).

## Tests

```bash
npm test             # unitaires + e2e — compte ~8 min
npm run test:unit
npm run test:e2e
```

Référence au 23 août 2026 : **213 tests, 0 échec, 0 ignoré**.

Le runner est `node:test` (intégré à Node), pas Jest. Les suites e2e pilotent un
Chrome headless par CDP sur un vrai build Vite, avec Firebase remplacé par des
bouchons. S'y ajoute une garde anti-régression visuelle dans
`tests/screenshots/`.

⚠️ **Un `0 fail` ne veut pas dire que quelque chose a été vérifié.** Les sections
CDP se sautent en silence si aucun navigateur n'est trouvé, et un fichier de test
ne tourne que s'il est importé par son agrégateur. Vérifier le compteur
`skipped` (il doit être à 0) et le compteur `# tests`. Détail en
[`AGENT.md` §14](AGENT.md).

## Firebase

Projet `my-rolling-day`. La logique vit dans :

- `src/app/providers/` — façade Auth + Firestore (`client.js` re-exporte les sous-modules)
- `src/environments/environment.js` — configuration et identifiants

Couvre la connexion e-mail / mot de passe, la connexion Google, la gestion du
foyer, les membres, les invitations et la synchronisation Firestore.

Si la connexion Google échoue, vérifier les domaines autorisés dans Firebase
Authentication.

## Fonctionnalités

**Tâches et calendrier** — tâches Aujourd'hui / Semaine / Mois / Mes tâches,
récurrences, planification dans le calendrier, relance des tâches non faites,
notifications. La tâche est la source de vérité ; le bloc calendrier n'est
qu'une couche de placement.

**Repas et recettes** — recettes à ingrédients structurés, condiments séparés,
badges alimentaires, disponibilité par saison et par mois, nombre de personnes,
import depuis une URL, mode cuisine vocal. Grille des repas de la semaine avec
faisabilité calculée **à l'échelle de la semaine** : le stock est un budget que
les créneaux consomment dans l'ordre.

**Listes et inventaire** — liste de courses et listes personnalisées,
quantités et unités, suivi de péremption et de rangement. La liaison avec
l'inventaire est **optionnelle** partout.

**Mémoire produit** — logique de reconnaissance commune à l'inventaire, aux
listes et aux ingrédients de recettes (`src/app/utils/productUtils.js`) : détecte
les produits déjà connus, suggère, et limite les doublons du type
singulier / pluriel / accents / variations proches.

**Foyer** — multi-foyers, membres avec ou sans compte, personnes du foyer,
invitations par code, rôles.

**Notes, pense-bête, historique** — notes avec visibilité privée / partagée /
foyer, capture rapide dispatchable vers tâche, événement ou note, et historique
trié par jour.

Les règles produit qui ne se déduisent pas du code (ce qui doit rester
optionnel, ce qui ne doit jamais être déduit automatiquement du stock, comment
se comportent les récurrences) sont écrites dans [`AGENT.md` §8](AGENT.md).

## Conventions

- **Pas de JSX.** Templates HTM. Ne pas mélanger les deux dans un même fichier.
- **Pas de suffixe `?v=...`.** Cette règle de cache busting datait de l'époque
  sans bundler ; Vite dédoublonne les modules au build. Ne pas la réintroduire.
- **Dates** : passer par `src/app/utils/date.js`. Le projet a un mode de date
  simulée — ne pas ajouter de `new Date()` direct dans une logique métier.
- **État** : toute mutation persistante passe par `updateState`, donc par la
  normalisation de `src/app/utils/state.js`, qui porte les migrations de
  compatibilité. Ne pas contourner cette couche.
- **Couleurs** : les tokens `--mrd-*` de `src/theme/styles.css` sont la seule
  source de vérité. Aucune couleur littérale ailleurs (vérifié par un test).
- **Libellés utilisateur en français.**
- Le prototype design est une référence visuelle. Il ne remplace pas la
  structure du projet.

## Documentation

| Fichier | Contenu |
|---|---|
| [`AGENT.md`](AGENT.md) | **Point d'entrée.** Carte complète : structure, données, règles produit, zones sensibles, pièges. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modèle d'exécution, flux de données, collections Firestore, routage. |
| [`docs/PROJECT_LOG.md`](docs/PROJECT_LOG.md) | Journal daté de chaque chantier, avec la cause réelle des bugs. À consulter pour comprendre *pourquoi* le code est comme ça. |
| [`docs/MIGRATION_IONIC.md`](docs/MIGRATION_IONIC.md) | Migration Ionic : décisions, 9 phases, pièges de cascade CSS. |
| [`docs/TODO_NATIF.md`](docs/TODO_NATIF.md) | Portage iOS / Android : ce qui reste, actions manuelles, audits. |
| [`scripts/README.md`](scripts/README.md) | Commandes npm, releases, secrets, prérequis machine. |

**Tout agent ou développeur qui modifie le projet doit tenir `AGENT.md` à jour**
et consigner son changement dans `docs/PROJECT_LOG.md`. C'est la seule chose qui
empêche la documentation de redevenir fausse.

## Avant une grosse modification

1. Lire [`AGENT.md`](AGENT.md), puis `docs/ARCHITECTURE.md` si tu touches à la
   structure ou à la navigation.
2. Chercher l'entrée correspondante dans `docs/PROJECT_LOG.md` : le *pourquoi*
   d'un choix surprenant y est presque toujours écrit.
3. Identifier le hook ou le composant réellement responsable du flux — une
   partie de la logique inter-modules vit encore dans `src/app/App.js`.
4. Corriger petit et local, en réutilisant les hooks et composants existants.
5. Lancer `npm test` et vérifier que `skipped` vaut 0.
