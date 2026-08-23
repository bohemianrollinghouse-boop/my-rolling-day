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
  },
});
