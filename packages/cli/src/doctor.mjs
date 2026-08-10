import { access, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_API_PORT, DEFAULT_WEB_PORT } from "./constants.mjs";
import { loadInstallation } from "./installation.mjs";
import { localgrowthPaths } from "./paths.mjs";
import { isPortAvailable, runtimeLayout } from "./runtime.mjs";

function nodeVersionOkay(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > 20 || (major === 20 && minor >= 9);
}

export async function diagnose({
  paths = localgrowthPaths(),
  webPort = DEFAULT_WEB_PORT,
  apiPort = DEFAULT_API_PORT,
} = {}) {
  const checks = [];
  checks.push({ name: "Node.js 20.9+", ok: nodeVersionOkay(), detail: process.versions.node });

  let installation;
  try {
    installation = await loadInstallation(paths);
    checks.push({
      name: "Installation record",
      ok: Boolean(installation),
      detail: installation ? `${installation.version} (${installation.target})` : "not installed",
    });
  } catch (error) {
    checks.push({ name: "Installation record", ok: false, detail: error.message });
  }

  if (installation) {
    const layout = runtimeLayout(installation);
    for (const [name, filePath] of [
      ["FastAPI runtime", layout.apiExecutable],
      ["Next.js runtime", layout.webServer],
    ]) {
      try {
        await access(filePath);
        checks.push({ name, ok: true, detail: filePath });
      } catch {
        checks.push({ name, ok: false, detail: `missing: ${filePath}` });
      }
    }
  }

  try {
    await mkdir(paths.dataDirectory, { recursive: true });
    const probe = path.join(paths.dataDirectory, `.doctor-${process.pid}`);
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe, { force: true });
    checks.push({ name: "Data directory", ok: true, detail: paths.dataDirectory });
  } catch (error) {
    checks.push({ name: "Data directory", ok: false, detail: error.message });
  }

  const webPortAvailable = await isPortAvailable(webPort);
  checks.push({
    name: `Web port ${webPort}`,
    ok: webPortAvailable,
    detail: webPortAvailable ? "available" : "occupied (LocalGrowth may already be running)",
    advisory: true,
  });
  const apiPortAvailable = await isPortAvailable(apiPort);
  checks.push({
    name: `API port ${apiPort}`,
    ok: apiPortAvailable,
    detail: apiPortAvailable ? "available" : "occupied (LocalGrowth may already be running)",
    advisory: true,
  });

  return {
    ok: checks.every((check) => check.ok || check.advisory),
    root: paths.root,
    checks,
  };
}
