import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";
import type { TraktToken } from "@/types";

export async function GET() {
  const token = await readCache<TraktToken>("trakt_token.json");
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const expiresAt = (token.created_at + token.expires_in) * 1000;
  return NextResponse.json({
    connected: true,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}
