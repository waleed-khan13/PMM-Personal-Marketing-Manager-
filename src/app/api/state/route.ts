import { NextResponse } from "next/server";

import { readDatabase, toPublicState } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await readDatabase();
  return NextResponse.json(toPublicState(database), {
    headers: { "Cache-Control": "no-store" },
  });
}
