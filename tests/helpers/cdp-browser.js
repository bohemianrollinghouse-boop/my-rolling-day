import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

async function pathExists(filePath) {
  return existsSync(filePath);
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

async function waitForProcessExit(processHandle, timeoutMs = 5000) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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

export async function launchBrowser() {
  const executablePath = await findAvailableBrowser();
  if (!executablePath) return null;

  const userDataDir = await mkdtemp(join(tmpdir(), "mrd-e2e-browser-"));
  const debugPort = 9222;
  const browserArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ];

  if (process.platform === "linux") {
    browserArgs.splice(browserArgs.length - 1, 0, "--no-sandbox");
  }

  const processHandle = spawn(
    executablePath,
    browserArgs,
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  try {
    await waitForDebugger(debugPort);
  } catch (error) {
    processHandle.kill();
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    debugPort,
    executablePath,
    process: processHandle,
    userDataDir,
    async close() {
      processHandle.kill();
      await waitForProcessExit(processHandle);
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

export async function openPageSession(browser, targetUrl = "about:blank") {
  await fetch(`http://127.0.0.1:${browser.debugPort}/json/new?${targetUrl}`, { method: "PUT" });
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
