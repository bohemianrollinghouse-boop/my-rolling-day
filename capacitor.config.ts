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
    // Remplace @codetrix-studio/capacitor-google-auth, abandonne (derniere
    // publication mai 2024, jamais sorti de la release candidate).
    //
    // Plus aucun identifiant OAuth ici : le plugin les lit dans les fichiers
    // Firebase de chaque plateforme — GoogleService-Info.plist cote iOS,
    // google-services.json cote Android. Les trois clientId de l'ancienne
    // configuration etaient une recopie manuelle de ces memes fichiers, donc
    // une source de divergence en moins.
    FirebaseAuthentication: {
      // Le plugin ouvre le dialogue Google et rend la credential, sans
      // authentifier la couche native : le SDK JS Firebase reste la seule
      // source de verite de la session (cf. src/app/providers/clientAuth.js).
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
