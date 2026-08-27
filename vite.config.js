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
    // ATTENTION : ios/App a IPHONEOS_DEPLOYMENT_TARGET = 13.0, alors que la
    // cible ci-dessous suppose Safari 14. Les WebView iOS 13.0 a 13.3 n'ont ni
    // `??=` ni les champs de classe. C'est un ecart preexistant, pas introduit
    // ici : le corriger veut dire soit monter la cible Xcode a 14.0, soit
    // descendre `safari14` a `safari13` (et re-verifier le bundle).
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
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
