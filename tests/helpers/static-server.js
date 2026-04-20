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
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
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
      response.writeHead(404);
      response.end("Not found");
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
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      });
    },
  };
}
