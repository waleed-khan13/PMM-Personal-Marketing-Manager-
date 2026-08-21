const MEBIBYTE = 1024 * 1024;
const KIBIBYTE = 1024;
const DEFAULT_UPDATE_INTERVAL_MS = 250;

function formatAmount(bytes) {
  return (bytes / MEBIBYTE).toFixed(1);
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "-- MB/s";
  if (bytesPerSecond < MEBIBYTE) return `${(bytesPerSecond / KIBIBYTE).toFixed(0)} KB/s`;
  return `${(bytesPerSecond / MEBIBYTE).toFixed(1)} MB/s`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const rounded = Math.ceil(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatDownloadProgress({ downloadedBytes, totalBytes, elapsedMs, status }, barWidth = 20) {
  const safeDownloaded = Math.max(0, downloadedBytes || 0);
  const elapsedSeconds = Math.max(0, elapsedMs || 0) / 1000;
  const bytesPerSecond = elapsedSeconds > 0 ? safeDownloaded / elapsedSeconds : 0;
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return `Downloaded ${formatAmount(safeDownloaded)} MB  ${formatSpeed(bytesPerSecond)}`;
  }

  const ratio = status === "complete" ? 1 : Math.min(1, safeDownloaded / totalBytes);
  const percentage = Math.round(ratio * 100);
  const filled = Math.round(ratio * barWidth);
  const bar = `[${"#".repeat(filled)}${"-".repeat(barWidth - filled)}]`;
  const remainingBytes = Math.max(0, totalBytes - safeDownloaded);
  const eta = status === "complete" ? 0 : remainingBytes / bytesPerSecond;
  return `${bar} ${String(percentage).padStart(3, " ")}%  ${formatAmount(safeDownloaded)} / ${formatAmount(totalBytes)} MB  ${formatSpeed(bytesPerSecond)}  ETA ${formatDuration(eta)}`;
}

export function createDownloadReporter({
  stream = process.stdout,
  log = console.log,
  now = Date.now,
  updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
} = {}) {
  let lastRenderedAt = Number.NEGATIVE_INFINITY;
  let previousLineLength = 0;
  let ttyLineActive = false;
  let lastLoggedPercentage = Number.NEGATIVE_INFINITY;
  let lastUnknownSizeLogAt = Number.NEGATIVE_INFINITY;

  return (progress) => {
    if (progress.status === "error") {
      if (ttyLineActive) stream.write("\n");
      ttyLineActive = false;
      previousLineLength = 0;
      return;
    }

    const timestamp = now();
    const forced = progress.status === "start" || progress.status === "complete";
    if (!forced && timestamp - lastRenderedAt < updateIntervalMs) return;
    lastRenderedAt = timestamp;
    const line = formatDownloadProgress(progress);

    if (stream?.isTTY && typeof stream.write === "function") {
      const padding = " ".repeat(Math.max(0, previousLineLength - line.length));
      stream.write(`\r${line}${padding}`);
      previousLineLength = line.length;
      ttyLineActive = true;
      if (progress.status === "complete") {
        stream.write("\n");
        ttyLineActive = false;
        previousLineLength = 0;
      }
      return;
    }

    if (Number.isFinite(progress.totalBytes) && progress.totalBytes > 0) {
      const percentage = progress.status === "complete" ? 100 : Math.round((progress.downloadedBytes / progress.totalBytes) * 100);
      if (forced || percentage >= lastLoggedPercentage + 10) {
        log(line);
        lastLoggedPercentage = percentage;
      }
      return;
    }

    if (forced || timestamp - lastUnknownSizeLogAt >= 30_000) {
      log(line);
      lastUnknownSizeLogAt = timestamp;
    }
  };
}
