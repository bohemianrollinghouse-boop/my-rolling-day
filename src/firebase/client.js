// ── Façade Firebase ───────────────────────────────────────────────────────
// Ce fichier re-exporte toutes les fonctions publiques de la couche Firebase.
// Les fichiers de l'app importent toujours depuis "firebase/client.js" — aucun
// consommateur n'a besoin de connaître la structure interne des sous-modules.
//
// Sous-modules :
//   core.js          — init Firebase, utilitaires partagés, formatage erreurs
//   clientAuth.js    — authentification (Google, email, session, mot de passe)
//   clientFamily.js  — foyer, membres, personnes, invitations, profils
//   clientPlanner.js — synchro planner Firestore
//   clientMessaging.js — tokens FCM push
//   clientSupport.js — rapports de bug, suggestions, feedback testeurs

export * from "./core.js";
export * from "./clientAuth.js";
export * from "./clientFamily.js";
export * from "./clientPlanner.js";
export * from "./clientMessaging.js";
export * from "./clientSupport.js";
