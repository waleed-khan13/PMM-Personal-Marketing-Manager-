import os from "node:os";
import path from "node:path";

export function localgrowthRoot({
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  if (environment.LOCALGROWTH_HOME?.trim()) {
    return path.resolve(environment.LOCALGROWTH_HOME.trim());
  }

  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA?.trim();
    return path.resolve(localAppData || path.join(homeDirectory, "AppData", "Local"), "LocalGrowthOS");
  }
  if (platform === "darwin") {
    return path.resolve(homeDirectory, "Library", "Application Support", "LocalGrowthOS");
  }
  const xdgDataHome = environment.XDG_DATA_HOME?.trim();
  return path.resolve(xdgDataHome || path.join(homeDirectory, ".local", "share"), "localgrowth-os");
}

export function localgrowthPaths(options = {}) {
  const root = localgrowthRoot(options);
  return {
    root,
    dataDirectory: path.join(root, "data"),
    downloadsDirectory: path.join(root, "downloads"),
    installationFile: path.join(root, "installation.json"),
    logsDirectory: path.join(root, "logs"),
    runtimesDirectory: path.join(root, "runtimes"),
  };
}

export function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
