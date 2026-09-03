# Connecter l'agenda My Rolling Day aux agendas du téléphone

> Étude + plan d'implémentation. **Aucun code n'a été écrit** : ce document est
> le seul livrable. Rédigé le 2 septembre 2026 sur la branche `main`
> (commit de départ `e34ed54`).
>
> **Convention de lecture** : tout ce qui est marqué « vérifié » a été lu dans
> le dépôt, avec le fichier et la ligne. Tout ce qui est marqué « doc externe »
> vient d'une source citée en fin de document et n'a **pas** été exécuté ici :
> à revérifier au moment d'implémenter.

---

## 1. Recommandation en une page

**Approche retenue : plugin Capacitor d'accès à l'agenda natif
(`@ebarooni/capacitor-calendar`), en écriture seule, sens unique
My Rolling Day → agenda du téléphone, dans un calendrier dédié « My Rolling
Day » créé par l'app.**

Pourquoi :

- C'est la seule approche qui marche **identiquement sur iOS et Android** avec
  une seule base de code, sans back-end supplémentaire et sans compte tiers.
- L'écriture seule évite le pire coût de conformité : sur iOS 17+ elle ne
  demande que `NSCalendarsWriteOnlyAccessUsageDescription`, une permission que
  le système accorde sans même montrer la liste des calendriers de
  l'utilisateur (doc externe, §5.1) ; côté Google, on n'entre jamais dans le
  processus de vérification des scopes sensibles de l'API Calendar (doc
  externe, §5.2).
- Un **calendrier dédié** rend la désinstallation propre : l'utilisateur
  supprime un calendrier et tout disparaît, sans qu'on ait jamais à toucher
  aux événements qu'il n'a pas créés depuis l'app.

Ce qu'on abandonne en choisissant ça : la synchro **descendante** (les
événements créés dans Google Calendar n'apparaissent pas dans My Rolling Day).
C'est un vrai renoncement fonctionnel, assumé en phase 1 ; le §7 décrit la
phase 2 qui l'ajoute si le besoin se confirme.

---

## 2. Ce que dit le code aujourd'hui (vérifié)

### 2.1 Où vivent les événements

L'état complet du foyer est **un seul document Firestore**,
`families/{familyId}/planner/state`, champ `data`
(`src/app/providers/clientPlanner.js:12-35`). Deux tableaux nous concernent,
déclarés dans `src/app/config/defaultState.js:22-23` :

- `agenda` — événements **ponctuels**, un par date ;
- `recurringEvents` — événements **répétitifs**, un par règle.

La synchro est un `onSnapshot` + une sauvegarde intégrale à chaque changement
d'état, avec comparaison par hash JSON
(`src/app/hooks/usePlannerSync.js:52-63`). Conséquence directe pour nous : **il
n'y a pas de diff par événement**, la moindre écriture réenvoie tout le
document, et la résolution de conflit entre deux téléphones est un
dernier-écrivain-gagne.

### 2.2 Forme d'un événement ponctuel (`agenda[]`)

Source de vérité : `normalizeAgendaItem`, `src/app/utils/state.js:504-526`,
appelée à **chaque chargement** via `normalizeState` ← `checkReset`
(`src/app/utils/state.js:789-790`, invoqué dans `usePlannerSync.js:24` et `:37`).

| Champ | Type | Sens |
| --- | --- | --- |
| `id` | `string` | `agenda-${Date.now()}` (`useAgenda.js`, `handleAddAgenda`) |
| `text` | `string` | titre affiché ; vide ⇒ l'événement n'est pas créé |
| `icon` | `string` | emoji, pas une URL |
| `taskId` | `string` | lien vers une tâche quand `sourceType === "task"` |
| `dateKey` | `string` | **`"AAAA-MM-JJ"` en heure locale** (`localDateKey`, `src/app/utils/date.js:87`) |
| `start` | `string` | `"HH:MM"` locale ; **forcé à `"00:00"` si `allDay`** |
| `duration` | `number` | minutes ; défaut 60 ; **1440 si `allDay`** |
| `allDay` | `boolean` | journée entière |
| `personIds` / `personId` | `string[]` / `string` | personnes « porteuses » ; `personId` est le premier, gardé pour compatibilité |
| `wholeFamily` | `boolean` | si vrai, `personIds` est vidé (`AgendaView.js`, `buildPayload`) |
| `childIds` / `concernedPersonIds` | `string[]` | personnes concernées (doublon historique) |
| `sourceType` | `"task" \| "custom"` | origine de l'entrée |
| `notification` | `object \| null` | `{ enabled, minutesBefore, customMessage, sentKeys[] }` |

**Il n'y a ni champ de fin, ni fuseau horaire, ni date de fin.** La fin est
recalculée à l'affichage (`addMinutesToTime`, `src/app/utils/date.js:146`) et
les dates sont reconstruites par `new Date(\`${dateKey}T${start}\`)`
(`AgendaView.js:340`), c'est-à-dire **interprétées dans le fuseau du
téléphone**. Les heures de l'app sont donc des « heures flottantes » locales.

### 2.3 Forme d'un événement récurrent (`recurringEvents[]`)

`normalizeRecurringItem`, `src/app/utils/state.js:528-554` : mêmes champs que
ci-dessus, plus

| Champ | Type | Sens |
| --- | --- | --- |
| `weekday` | `number` | 0 = dimanche … 6 = samedi (`Date.getDay()`) |
| `recurrenceType` | `"" \| "daily" \| "weekly" \| "monthly"` | vide = à traiter comme `weekly` |
| `startDateKey` | `string` | première occurrence ; peut être `""` |
| `dayOfMonth` | `number \| null` | jour du mois pour `monthly` |
| `dateKey` | `string` | **vide en pratique pour un récurrent** |

**Piège vérifié n°1 — deux producteurs, deux formes.** Un récurrent créé
depuis le modal d'agenda ne porte **que** `weekday` : `handleAddRecurring`
(`src/app/hooks/useAgenda.js:66-92`) énumère les champs à recopier et n'inclut
ni `recurrenceType`, ni `startDateKey`, ni `dayOfMonth`, ni `dateKey`. Un
récurrent créé depuis le formulaire de tâche, lui, les porte tous
(`src/app/hooks/useTasks.js:132-147`). Les branches `daily` / `monthly` de
`AgendaView.js:365-375` ne sont donc atteignables que pour les récurrents nés
d'une tâche. Toute synchro doit gérer les deux formes, ou l'écart produira des
événements muets côté téléphone.

**Piège vérifié n°2 — pas de fin de récurrence, pas d'exception.** Aucun champ
`until`, `count`, ni liste d'occurrences supprimées. Une règle est infinie et
uniforme.

**Piège vérifié n°3 — le récurrent n'a pas d'ancre fiable.** `startDateKey`
peut être `""`. Sans ancre, il n'y a pas de `DTSTART` calculable : il faudra en
choisir une (voir §6.1).

### 2.4 Journée entière (vérifié)

`normalizeDuration` (`AgendaView.js:118-128`) et `buildPayload`
(`AgendaView.js:523-...`) : `allDay` ⇒ `{ duration: 1440, allDay: true }` et
`start: "00:00"`. Il n'existe **aucun moyen** de créer un événement « journée
entière » sur plusieurs jours dans l'UI actuelle : une journée entière = un
seul `dateKey`.

### 2.5 Notifications (vérifié)

Il n'y a **pas** de notification native planifiée pour les événements : une
boucle `setInterval` de 30 s dans `AgendaView.js:330-405` compare l'heure
courante à `start - minutesBefore` et n'envoie que si l'app tourne, avec une
fenêtre de tolérance de 60 s et un anti-doublon par `sentKeys`.
`@capacitor/local-notifications` est installé et utilisé pour l'affichage
immédiat (`src/app/plugins/notifications.js`), pas pour la planification.

Effet de bord important : **chaque notification envoyée écrit dans l'état**
(ajout d'une clé dans `sentKeys`, `AgendaView.js:349` et `:392`), donc
déclenche une sauvegarde Firestore complète. Une synchro qui réagirait
naïvement à « l'état a changé » se redéclencherait à chaque notification.

### 2.6 Piège vérifié n°4, le plus coûteux : la normalisation efface les champs inconnus

`normalizeAgendaItem` et `normalizeRecurringItem` **reconstruisent un objet
neuf** champ par champ (`state.js:507-525` et `:531-553`). Tout champ ajouté à
un événement et non déclaré là — typiquement le futur `externalIds` — sera
**silencieusement supprimé au prochain chargement Firestore**. C'est le premier
patch à écrire, avant toute ligne de synchro.

### 2.7 Côté natif (vérifié)

- `capacitor.config.ts` : `appId` `fr.myrollingday.app`, aucun plugin calendrier
  déclaré.
- `package.json` : Capacitor **8.5.x**. Aucun plugin calendrier.
  `@capacitor/filesystem` et `@capacitor/share` sont **déjà installés** —
  l'approche « export .ics » ne coûterait donc aucune dépendance nouvelle.
- `ios/App/App/Info.plist:41-48` : quatre `UsageDescription` (caméra, micro,
  reconnaissance vocale, photothèque). **Aucune clé calendrier.**
- `android/app/src/main/AndroidManifest.xml:41-45` : `INTERNET`,
  `POST_NOTIFICATIONS`, `RECORD_AUDIO`. **Aucune permission calendrier.**
- `functions/index.js` : Cloud Functions v2 déjà en place, avec `onCall`,
  `onRequest` et `onSchedule` — l'infrastructure existe si on veut plus tard
  servir un flux ICS ou faire tourner une synchro serveur.

> Note en passant : `AGENT.md` §1 annonce « Capacitor 6 » alors que
> `package.json` est en 8.5.x. À corriger dans le commit qui implémentera ce
> plan — la version conditionne le choix du plugin.

---

## 3. Les quatre approches comparées

| | Sens | Effort | Nouvelle dépendance | Back-end | Publication |
| --- | --- | --- | --- | --- | --- |
| **A. Plugin Capacitor natif** | ↑ écriture (↓ lecture possible) | Moyen | 1 plugin | non | permissions à justifier |
| **B. API Google Calendar OAuth** | ↑ et ↓ | Élevé | SDK + OAuth | oui (jetons) | vérification Google + Android seulement |
| **C. Abonnement ICS / CalDAV** | ↓ seulement (lecture par le téléphone) | Moyen | aucune | oui (URL publique) | aucune permission |
| **D. Export .ics ponctuel** | ↑ une fois, manuel | Faible | aucune | non | aucune permission |

### 3.1 A — Plugin Capacitor d'accès à l'agenda natif

Candidat principal : **`@ebarooni/capacitor-calendar`**, annoncé compatible
**Capacitor 8** (doc externe), ce qui correspond au dépôt. Il expose la
création, modification, suppression d'événements, la liste des calendriers, la
création d'un calendrier dédié, la lecture d'événements sur une plage, le
support des récurrences et des journées entières. Une alternative existe,
`@capacitor-community` / fork `Cap-go/capacitor-calendar` — à comparer sur la
fraîcheur des publications au moment d'implémenter.

- **Sens de synchro** : écriture seule (recommandé) ou bidirectionnel si on
  demande l'accès complet.
- **Permissions iOS** : depuis iOS 17, EventKit sépare deux niveaux (doc
  externe) — `NSCalendarsWriteOnlyAccessUsageDescription` pour créer sans lire,
  et `NSCalendarsFullAccessUsageDescription` pour lire. `NSCalendarsUsageDescription`
  reste nécessaire pour les versions antérieures. **Ne déclarer que ce qu'on
  utilise** : une clé « full access » présente sans usage correspondant est un
  motif de rejet App Store classique.
- **Permissions Android** : `READ_CALENDAR` et `WRITE_CALENDAR` dans le
  manifeste, demandées à l'exécution. Attention : Android ne sépare pas
  lecture et écriture aussi finement — `WRITE_CALENDAR` fait partie du même
  groupe de permissions et le dialogue système parlera de « calendrier » tout
  court.
- **Pièges** : (1) sur Android, l'éditeur natif d'événement renvoie `null`
  comme identifiant, il faut requêter après coup pour retrouver l'événement —
  donc **ne pas passer par l'éditeur natif**, créer par API ; (2) le
  « calendrier par défaut » peut être un compte en lecture seule (calendrier
  d'entreprise, calendrier d'abonnement) ; (3) le multi-compte Android fait que
  l'événement peut atterrir dans un calendrier non synchronisé au cloud.
- **Publication** : coût faible, à condition que la fiche magasin et les
  chaînes de justification expliquent l'usage. Pas de vérification externe.

### 3.2 B — API Google Calendar en OAuth

- **Sens** : le seul qui donne une vraie synchro bidirectionnelle avec
  notifications de changement (canaux push / `syncToken`).
- **Effort** : le plus élevé des quatre. Il faut un flux OAuth, un stockage
  sûr des jetons de rafraîchissement (donc côté serveur, dans les Cloud
  Functions existantes, jamais dans le document planner qui est lisible par
  tout le foyer), une boucle de synchro incrémentale, et une gestion des
  révocations.
- **Conformité** : les scopes Calendar sont classés **sensibles** par Google
  (doc externe). La vérification demande une justification par scope, une
  vidéo de démonstration du parcours de consentement, et la validation
  préalable de l'identité de marque ; Google annonce 3 à 5 jours ouvrés, ce qui
  est optimiste en pratique. Le régime **restreint** (avec évaluation de
  sécurité CASA payante et re-certification annuelle) concerne d'autres API —
  une source secondaire affirme que `calendar.events` peut y basculer ; **cette
  affirmation n'est pas confirmée par la documentation officielle** et doit
  être vérifiée avant d'engager cette voie.
- **Piège de couverture** : ça ne résout que le cas Google. Un utilisateur iOS
  qui n'a que son iCloud n'est pas servi — il faudrait alors coder A **en
  plus**. C'est ce qui disqualifie B comme approche unique.

### 3.3 C — Abonnement ICS / CalDAV en lecture seule

Une Cloud Function `onRequest` (l'infrastructure existe déjà) sert un fichier
`.ics` à une URL secrète par foyer ; l'utilisateur y abonne son téléphone
(`webcal://…`).

- **Sens** : descendant du point de vue du téléphone (My Rolling Day → agenda),
  donc **le même sens utile que A**, sans aucune permission ni plugin.
- **Effort** : moyen — un générateur ICS correct (pliage de lignes à 75
  octets, échappement, `VTIMEZONE` ou `TZID`) et un jeton d'URL.
- **Pièges sérieux** : (1) la fréquence de rafraîchissement est décidée par le
  téléphone, pas par nous — souvent plusieurs heures, parfois une journée sur
  iOS ; un événement ajouté maintenant peut n'apparaître que demain ; (2) une
  URL non authentifiée qui expose l'agenda d'une famille est une fuite de
  données si elle circule — il faut un jeton long, révocable, et l'assumer dans
  la politique de confidentialité ; (3) aucune écriture possible ;
  (4) l'abonnement se fait hors de l'app, l'expérience est mauvaise.
- **CalDAV** au lieu d'ICS n'apporte l'écriture qu'au prix d'un serveur CalDAV
  complet : hors de proportion ici.

### 3.4 D — Export .ics ponctuel

Générer un `.ics` et le passer à `@capacitor/share` ou l'écrire via
`@capacitor/filesystem` — **les deux plugins sont déjà installés**.

- **Sens** : montant, une fois, manuel, sans lien conservé.
- **Effort** : faible (une fonction de génération + un bouton). Aucune
  permission.
- **Pièges** : re-exporter crée des **doublons** chez l'utilisateur, sauf à
  stabiliser les `UID` — et même avec des `UID` stables, le comportement de
  déduplication dépend de l'application qui importe.
- **Utilité réelle** : c'est le **filet de sécurité**. Il coûte quasi rien, il
  marche sur toutes les plateformes y compris le web, et il rend service quand
  A échoue (permission refusée, calendrier par défaut en lecture seule). À
  livrer en même temps que A.

---

## 4. Plan d'implémentation (approche A + filet D)

### 4.1 Étape 0 — rendre l'état capable de porter des identifiants externes

**Sans cette étape, rien ne tient** (cf. §2.6).

| Fichier | Changement |
| --- | --- |
| `src/app/utils/state.js` | dans `normalizeAgendaItem` (~l.507) et `normalizeRecurringItem` (~l.531), ajouter la conservation de `externalIds` : `externalIds: sanitizeExternalIds(item?.externalIds)`, avec une fonction locale qui ne garde que des couples `{ deviceId, calendarId, eventId, syncedHash, syncedAt }` sérialisables |
| `src/app/config/defaultState.js` | ajouter `calendarSync: { enabled: false, calendarId: "", deviceId: "", lastFullSyncAt: "", scope: "mine" }` à l'état par défaut |
| `src/app/utils/state.js` | normaliser ce nouveau bloc dans `normalizeState` (même raison : sinon il disparaît) |
| `tests/unit.test.js` | un test qui charge un état contenant `externalIds` et vérifie qu'il survit à `checkReset` — c'est le test qui empêche la régression de revenir |

**Forme de `externalIds`** (tableau, pas objet) :

```js
externalIds: [
  {
    deviceId: "dev-a1b2c3",       // identifiant local au téléphone, cf. 4.2
    calendarId: "…",              // calendrier natif « My Rolling Day »
    eventId: "…",                 // identifiant rendu par le plugin
    syncedHash: "…",              // hash des champs synchronisés
    syncedAt: "2026-09-02T10:00:00.000Z",
  },
]
```

Pourquoi un tableau indexé par appareil : le document planner est **partagé
entre les membres du foyer**, et l'événement est écrit dans le calendrier de
*chaque* téléphone qui a activé la synchro. Un seul `externalId` global se
ferait écraser en boucle par les téléphones les uns après les autres.

### 4.2 Étape 1 — la couche d'accès au calendrier

Nouveau fichier **`src/app/plugins/calendar.js`**, sur le modèle exact de
`src/app/plugins/notifications.js` (même structure : détection
`Capacitor.isNativePlatform()`, import dynamique du plugin, cache synchrone de
la permission, garde web). Interface proposée :

```js
export function getCalendarPermissionState();      // cache synchrone
export async function refreshCalendarPermissionState();
export async function requestCalendarPermission();  // write-only
export async function ensureAppCalendar();          // crée/retrouve « My Rolling Day », rend calendarId
export async function createExternalEvent(payload); // rend eventId
export async function updateExternalEvent(eventId, payload);
export async function deleteExternalEvent(eventId);
export function getDeviceId();                      // uuid persisté en localStorage
```

⚠️ Reprendre le commentaire d'avertissement de `notifications.js:27-30` : ne
jamais résoudre directement le proxy du plugin Capacitor, retourner le
namespace du module et déréférencer à l'appel. Le bug est le même ici.

`getDeviceId()` : un UUID généré une fois et stocké via
`src/app/utils/storage.js` (local à l'appareil, jamais dans Firestore).

### 4.3 Étape 2 — le moteur de synchro

Nouveau fichier **`src/app/hooks/useCalendarSync.js`**, appelé depuis
`src/app/App.js` à côté des autres hooks d'état.

Principe : **réconciliation, pas événementiel.** À chaque déclenchement, on
calcule l'ensemble des occurrences à publier sur une fenêtre glissante, on le
compare aux `externalIds` déjà posés, et on applique la différence.

Déclencheurs :
- au démarrage, si `calendarSync.enabled` ;
- au retour au premier plan (`@capacitor/app`, déjà installé) ;
- après une modification d'agenda, **débattue de quelques secondes**.

**Filtre anti-boucle indispensable** : ne déclencher que si le hash des champs
*synchronisables* a changé. Sans ça, chaque écriture de `notification.sentKeys`
(§2.5) relancerait une synchro complète.

Fenêtre de synchro : de J-7 à J+180. Au-delà, on ne publie pas — les récurrents
seront republés à la prochaine synchro par glissement de fenêtre.

### 4.4 Étape 3 — mapping des champs

| My Rolling Day | Événement natif | Règle |
| --- | --- | --- |
| `icon` + `text` | `title` | `"🗓️ Rendez-vous"` — l'emoji devant, comme dans `sendAgendaNotification` (`AgendaView.js:19-20`) |
| `dateKey` + `start` | `startDate` | `new Date(\`${dateKey}T${start}\`).getTime()` — même construction que le code existant, donc même fuseau local |
| `duration` | `endDate` | `startDate + duration * 60000` |
| `allDay` | `isAllDay` | voir §6.2 |
| `personIds`, `childIds` | `notes` | **pas** en invités : ce sont des identifiants internes de personnes, pas des adresses e-mail. Écrire une ligne lisible : « Pour : Léa, Tom » |
| `notification.minutesBefore` | alerte de l'événement | seulement si `notification.enabled` |
| `id` | `notes` (marqueur) + `externalIds` | marqueur texte `[mrd:agenda-123]` en dernière ligne des notes, comme filet de rattrapage si `externalIds` est perdu |
| `taskId`, `sourceType`, `wholeFamily` | — | non transmis |

Les noms de champs exacts du plugin (`title`, `startDate`, `isAllDay`,
`alertOffsetInMinutes`…) sont **à vérifier dans les typages du plugin** au
moment d'implémenter : ils viennent ici de sa documentation, pas d'un essai.

### 4.5 Étape 4 — l'interface

| Fichier | Changement |
| --- | --- |
| `src/app/routes.js` | ajouter `"calendar"` à `SETTINGS_SECTIONS` (l.48-51) |
| `src/app/pages/settings/SettingsView.js` | nouvelle branche `if (settingsPage === "calendar")` sur le modèle de la section `notifications` (l.700) : interrupteur d'activation, choix de portée (tout le foyer / mes événements seulement), bouton « Resynchroniser », bouton « Exporter en .ics », état de la dernière synchro |
| `src/app/pages/agenda/AgendaView.js` | rien d'obligatoire ; au mieux une pastille discrète sur les événements publiés |

### 4.6 Étape 5 — permissions natives

| Fichier | Ajout |
| --- | --- |
| `ios/App/App/Info.plist` | `NSCalendarsWriteOnlyAccessUsageDescription` — « My Rolling Day ajoute les événements de votre agenda familial dans le calendrier de votre iPhone. » (+ `NSCalendarsUsageDescription` avec le même texte pour iOS 16 et antérieur, si la cible le permet). **Ne pas ajouter la clé « full access »** tant qu'on n'implémente pas la lecture |
| `android/app/src/main/AndroidManifest.xml` | `WRITE_CALENDAR` (et `READ_CALENDAR` seulement si on relit les événements pour vérifier leur existence — à trancher : c'est le cas si on veut détecter les suppressions faites par l'utilisateur) |
| `package.json` | `@ebarooni/capacitor-calendar` — **installation interdite dans ce worktree**, à faire dans la branche d'implémentation |
| `AGENT.md`, `docs/PROJECT_LOG.md` | obligatoire d'après `AGENT.md` §0 |

### 4.7 Étape 6 — le filet .ics (approche D)

`src/app/utils/ics.js` : génération pure (testable sans navigateur, comme
`routes.js`), plus un bouton dans la section réglages. Réutiliser
`@capacitor/share`, déjà installé. Les `UID` doivent être
`${eventId}@myrollingday.fr` — stables, pour limiter les doublons à
la ré-importation.

---

## 5. Sources externes

1. `@ebarooni/capacitor-calendar` — README (compatibilité Capacitor 8, clés
   Info.plist, permissions Android, API, limite de l'éditeur natif Android) :
   <https://github.com/ebarooni/capacitor-calendar/blob/main/README.md>
2. Google — vérification des scopes sensibles (Calendar classé sensible,
   justification + vidéo, 3-5 jours ouvrés, pas de CASA mentionné) :
   <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>
3. Google — vérification des scopes restreints (CASA, recertification
   annuelle), pour situer ce qui **ne** s'applique **pas** ici :
   <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>
4. Alternative de plugin à comparer :
   <https://github.com/Cap-go/capacitor-calendar/>

---

## 6. Les deux sources de bugs à traiter en premier

### 6.1 Récurrence

Le problème n'est pas d'écrire une `RRULE`, c'est que **le modèle de l'app n'en
contient pas assez pour en fabriquer une fiable** (§2.3).

**Décision recommandée : ne pas publier de récurrence native. Publier des
occurrences individuelles sur la fenêtre glissante.**

Justification :

- `startDateKey` peut être vide et `recurrenceType` peut être `""` : sans ancre
  ni fréquence explicites, une `RRULE` serait devinée, et une règle infinie
  fausse pollue l'agenda de l'utilisateur pour toujours.
- Il n'existe aucune notion d'exception ni de fin (§2.3, piège n°2) : l'app ne
  pourrait de toute façon pas exprimer « sauf le 14 juillet ».
- L'app **expanse déjà les occurrences elle-même** pour l'affichage
  (`AgendaView.js:611-627`) : la logique de « cet événement a-t-il lieu ce
  jour-là » existe et est testée à l'usage. La réutiliser telle quelle évite
  d'écrire une deuxième vérité.

Conséquences à assumer :
- une occurrence publiée = une entrée dans `externalIds`, indexée par
  `${recurringId}#${dateKey}` ;
- la fenêtre glisse : à chaque synchro on ajoute les nouvelles occurrences
  entrant dans J+180 et on ne retouche pas le passé ;
- si l'utilisateur modifie la règle, on supprime **toutes** les occurrences
  futures portant ce `recurringId` et on republie. Le passé reste tel quel.

Si, plus tard, on veut de vraies `RRULE` : il faudra d'abord rendre uniformes
les deux producteurs de `recurringEvents` (§2.3, piège n°1) et rendre
`startDateKey` obligatoire. C'est un préalable, pas un détail.

### 6.2 Journée entière

Trois règles, à écrire noir sur blanc dans le code :

1. **La fin est exclusive.** Un événement « journée entière » du 2 septembre se
   publie `start = 2026-09-02`, `end = 2026-09-03`. Écrire `end = 2026-09-02`
   donne un événement de durée nulle qui, selon l'agenda, disparaît ou s'affiche
   sur zéro jour. C'est le bug le plus courant du domaine.
2. **Ne jamais dériver `allDay` de `duration === 1440`.** Le seul champ qui
   fait foi est `allDay` (§2.4) ; un événement de 9 h à 9 h le lendemain a lui
   aussi 1440 minutes et n'est pas une journée entière.
3. **Pas de conversion de fuseau sur les journées entières.** Le `dateKey` est
   une date civile locale (`localDateKey`, `date.js:87`). La convertir en UTC
   décale l'événement d'un jour pour tout utilisateur à l'ouest de Greenwich —
   et le déplace tout seul si l'utilisateur voyage. Publier la date telle
   quelle, en date pure.

Cas particulier à tester explicitement : un événement **non** « journée
entière » dont l'heure de début plus la durée dépasse minuit. `endTime` est
calculé par `addMinutesToTime` (`date.js:146`) qui travaille en minutes depuis
minuit — vérifier son comportement au passage de 24 h avant de s'appuyer
dessus pour construire `endDate`.

### 6.3 Doublons, conflits, suppressions, hors-ligne

- **Doublons** : la clé est `externalIds` **plus** le marqueur `[mrd:…]` dans
  les notes. Avant toute création, chercher un événement existant portant le
  marqueur sur la plage ; si trouvé, adopter son identifiant au lieu d'en créer
  un second. Sans ce garde-fou, une restauration de sauvegarde du téléphone
  duplique tout l'agenda.
- **Conflits** : la synchro est unidirectionnelle, donc My Rolling Day gagne
  toujours. Une modification faite dans l'agenda du téléphone sera **écrasée à
  la synchro suivante** — c'est à dire explicitement dans l'écran de réglages,
  pas seulement dans ce document.
- **Suppressions** : supprimer un événement dans l'app doit supprimer les
  copies natives. Or `handleDeleteAgenda` (`useAgenda.js:57-62`) retire
  l'entrée immédiatement, `externalIds` compris. Il faut donc soit conserver
  une file de suppressions en attente dans `calendarSync`, soit intercepter la
  suppression dans le hook de synchro **avant** que l'entrée disparaisse de
  l'état. La deuxième solution est plus simple mais échoue si la suppression a
  été faite depuis un autre téléphone du foyer — d'où la file, à préférer.
- **Hors-ligne** : l'accès au calendrier natif est local, donc il fonctionne
  hors-ligne. Ce qui ne fonctionne pas hors-ligne, c'est la propagation
  Firestore. Traiter la synchro calendrier comme un **effet du dernier état
  connu** : elle rejoue sur ce qu'elle a, et se recalcule au retour du réseau.
  Ne pas bloquer l'UI sur son résultat.

---

## 7. Suite possible (phase 2), si le besoin descendant se confirme

Passer le plugin en **accès complet**
(`NSCalendarsFullAccessUsageDescription` + `READ_CALENDAR`) et lire les
événements des calendriers choisis par l'utilisateur pour les **afficher en
lecture seule** dans la vue agenda, sans jamais les enregistrer dans
Firestore — un simple recouvrement visuel. C'est nettement moins risqué que de
faire entrer des événements extérieurs dans l'état partagé du foyer, et ça
répond à 90 % de la demande réelle (« je veux voir mon boulot et l'agenda
familial au même endroit »).

L'API Google Calendar (approche B) ne devient justifiable que si un besoin
serveur apparaît — par exemple envoyer des rappels quand l'app est fermée, ce
que la boucle actuelle (§2.5) ne sait pas faire de toute façon.
