import { spawn } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");
const apiPort = process.env.SOCIUM_API_PORT || "8000";
const webPort = process.env.PORT || "3000";
const dataDirectory = process.env.SOCIUM_DATA_DIR || path.join(projectRoot, "data");
const children = new Set();
let stopping = false;

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function launch(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 50).unref();
}

async function waitForApi(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("The local FastAPI process exited before it became ready.");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // The API is still starting or synchronizing its local Python environment.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The local FastAPI service did not become ready within 90 seconds.");
}

if (!(await exists(path.join(standaloneRoot, "server.js")))) {
  console.error("Socium is not built yet. Run `pnpm build` before `pnpm start`.");
  process.exit(1);
}

await mkdir(standaloneNextRoot, { recursive: true });
await cp(path.join(projectRoot, ".next", "static"), path.join(standaloneNextRoot, "static"), {
  recursive: true,
  force: true,
});

const publicRoot = path.join(projectRoot, "public");
if (await exists(publicRoot)) {
  await cp(publicRoot, path.join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

const api = launch(
  "uv",
  ["run", "--project", "backend", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", apiPort],
  {
    SOCIUM_API_HOST: "127.0.0.1",
    SOCIUM_API_PORT: apiPort,
    SOCIUM_DATA_DIR: dataDirectory,
  },
);

try {
  await waitForApi(`http://127.0.0.1:${apiPort}/api/health`, api);
} catch (error) {
  console.error(error instanceof Error ? error.message : "The local API failed to start.");
  shutdown(1);
}

launch(process.execPath, [path.join(standaloneRoot, "server.js")], {
  HOSTNAME: "127.0.0.1",
  PORT: webPort,
  SOCIUM_API_URL: `http://127.0.0.1:${apiPort}`,
});
