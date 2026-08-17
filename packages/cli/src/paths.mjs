import os from "node:os";
import path from "node:path";

export function sociumRoot({
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  if (environment.SOCIUM_HOME?.trim()) {
    return path.resolve(environment.SOCIUM_HOME.trim());
  }

  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA?.trim();
    return path.resolve(localAppData || path.join(homeDirectory, "AppData", "Local"), "Socium");
  }
  if (platform === "darwin") {
    return path.resolve(homeDirectory, "Library", "Application Support", "Socium");
  }
  const xdgDataHome = environment.XDG_DATA_HOME?.trim();
  return path.resolve(xdgDataHome || path.join(homeDirectory, ".local", "share"), "socium");
}

export function sociumPaths(options = {}) {
  const root = sociumRoot(options);
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
