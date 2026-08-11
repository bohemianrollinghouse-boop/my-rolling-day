import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROFILE_PREFIX = "mrd-e2e-browser-";

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function pathExists(filePath) {
  return existsSync(filePath);
}

/**
 * Arrete le navigateur et supprime son profil temporaire.
 *
 * Windows : `kill()` ne tue que le process lance, pas ses enfants (Edge et
 * Chrome en creent plusieurs). Ces enfants gardent le profil verrouille, et le
 * `rm` qui suit echoue en EBUSY. Le hook `after` du test explose alors avant de
 * fermer le serveur HTTP, dont le handle empeche node de sortir : la suite se
 * fige indefiniment. On tue donc l arbre de process, on attend sa sortie, puis
 * on nettoie sans jamais laisser remonter d erreur.
 */
async function terminateBrowser(processHandle, userDataDir) {
  try {
    if (process.platform === "win32" && processHandle.pid) {
      await execFileAsync("taskkill.exe", ["/pid", String(processHandle.pid), "/T", "/F"]).catch(() => {});
    } else {
      processHandle.kill();
    }
    await waitForProcessExit(processHandle);
  } catch (_error) {
    // Process deja mort : rien a faire.
  }

  try {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (_error) {
    // Profil encore verrouille : un dossier temporaire orphelin ne doit pas
    // bloquer la fin de la suite. Le balayage au lancement suivant s en chargera.
  }
}

/**
 * Supprime les profils d anciennes executions restes dans %TEMP%.
 *
 * Filet de securite : un profil que Windows tenait encore verrouille a la fin
 * d un run (~20 Mo chacun) serait sinon la pour toujours. On ne touche qu aux
 * dossiers d au moins une heure, jamais a ceux d un run en cours.
 */
async function sweepStaleProfiles(maxAgeMs = 60 * 60 * 1000) {
  const root = tmpdir();
  let entries;
  try {
    entries = await readdir(root);
  } catch (_error) {
    return;
  }

  const deadline = Date.now() - maxAgeMs;
  await Promise.all(
    entries
      .filter((name) => name.startsWith(PROFILE_PREFIX))
      .map(async (name) => {
        const dir = join(root, name);
        try {
          const info = await stat(dir);
          if (info.mtimeMs > deadline) return;
          await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch (_error) {
          // Toujours verrouille ou deja supprime : on reessaiera au run suivant.
        }
      }),
  );
}

function waitForProcessExit(processHandle, timeoutMs = 5000) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    processHandle.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function findAvailableBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function waitForDebugger(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return response.json();
      }
    } catch (_error) {
      // Browser not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Impossible de joindre le navigateur headless sur le port ${port}.`);
}

class CDPSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || "CDP error"));
        } else {
          resolve(message.result);
        }
        return;
      }

      const waiters = this.eventWaiters.get(message.method);
      if (waiters?.length) {
        const waiter = waiters.shift();
        waiter(message.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout CDP sur l evenement ${method}`));
      }, timeoutMs);

      const wrappedResolve = (params) => {
        clearTimeout(timeout);
        resolve(params);
      };

      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(wrappedResolve);
      this.eventWaiters.set(method, waiters);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

export async function launchBrowser(debugPort = 9222) {
  const executablePath = await findAvailableBrowser();
  if (!executablePath) return null;

  await sweepStaleProfiles();
  const userDataDir = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
  const processHandle = spawn(
    executablePath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  try {
    await waitForDebugger(debugPort);
  } catch (error) {
    await terminateBrowser(processHandle, userDataDir);
    throw error;
  }

  return {
    debugPort,
    executablePath,
    process: processHandle,
    userDataDir,
    async close() {
      await terminateBrowser(processHandle, userDataDir);
    },
  };
}

export async function openPageSession(browser, targetUrl = "about:blank") {
  await execFileAsync("curl.exe", [`http://127.0.0.1:${browser.debugPort}/json/new?${targetUrl}`]);
  const targetsResponse = await fetch(`http://127.0.0.1:${browser.debugPort}/json/list`);
  const targets = await targetsResponse.json();
  const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);

  if (!pageTarget) {
    throw new Error("Aucun onglet de navigateur headless n a ete trouve.");
  }

  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const session = new CDPSession(socket);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  return session;
}
