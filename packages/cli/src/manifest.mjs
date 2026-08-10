import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MANIFEST_SCHEMA_VERSION } from "./constants.mjs";

function isHttpUrl(value) {
  return value.startsWith("https://") || value.startsWith("http://");
}

export function assertSafeHttpUrl(value) {
  const url = new URL(value);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && process.env.LOCALGROWTH_ALLOW_INSECURE_DOWNLOADS === "1") return;
  throw new Error(`Refusing insecure release URL: ${value}`);
}

export async function readJsonSource(source) {
  if (isHttpUrl(source)) {
    assertSafeHttpUrl(source);
    const response = await fetch(source, {
      headers: { "user-agent": "localgrowth-os-cli" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Could not download release manifest (${response.status}).`);
    assertSafeHttpUrl(response.url);
    return response.json();
  }

  const sourcePath = source.startsWith("file:") ? fileURLToPath(source) : path.resolve(source);
  return JSON.parse(await readFile(sourcePath, "utf8"));
}

export function resolveAssetSource(assetSource, manifestSource) {
  if (isHttpUrl(manifestSource)) {
    const resolved = new URL(assetSource, manifestSource).toString();
    assertSafeHttpUrl(resolved);
    return resolved;
  }
  if (isHttpUrl(assetSource) || assetSource.startsWith("file:")) return assetSource;
  const manifestPath = manifestSource.startsWith("file:") ? fileURLToPath(manifestSource) : path.resolve(manifestSource);
  return pathToFileURL(path.resolve(path.dirname(manifestPath), assetSource)).toString();
}

export function validateManifest(manifest, target) {
  if (!manifest || typeof manifest !== "object") throw new Error("Release manifest must be an object.");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported release manifest schema: ${manifest.schemaVersion ?? "missing"}.`);
  }
  if (manifest.product !== "localgrowth-os") {
    throw new Error(`Release manifest is for an unexpected product: ${manifest.product ?? "missing"}.`);
  }
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)
  ) {
    throw new Error("Release manifest has an invalid version.");
  }
  const asset = manifest.assets?.[target];
  if (!asset || typeof asset.url !== "string") {
    throw new Error(`Release ${manifest.version} does not include the ${target} platform bundle.`);
  }
  if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
    throw new Error(`Release ${manifest.version} has an invalid SHA-256 checksum for ${target}.`);
  }
  return { asset, version: manifest.version };
}
