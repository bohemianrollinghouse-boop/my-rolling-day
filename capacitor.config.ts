import type { CapacitorConfig } from '@capacitor/cli';

// Configuration Capacitor. En TypeScript (comme COBA) : la CLI la charge via
// la devDependency `typescript`, jamais embarquee dans le bundle web. Le gain
// concret est la verification de type sur `plugins` — une cle de plugin mal
// orthographiee devient une erreur au lieu d'un reglage silencieusement ignore.

// Fond applique avant le premier rendu web : sans lui, un flash blanc apparait
// au lancement natif. Doit rester aligne sur --mrd-bg clair (src/theme/styles.css)
// et sur THEME_COLOR_LIGHT (src/app/config/constants.js).
const SPLASH_BACKGROUND = '#FAF4ED';

const config: CapacitorConfig = {
  appId: 'fr.myrollingday.app',
  appName: 'My Rolling Day',
  webDir: 'dist',
  server: {
    // https + hote local : requis pour que Firebase Auth et le service worker
    // de notifications s'executent dans un contexte securise sur Android.
    androidScheme: 'https',
  },
  backgroundColor: SPLASH_BACKGROUND,
  ios: {
    backgroundColor: SPLASH_BACKGROUND,
  },
  android: {
    backgroundColor: SPLASH_BACKGROUND,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // Trois identifiants distincts : Google exige un client OAuth par
      // plateforme. Le `serverClientId` (type Web) est celui que Firebase
      // valide cote serveur, il vaut donc le client Android ici.
      serverClientId:
        '543367828677-oiu5v3kgh38g3go24drolk79ceq6ctna.apps.googleusercontent.com',
      iosClientId:
        '543367828677-3ehl9p5tftqfn343cspvrt108s7ckglv.apps.googleusercontent.com',
      androidClientId:
        '543367828677-oiu5v3kgh38g3go24drolk79ceq6ctna.apps.googleusercontent.com',
      // Sans ca, pas de refresh token : la session Google expire au bout d'une
      // heure et l'utilisateur est deconnecte en pleine utilisation.
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
