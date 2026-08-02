import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const apiPort = process.env.LOCALGROWTH_API_PORT || "8000";
const webPort = process.env.PORT || "3000";
const dataDirectory = process.env.LOCALGROWTH_DATA_DIR || path.join(projectRoot, "data");
const children = new Set();
let stopping = false;

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

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

launch(
  "uv",
  [
    "run",
    "--project",
    "backend",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    apiPort,
    "--reload",
    "--reload-dir",
    "backend/app",
  ],
  {
    LOCALGROWTH_API_HOST: "127.0.0.1",
    LOCALGROWTH_API_PORT: apiPort,
    LOCALGROWTH_DATA_DIR: dataDirectory,
  },
);
launch(
  process.execPath,
  [
    path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "-H",
    "127.0.0.1",
    "-p",
    webPort,
    "--webpack",
  ],
  {
    LOCALGROWTH_API_URL: `http://127.0.0.1:${apiPort}`,
  },
);
