import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";

export async function POST(request: NextRequest) {
  const { tmdbId, type } = await request.json();
  const key = `${tmdbId}-${type}`;

  const watched = (await readCache<string[]>("watched.json")) ?? [];
  if (!watched.includes(key)) {
    watched.push(key);
    await writeCache("watched.json", watched);
  }

  return NextResponse.json({ watched: watched.length });
}

export async function GET() {
  const watched = (await readCache<string[]>("watched.json")) ?? [];
  return NextResponse.json({ watched });
}
