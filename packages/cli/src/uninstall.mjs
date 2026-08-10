import { rm } from "node:fs/promises";

import { localgrowthPaths } from "./paths.mjs";

export async function uninstall({ paths = localgrowthPaths(), purgeData = false, confirmed = false } = {}) {
  if (!confirmed) {
    throw new Error("Uninstall requires --yes. Local business data is preserved unless --purge-data is also supplied.");
  }
  if (purgeData) {
    await rm(paths.root, { force: true, recursive: true, maxRetries: 20, retryDelay: 200 });
    return { purgedData: true, preservedData: false };
  }

  await Promise.all([
    rm(paths.runtimesDirectory, { force: true, recursive: true, maxRetries: 20, retryDelay: 200 }),
    rm(paths.downloadsDirectory, { force: true, recursive: true, maxRetries: 20, retryDelay: 200 }),
    rm(paths.installationFile, { force: true }),
  ]);
  return { purgedData: false, preservedData: true, dataDirectory: paths.dataDirectory };
}
