import { NextResponse } from "next/server";

import { testProvider } from "@/server/provider";
import { decryptSecret, readDatabase } from "@/server/store";

export async function POST() {
  const database = await readDatabase();
  const result = await testProvider({
    kind: database.provider.kind,
    baseUrl: database.provider.baseUrl,
    model: database.provider.model,
    apiKey: await decryptSecret(database.provider.apiKey),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
