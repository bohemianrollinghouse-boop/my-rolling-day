import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Plancher navigateur explicite — l'equivalent Vite du `.browserslistrc`
    // d'Angular sur COBA (browserslist est inerte ici : Vite ne le lit pas).
    // Ces valeurs sont celles de la cible `modules` par defaut de Vite 5, donc
    // le bundle emis est inchange ; elles sont ecrites pour etre visibles.
    //
    // Alignee sur IPHONEOS_DEPLOYMENT_TARGET, qui vaut 15.0 depuis la montee
    // vers Capacitor 8 (Cap 8 exige iOS 15 minimum).
    //
    // La regle a tenir est simple : cette liste ne doit jamais annoncer un
    // support plus large que ce que l'app installe reellement. Sinon une
    // dependance introduisant une syntaxe recente passe le build et casse a
    // l'execution sur l'appareil, sans que rien ne le signale.
    //
    // Historique : la cible disait `safari14` alors que Xcode deployait en
    // 13.0 (MRD-26). Corrigee en `safari13` le 1er septembre, puis remontee ici
    // avec le plancher iOS.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari15"],
    rollupOptions: {
      output: {
        /* ── Decoupage des dependances ──────────────────────────────────
           Trois blocs qui ne changent presque jamais, separes du code de
           l'app qui change a chaque livraison. Le total telecharge est le
           meme ; ce qu'on gagne est ailleurs :

             – le cache du navigateur. Avant, une correction d'une ligne
               dans une vue invalidait 2,5 Mo, Firebase et Ionic compris.
               Desormais elle n'invalide que le chunk applicatif.
             – le telechargement parallele des vendors.

           Le vrai gain de poids au demarrage vient du chargement paresseux
           des vues (voir `src/app/App.js`), pas d'ici. Les deux sont
           complementaires et se mesurent separement. */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@firebase") || id.includes("/firebase/")) return "vendor-firebase";
          if (id.includes("@ionic") || id.includes("ionicons")) return "vendor-ionic";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
