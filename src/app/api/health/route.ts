import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "localgrowth-web",
    version: "0.2.0",
    mode: process.env.DEPLOYMENT_MODE ?? "local_trusted",
  });
}
