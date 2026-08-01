import { spawn } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(path.join(standaloneRoot, "server.js")))) {
  console.error("LocalGrowth OS is not built yet. Run `pnpm build` before `pnpm start`.");
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

const hostname = process.env.LOCALGROWTH_HOST || "127.0.0.1";
const dataDirectory = process.env.LOCALGROWTH_DATA_DIR || path.join(projectRoot, "data");
const server = spawn(process.execPath, [path.join(standaloneRoot, "server.js")], {
  env: {
    ...process.env,
    HOSTNAME: hostname,
    LOCALGROWTH_DATA_DIR: dataDirectory,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
