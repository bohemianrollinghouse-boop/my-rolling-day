import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function startStaticServer(rootDirectory, port = 0) {
  const safeRoot = resolve(rootDirectory);

  const server = createServer(async (request, response) => {
    // Hors du `try` : le repli SPA du `catch` en a besoin.
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    try {
      const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\/+/, "");
      const resolvedPath = resolve(join(safeRoot, normalize(relativePath)));

      if (!resolvedPath.startsWith(safeRoot)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentTypeFor(resolvedPath) });
      response.end(content);
    } catch (_error) {
      /* Repli SPA : tout chemin sans fichier renvoie `index.html`, et c est le
         routeur cote client qui decide. Sans ce repli, aucun test ne peut
         charger un deep link a froid (`/settings/profile`, `/tasks/weekly`), et
         le 404 se lit comme une page blanche impossible a distinguer d un bug
         de rendu.

         Cote production, `firebase.json` a bien la rewrite `** -> /index.html`.
         `netlify.toml` ne l avait pas : elle a ete ajoutee en meme temps que ce
         repli, la migration Ionic ayant rendu ces URL atteignables sans que
         l hebergeur sache les servir.

         Les requetes qui visent clairement un fichier (elles ont une
         extension) gardent leur 404 : renvoyer du HTML a la place d un `.js`
         manquant masquerait une erreur de build derriere une erreur de syntaxe
         incomprehensible. */
      if (extname(requestUrl.pathname)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      try {
        const fallback = await readFile(join(safeRoot, "index.html"));
        response.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        response.end(fallback);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    }
  });

  await new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", resolvePromise);
  });

  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    async close() {
      // Sans cela, une connexion keep-alive encore ouverte (navigateur de test,
      // agent fetch) suffit a faire attendre `close()` indefiniment.
      server.closeAllConnections?.();
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      });
    },
  };
}
