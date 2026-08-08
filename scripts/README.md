# Scripts npm

Scripts de build / release / déploiement, portés depuis le projet COBA et adaptés
à la stack de My Rolling Day (Vite + React/htm + Capacitor + Firebase).
Aucune dépendance npm supplémentaire (utilitaires maison dans `scripts/lib/cli.mjs`),
sauf `googleapis` pour `upload:android`.

## Développement

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur Vite |
| `npm run build` | Build prod dans `dist/` (déclenche `prebuild`) |
| `npm run prebuild` | Génère `src/assets/build-info.json` (version, build, date, commit) |
| `npm run preview` | Sert le `dist/` buildé |
| `npm run cap:sync` | Build + `cap sync` (iOS + Android) |

## Natif — dev sur device

| Commande | Effet |
| --- | --- |
| `npm run build:ios` | Build + `cap sync ios` + ouvre Xcode |
| `npm run build:ios:fast` | Build + `cap copy ios` (pas de re-sync des plugins) + Xcode |
| `npm run build:ios:clean` | Build + sync + `pod deintegrate && pod install` + Xcode |
| `npm run build:android` | Build + sync + `gradlew clean build --refresh-dependencies` + Android Studio |
| `npm run build:android:fast` | Build + `cap copy android` + Android Studio |
| `npm run device:ios` / `device:android` | Build + lance sur un device branché (live reload externe) |

Utilise les variantes `:fast` au quotidien ; `sync` complet uniquement après
ajout/mise à jour d'un plugin Capacitor.

## Release stores

Flux complet :

```bash
npm run releases              # 1. bump interactif version + build (package.json)
npm run prepare:releases      # 2. build prod + cap sync + versions natives (iOS & Android) + AAB
npm run archive:ios           # 3a. archive Xcode + upload App Store Connect
npm run upload:android        # 3b. upload de l'AAB sur Google Play
```

| Commande | Effet |
| --- | --- |
| `npm run releases` | Bump interactif `version` + `build` dans `package.json`, régénère `build-info.json`, commit optionnel |
| `npm run prepare:ios:release` | Build prod, `cap sync ios`, écrit `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` dans le `.pbxproj`, ouvre Xcode |
| `npm run prepare:android:release` | Build prod, `cap sync android`, écrit `versionCode` / `versionName` dans `build.gradle`, produit l'AAB de release |
| `npm run prepare:releases` | Les deux ci-dessus |
| `npm run archive:ios` | `xcodebuild archive` + `-exportArchive` avec upload direct sur App Store Connect (sans l'UI Xcode) |
| `npm run upload:android` | Upload de l'AAB via l'API Google Play (track `internal` par défaut) |

`package.json` porte deux champs pilotés par ces scripts :
- `version` → `MARKETING_VERSION` (iOS) / `versionName` (Android)
- `build` → `CURRENT_PROJECT_VERSION` (iOS) / `versionCode` (Android), incrémenté à chaque bump

### Secrets requis

| Fichier | Pour | Modèle |
| --- | --- | --- |
| `.env.ios` | `archive:ios` (clé API App Store Connect) | `.env.ios.example` |
| `.env.android` | `upload:android` (compte de service Google Play) | `.env.android.example` |
| `android/keystore.properties` | signature de l'AAB de release | `android/keystore.properties.example` |

Tous les trois sont dans `.gitignore`. Sans `keystore.properties`, l'AAB est produit
non signé (build OK, upload Play impossible).

`upload:android` nécessite `npm i -D googleapis`.

## Prérequis machine (Android)

Deux fichiers locaux, non versionnés, nécessaires aux commandes Android :

- `android/local.properties` → `sdk.dir=/Users/<toi>/Library/Android/sdk`
  (Android Studio le crée aussi automatiquement).
- JDK 17+ : Gradle utilise le `JAVA_HOME` de la machine. Pour forcer un JDK
  précis, le déclarer dans `~/.gradle/gradle.properties` (jamais dans
  `android/gradle.properties`, qui est versionné et partagé entre OS) :
  `org.gradle.java.home=/chemin/vers/jdk-21`.

## Firebase

| Commande | Effet |
| --- | --- |
| `npm run emulators:start` | Émulateurs avec import/export de `.firebase-emulator-data` |
| `npm run free-emulators-ports` | Libère les ports émulateurs (9099/8080/5001/5002/4000/4400/4500) après un Ctrl-C brutal. Ne tue que des process java/node/firebase — les services système (ControlCenter/AirPlay) sont épargnés |
| `npm run deploy` | Build + deploy complet (hosting + functions + rules) |
| `npm run deploy:hosting` | Build + hosting uniquement |
| `npm run deploy:functions` | Cloud Functions uniquement |
| `npm run deploy:rules` | Règles Firestore uniquement |
| `npm run deploy:indexes` | Index Firestore uniquement |

## Tests

| Commande | Effet |
| --- | --- |
| `npm test` | Tests unitaires + e2e |
| `npm run test:unit` / `test:e2e` / `test:standalone` | Sous-ensembles |
| `npm run test:release` | Garde-fou avant release : tests + build prod |
