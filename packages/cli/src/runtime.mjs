import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { DEFAULT_API_PORT, DEFAULT_WEB_PORT } from "./constants.mjs";
import { loadInstallation } from "./installation.mjs";
import { backendFileName } from "./platform.mjs";
import { localgrowthPaths } from "./paths.mjs";

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function runtimeLayout(installation) {
  const platform = installation.target.split("-")[0];
  return {
    apiExecutable: path.join(installation.runtimePath, "backend", backendFileName(platform)),
    webDirectory: path.join(installation.runtimePath, "web"),
    webServer: path.join(installation.runtimePath, "web", "server.js"),
  };
}

export async function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port }, () => server.close(() => resolve(true)));
  });
}

async function waitForHttp(url, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`LocalGrowth process exited before ${url} became ready.`);
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1_500) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

export function openBrowser(url, platform = process.platform) {
  const command =
    platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", () => {});
  child.unref();
}

function terminateProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const terminator = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    terminator.once("error", () => child.kill());
    return;
  }
  child.kill();
}

async function alreadyRunning(webPort) {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    const body = await response.json();
    return response.ok && body?.service === "localgrowth-api";
  } catch {
    return false;
  }
}

export async function startRuntime({
  paths = localgrowthPaths(),
  webPort = DEFAULT_WEB_PORT,
  apiPort = DEFAULT_API_PORT,
  shouldOpenBrowser = true,
  labsEnabled = false,
  log = console.log,
} = {}) {
  if (!(await isPortAvailable(webPort))) {
    if (await alreadyRunning(webPort)) {
      const url = `http://127.0.0.1:${webPort}`;
      log(`LocalGrowth OS is already running at ${url}`);
      if (shouldOpenBrowser) openBrowser(url);
      return { alreadyRunning: true, url };
    }
    throw new Error(`Port ${webPort} is already in use. Choose another port with --port.`);
  }
  if (!(await isPortAvailable(apiPort))) {
    throw new Error(`Internal API port ${apiPort} is already in use. Choose another port with --api-port.`);
  }

  const installation = await loadInstallation(paths);
  if (!installation) throw new Error("LocalGrowth OS is not installed. Run `localgrowth onboard` first.");
  const layout = runtimeLayout(installation);
  if (!(await exists(layout.apiExecutable)) || !(await exists(layout.webServer))) {
    throw new Error("The installed runtime is incomplete. Run `localgrowth update --force`.");
  }

  const children = new Set();
  let stopping = false;
  const launch = (command, args, options) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true, ...options });
    children.add(child);
    child.once("exit", () => children.delete(child));
    return child;
  };
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) terminateProcessTree(child);
  };

  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => stop();
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  const sharedEnvironment = {
    ...process.env,
    LOCALGROWTH_API_HOST: "127.0.0.1",
    LOCALGROWTH_API_PORT: String(apiPort),
    LOCALGROWTH_DATA_DIR: paths.dataDirectory,
    LOCALGROWTH_ENABLE_LABS: labsEnabled ? "1" : "0",
  };

  try {
    const api = launch(layout.apiExecutable, ["--host", "127.0.0.1", "--port", String(apiPort)], {
      cwd: installation.runtimePath,
      env: sharedEnvironment,
    });
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, api);

    const web = launch(process.execPath, [layout.webServer], {
      cwd: layout.webDirectory,
      env: {
        ...sharedEnvironment,
        HOSTNAME: "127.0.0.1",
        PORT: String(webPort),
        LOCALGROWTH_API_URL: `http://127.0.0.1:${apiPort}`,
        NODE_ENV: "production",
      },
    });
    const url = `http://127.0.0.1:${webPort}`;
    await waitForHttp(`${url}/api/health`, web);
    log(`LocalGrowth OS ${installation.version} is running at ${url}`);
    if (shouldOpenBrowser) openBrowser(url);

    const exitCode = await new Promise((resolve) => {
      api.once("exit", (code) => resolve(code ?? 1));
      web.once("exit", (code) => resolve(code ?? 0));
    });
    stop();
    return { alreadyRunning: false, exitCode, url };
  } finally {
    stop();
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  }
}
