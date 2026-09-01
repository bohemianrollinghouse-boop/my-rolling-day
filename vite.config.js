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
    // Alignee sur IPHONEOS_DEPLOYMENT_TARGET = 13.0 (ios/App). L'ecart etait
    // reel : la cible annoncait Safari 14 alors que l'app se deploie sur des
    // WebView iOS 13.0 a 13.3, qui n'ont ni `??=` ni les champs de classe.
    //
    // Mesure avant de trancher (1er septembre 2026) : le bundle emis en
    // `safari14` ne contenait deja AUCUNE de ces syntaxes — esbuild transpile
    // l'optional chaining meme en safari14 (forme `==null?void 0:` dans les
    // chunks). Le risque decrit etait donc theorique. Passer a `safari13` coute
    // 3 Ko sur 2748 (0,1 %) et supprime le piege pour de bon : desormais, une
    // dependance qui introduirait `??=` sera transpilee au lieu de casser a
    // l'execution sur un appareil, sans rien signaler au build.
    //
    // L'autre sortie — monter Xcode a 14.0 — n'est pas prise ici : elle
    // exclurait des utilisateurs sans benefice mesurable aujourd'hui. Elle
    // redeviendra necessaire a la montee vers Capacitor 7/8, qui exige iOS 14+.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari13"],
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
