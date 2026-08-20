import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as tar from "tar";

import { main } from "../src/cli.mjs";
import { diagnose } from "../src/doctor.mjs";
import { installRelease, loadInstallation } from "../src/installation.mjs";
import { resolveAssetSource, validateManifest } from "../src/manifest.mjs";
import { sociumPaths, sociumRoot } from "../src/paths.mjs";
import { backendFileName, releaseTarget } from "../src/platform.mjs";
import { uninstall } from "../src/uninstall.mjs";

async function checksum(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "socium-cli-"));
  const bundle = path.join(root, "bundle");
  const target = releaseTarget();
  const backend = path.join(bundle, "backend", backendFileName());
  await mkdir(path.join(bundle, "web"), { recursive: true });
  await mkdir(path.dirname(backend), { recursive: true });
  await writeFile(path.join(bundle, "web", "server.js"), "// fixture\n");
  await writeFile(backend, "fixture\n");
  if (process.platform !== "win32") await chmod(backend, 0o755);
  await writeFile(
    path.join(bundle, "bundle.json"),
    JSON.stringify({ schemaVersion: 1, product: "socium", version: "1.0.3", target }),
  );
  const archive = path.join(root, "bundle.tar.gz");
  await tar.c({ cwd: bundle, file: archive, gzip: true }, ["bundle.json", "backend", "web"]);
  const manifest = path.join(root, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      schemaVersion: 1,
      product: "socium",
      version: "1.0.3",
      assets: { [target]: { url: path.basename(archive), sha256: await checksum(archive) } },
    }),
  );
  return { archive, manifest, paths: sociumPaths({ environment: { SOCIUM_HOME: path.join(root, "home") } }), root, target };
}

test("maps application data to native OS locations", () => {
  assert.equal(
    sociumRoot({ platform: "win32", homeDirectory: "C:\\Users\\Ada", environment: { LOCALAPPDATA: "C:\\Local" } }),
    path.resolve("C:\\Local", "Socium"),
  );
  assert.equal(
    sociumRoot({ platform: "darwin", homeDirectory: "/Users/ada", environment: {} }),
    path.resolve("/Users/ada/Library/Application Support/Socium"),
  );
  assert.equal(
    sociumRoot({ platform: "linux", homeDirectory: "/home/ada", environment: {} }),
    path.resolve("/home/ada/.local/share/socium"),
  );
});

test("supports conventional version commands", async () => {
  for (const argument of ["version", "--version", "-v"]) {
    const output = [];
    assert.equal(await main([argument], { log: (value) => output.push(value) }), 0);
    assert.deepEqual(output, ["1.0.3"]);
  }
});

test("rejects wrong-product and path-like release metadata", () => {
  const target = releaseTarget();
  const asset = { url: "bundle.tar.gz", sha256: "a".repeat(64) };
  assert.throws(
    () => validateManifest({ schemaVersion: 1, product: "another-product", version: "1.0.3", assets: { [target]: asset } }, target),
    /unexpected product/,
  );
  assert.throws(
    () => validateManifest({ schemaVersion: 1, product: "socium", version: "..", assets: { [target]: asset } }, target),
    /invalid version/,
  );
  assert.throws(
    () => resolveAssetSource("file:///private/archive.tar.gz", "https://releases.example/manifest.json"),
    /insecure release URL/,
  );
});

test("installs a checksummed platform bundle and diagnoses the runtime", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  const messages = [];
  const installed = await installRelease({
    manifestSource: current.manifest,
    paths: current.paths,
    target: current.target,
    log: (message) => messages.push(message),
  });
  assert.equal(installed.version, "1.0.3");
  assert.equal((await loadInstallation(current.paths)).target, current.target);
  assert.match(await readFile(path.join(installed.runtimePath, "bundle.json"), "utf8"), /socium/);
  assert.ok(messages.some((message) => message.startsWith("Installed Socium")));

  const report = await diagnose({ paths: current.paths, webPort: 39171, apiPort: 39172 });
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "FastAPI runtime" && check.ok));
});

test("rejects a bundle when its checksum is not trusted", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(current.manifest, "utf8"));
  manifest.assets[current.target].sha256 = "0".repeat(64);
  await writeFile(current.manifest, JSON.stringify(manifest));
  await assert.rejects(
    installRelease({ manifestSource: current.manifest, paths: current.paths, target: current.target, log() {} }),
    /checksum verification failed/,
  );
  assert.equal(await loadInstallation(current.paths), null);
});

test("keeps slow downloads alive while bytes continue to arrive", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  const archive = await readFile(current.archive);
  const chunkSize = Math.ceil(archive.length / 40);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-length": archive.length, "content-type": "application/gzip" });
    let offset = 0;
    const interval = setInterval(() => {
      const next = Math.min(offset + chunkSize, archive.length);
      response.write(archive.subarray(offset, next));
      offset = next;
      if (offset === archive.length) {
        clearInterval(interval);
        response.end();
      }
    }, 50);
    response.on("close", () => clearInterval(interval));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const previous = process.env.SOCIUM_ALLOW_INSECURE_DOWNLOADS;
  process.env.SOCIUM_ALLOW_INSECURE_DOWNLOADS = "1";
  context.after(() => {
    if (previous === undefined) delete process.env.SOCIUM_ALLOW_INSECURE_DOWNLOADS;
    else process.env.SOCIUM_ALLOW_INSECURE_DOWNLOADS = previous;
  });

  const address = server.address();
  const manifest = JSON.parse(await readFile(current.manifest, "utf8"));
  manifest.assets[current.target].url = `http://127.0.0.1:${address.port}/bundle.tar.gz`;
  await writeFile(current.manifest, JSON.stringify(manifest));

  const installed = await installRelease({
    manifestSource: current.manifest,
    paths: current.paths,
    target: current.target,
    downloadIdleTimeoutMs: 250,
    log() {},
  });
  assert.equal(installed.target, current.target);
});

test("uninstall preserves data unless purge is explicit", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.root, { recursive: true, force: true }));
  await installRelease({ manifestSource: current.manifest, paths: current.paths, target: current.target, log() {} });
  const database = path.join(current.paths.dataDirectory, "socium.db");
  await writeFile(database, "durable data");

  await assert.rejects(uninstall({ paths: current.paths }), /requires --yes/);
  const result = await uninstall({ paths: current.paths, confirmed: true });
  assert.equal(result.preservedData, true);
  assert.equal(await readFile(database, "utf8"), "durable data");

  await uninstall({ paths: current.paths, confirmed: true, purgeData: true });
  await assert.rejects(readFile(database, "utf8"), /ENOENT/);
});
