import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const webPort = Number(process.env.LOCALGROWTH_E2E_WEB_PORT ?? "3100");
const apiPort = Number(process.env.LOCALGROWTH_E2E_API_PORT ?? "8100");
const mockPort = Number(process.env.LOCALGROWTH_E2E_MOCK_PORT ?? "4100");
const runtimeDirectory = path.join(projectRoot, "output", "playwright", "runtime", String(process.pid));
const children = new Set();
let stopping = false;

const mockState = {
  modelRequests: 0,
  generationRequests: 0,
  wordpressAuthChecks: 0,
  wordpressPublishes: 0,
  metaAuthChecks: 0,
  metaPublishes: 0,
  lastPublishedPost: null,
  lastFacebookPost: null,
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const mockServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${mockPort}`);

  try {
    if (request.method === "GET" && url.pathname === "/__e2e/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/__e2e/state") {
      sendJson(response, 200, mockState);
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      mockState.modelRequests += 1;
      sendJson(response, 200, { data: [{ id: "e2e-model" }] });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      mockState.generationRequests += 1;
      await readJson(request);
      const facebookDraft = mockState.generationRequests > 1;
      sendJson(response, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: facebookDraft ? "A useful Facebook Page update" : "A practical local growth checklist",
                body: facebookDraft
                  ? "Share one useful local insight, invite a relevant response, and keep the final post human-reviewed."
                  : "Start with one clear customer problem, publish a useful answer, and review the result before the next post.",
                hashtags: facebookDraft ? ["#LocalBusiness", "#FacebookMarketing"] : ["#LocalGrowth", "#SmallBusiness"],
                rationale: facebookDraft
                  ? "A concise, reviewed update is appropriate for the connected Facebook Page."
                  : "A concrete checklist gives a small business an immediately useful next step.",
              }),
            },
          },
        ],
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/wp-json/wp/v2/users/me") {
      mockState.wordpressAuthChecks += 1;
      sendJson(response, 200, {
        id: 7,
        name: "E2E Editor",
        capabilities: { edit_posts: true },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/wp-json/wp/v2/posts") {
      mockState.wordpressPublishes += 1;
      mockState.lastPublishedPost = await readJson(request);
      sendJson(response, 201, {
        id: 4242,
        link: `http://127.0.0.1:${mockPort}/posts/4242`,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/meta/v25.0/123456789012345") {
      mockState.metaAuthChecks += 1;
      if (request.headers.authorization !== "Bearer e2e-page-access-token") {
        sendJson(response, 401, { error: { code: 190, message: "Invalid OAuth access token." } });
        return;
      }
      if (url.searchParams.get("fields") !== "id,name") {
        sendJson(response, 400, { error: { code: 100, message: "Unsupported fields request." } });
        return;
      }
      sendJson(response, 200, {
        id: "123456789012345",
        name: "Northstar Studio",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/meta/v25.0/123456789012345/feed") {
      mockState.metaPublishes += 1;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      mockState.lastFacebookPost = Object.fromEntries(
        new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
      );
      sendJson(response, 200, { id: "123456789012345_987654321" });
      return;
    }

    sendJson(response, 404, { message: `Unhandled E2E route: ${request.method} ${url.pathname}` });
  } catch (error) {
    sendJson(response, 500, {
      message: error instanceof Error ? error.message : "Unexpected E2E mock error.",
    });
  }
});

function launch(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`[e2e] Could not start ${command}:`, error);
    shutdown(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[e2e] ${command} exited unexpectedly with code ${code ?? 1}.`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  mockServer.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

process.on("uncaughtException", (error) => {
  console.error("[e2e] Uncaught error:", error);
  shutdown(1);
});

await mkdir(runtimeDirectory, { recursive: true });
await new Promise((resolve, reject) => {
  mockServer.once("error", reject);
  mockServer.listen(mockPort, "127.0.0.1", resolve);
});

launch(
  "uv",
  ["run", "--project", "backend", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
  {
    LOCALGROWTH_API_HOST: "127.0.0.1",
    LOCALGROWTH_API_PORT: String(apiPort),
    LOCALGROWTH_DATA_DIR: runtimeDirectory,
    LOCALGROWTH_SCHEDULER_INTERVAL: "0.25",
    LOCALGROWTH_SLACK_SOCKET_MODE: "0",
    LOCALGROWTH_META_GRAPH_BASE_URL: `http://127.0.0.1:${mockPort}/meta`,
  },
);

await waitFor(`http://127.0.0.1:${apiPort}/api/health`);

launch(
  process.execPath,
  [
    path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "-H",
    "127.0.0.1",
    "-p",
    String(webPort),
    "--webpack",
  ],
  {
    LOCALGROWTH_API_URL: `http://127.0.0.1:${apiPort}`,
  },
);

console.log(`[e2e] LocalGrowth: http://127.0.0.1:${webPort}`);
console.log(`[e2e] External service mock: http://127.0.0.1:${mockPort}`);
