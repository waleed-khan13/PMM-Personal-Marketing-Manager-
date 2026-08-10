import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import * as tar from "tar";

import { INSTALLATION_SCHEMA_VERSION } from "./constants.mjs";
import { assertSafeHttpUrl, readJsonSource, resolveAssetSource, validateManifest } from "./manifest.mjs";
import { backendFileName, releaseTarget } from "./platform.mjs";
import { isPathInside, localgrowthPaths } from "./paths.mjs";

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function downloadHttp(source, destination) {
  if (source.startsWith("http://") && process.env.LOCALGROWTH_ALLOW_INSECURE_DOWNLOADS !== "1") {
    throw new Error(`Refusing insecure release asset URL: ${source}`);
  }
  const response = await fetch(source, {
    headers: { "user-agent": "localgrowth-os-cli" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download release bundle (${response.status}).`);
  }
  assertSafeHttpUrl(response.url);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: "wx" }));
}

async function acquireAsset(source, destination) {
  if (source.startsWith("https://") || source.startsWith("http://")) {
    await downloadHttp(source, destination);
    return;
  }
  const sourcePath = source.startsWith("file:") ? fileURLToPath(source) : path.resolve(source);
  await cp(sourcePath, destination, { errorOnExist: true, force: false });
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function writeJsonAtomically(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

export async function loadInstallation(paths = localgrowthPaths()) {
  let state;
  try {
    state = JSON.parse(await readFile(paths.installationFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Could not read ${paths.installationFile}: ${error.message}`);
  }
  if (state.schemaVersion !== INSTALLATION_SCHEMA_VERSION || typeof state.runtimePath !== "string") {
    throw new Error("The LocalGrowth installation record is invalid. Run `localgrowth update --force`.");
  }
  if (!isPathInside(paths.runtimesDirectory, state.runtimePath)) {
    throw new Error("The LocalGrowth installation record points outside the managed runtime directory.");
  }
  return state;
}

async function validateBundle(runtimePath, version, target) {
  const metadataPath = path.join(runtimePath, "bundle.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (
    metadata.schemaVersion !== 1 ||
    metadata.product !== "localgrowth-os" ||
    metadata.version !== version ||
    metadata.target !== target
  ) {
    throw new Error("Downloaded bundle metadata does not match the selected release.");
  }
  const required = [
    path.join(runtimePath, "web", "server.js"),
    path.join(runtimePath, "backend", backendFileName(target.split("-")[0])),
  ];
  for (const filePath of required) {
    if (!(await pathExists(filePath))) throw new Error(`Downloaded bundle is missing ${path.relative(runtimePath, filePath)}.`);
  }
  if (!target.startsWith("win32-")) await chmod(required[1], 0o755);
}

export async function installRelease({
  manifestSource,
  paths = localgrowthPaths(),
  target = releaseTarget(),
  force = false,
  log = console.log,
} = {}) {
  if (!manifestSource) throw new Error("A release manifest source is required.");
  await mkdir(paths.downloadsDirectory, { recursive: true });
  await mkdir(paths.runtimesDirectory, { recursive: true });
  await mkdir(paths.dataDirectory, { recursive: true });
  await mkdir(paths.logsDirectory, { recursive: true });

  const manifest = await readJsonSource(manifestSource);
  const { asset, version } = validateManifest(manifest, target);
  const assetSource = resolveAssetSource(asset.url, manifestSource);
  const nonce = `${process.pid}-${randomBytes(5).toString("hex")}`;
  const archivePath = path.join(paths.downloadsDirectory, `${target}-${nonce}.tar.gz`);
  const runtimePath = path.join(paths.runtimesDirectory, version, target);
  const stagingPath = `${runtimePath}.staging-${nonce}`;
  if (!isPathInside(paths.runtimesDirectory, runtimePath)) {
    throw new Error("Release version resolves outside the managed runtime directory.");
  }

  log(`Downloading LocalGrowth OS ${version} for ${target}...`);
  try {
    await acquireAsset(assetSource, archivePath);
    const actualChecksum = await sha256File(archivePath);
    if (actualChecksum.toLowerCase() !== asset.sha256.toLowerCase()) {
      throw new Error("Release bundle checksum verification failed. The archive was not installed.");
    }

    await mkdir(stagingPath, { recursive: true });
    await tar.x({
      cwd: stagingPath,
      file: archivePath,
      gzip: true,
      strict: true,
      preservePaths: false,
      filter(_entryPath, entry) {
        if (entry.type === "SymbolicLink" || entry.type === "Link") {
          throw new Error("Release bundle contains a disallowed link entry.");
        }
        return true;
      },
    });
    await validateBundle(stagingPath, version, target);

    if (await pathExists(runtimePath)) {
      if (!force) {
        await rm(stagingPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
      } else {
        await rm(runtimePath, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
        await mkdir(path.dirname(runtimePath), { recursive: true });
        await rename(stagingPath, runtimePath);
      }
    } else {
      await mkdir(path.dirname(runtimePath), { recursive: true });
      await rename(stagingPath, runtimePath);
    }

    const installation = {
      schemaVersion: INSTALLATION_SCHEMA_VERSION,
      version,
      target,
      runtimePath,
      installedAt: new Date().toISOString(),
      manifestSource,
    };
    await writeJsonAtomically(paths.installationFile, installation);
    log(`Installed LocalGrowth OS ${version} at ${runtimePath}`);
    return installation;
  } finally {
    await rm(archivePath, { force: true, maxRetries: 20, retryDelay: 200 });
    await rm(stagingPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  }
}
