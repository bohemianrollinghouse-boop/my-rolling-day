// Configuration d'environnement — equivalent de `src/environments/` sur COBA.
//
// COBA (Angular) a un fichier par cible (`environment.ts`, `.prod.ts`, `.e2e.ts`)
// que le builder substitue via `fileReplacements`. Vite n'a pas ce mecanisme :
// l'equivalent idiomatique est un fichier unique qui lit `import.meta.env`,
// remplace statiquement au build. Un jumeau `.prod.js` ne serait jamais
// substitue, donc jamais charge : on ne le cree pas.
//
// Pour vraiment substituer ce module (une cible de test avec un autre projet
// Firebase, par exemple), le point d'extension est `resolve.alias` — c'est
// exactement ainsi que `tests/helpers/e2e-build.js` remplace le SDK Firebase
// par ses bouchons.

// `import.meta.env` est remplace par un litteral au build Vite ; sous Node
// (tests unitaires) il vaut `undefined`, d'ou le repli.
const viteEnv = import.meta.env || {};

const FIREBASE_DEFAULT_AUTH_DOMAIN = "my-rolling-day.firebaseapp.com";

// Le domaine d'auth suit l'hote courant en production HTTPS : sans ca, le
// retour de redirection Google atterrit sur firebaseapp.com et perd la session.
// En local (ou en http), on garde le domaine Firebase.
export function resolveFirebaseAuthDomain() {
  if (typeof window === "undefined") return FIREBASE_DEFAULT_AUTH_DOMAIN;
  const { hostname = "", protocol = "" } = window.location || {};
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!hostname || localHosts.has(hostname) || protocol !== "https:") {
    return FIREBASE_DEFAULT_AUTH_DOMAIN;
  }
  return hostname;
}

export const environment = {
  production: viteEnv.PROD === true,
  firebase: {
    apiKey: "AIzaSyD6B4xw8I507Zb7ZkLAmkUbCPTsnKVBjTE",
    authDomain: resolveFirebaseAuthDomain(),
    projectId: "my-rolling-day",
    storageBucket: "my-rolling-day.firebasestorage.app",
    messagingSenderId: "543367828677",
    appId: "1:543367828677:web:6ff53808141b506ca30cac",
    measurementId: "G-VXTWHBKRNC",
  },
  // Cles PUBLIQUES du SDK RevenueCat, une par plateforme (tableau de bord
  // RevenueCat > Project settings > API keys > public app-specific keys).
  //
  // Publiques par conception, comme la cle Firebase au-dessus : elles
  // identifient l'app, elles n'autorisent rien. La securite vient de la
  // validation des recus par RevenueCat.
  //
  // ⚠️ NE JAMAIS y mettre la cle secrete `sk_` : elle donne un acces total au
  // projet par l'API REST. Elle vit hors du depot, dans .env.revenuecat, et ne
  // sert qu'a l'outillage.
  //
  // Le projet n'a pour l'instant qu'une app « Test Store », dont la cle est
  // commune aux plateformes — d'ou `default` renseigne et `ios`/`android`
  // vides. Ils prendront les cles `appl_…` et `goog_…` quand les apps App Store
  // et Play Store existeront ; `publicSdkKeyForPlatform()` les preferera alors
  // automatiquement.
  revenueCat: {
    ios: "",
    android: "",
    default: "test_fRGwygIKFvEXvoKEQmSOssjYHRB",
  },

  // Cle publique VAPID du Web Push (console Firebase > Cloud Messaging).
  firebaseWebVapidKey:
    "BKuKE9dA60y85KVR2cYuZ4PwNe3vBJSaeNO9wkEyk69baMYcclUSaXoqtb2FzmVwe27pIS9vyB00pxvunHUL99w",
};
