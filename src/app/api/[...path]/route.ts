import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const configuredBase = process.env.LOCALGROWTH_API_URL || "http://127.0.0.1:8000";
  const baseUrl = new URL(configuredBase);
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path.map(encodeURIComponent).join("/")}${sourceUrl.search}`, baseUrl);
  const headers = new Headers(request.headers);

  for (const header of ["connection", "content-length", "host", "transfer-encoding"]) {
    headers.delete(header);
  }
  headers.set("x-localgrowth-proxy", "nextjs");

  try {
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(130_000),
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const header of ["content-encoding", "content-length", "transfer-encoding"]) {
      responseHeaders.delete(header);
    }
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "The local FastAPI service is unavailable. Restart LocalGrowth OS and try again.",
      },
      { status: 503 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
