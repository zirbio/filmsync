import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";

interface WatchedItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  year: number;
  posterPath: string | null;
  genres: string[];
  directors: string;
  tmdbRating: number | null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tmdbId, type, action = "add" } = body;
  const key = `${tmdbId}-${type}`;

  const watched = (await readCache<WatchedItem[]>("watched.json")) ?? [];

  if (action === "remove") {
    const filtered = watched.filter(
      (item) => `${item.tmdbId}-${item.type}` !== key
    );
    await writeCache("watched.json", filtered);
    return NextResponse.json({ watched: filtered.length });
  }

  const exists = watched.some(
    (item) => `${item.tmdbId}-${item.type}` === key
  );
  if (!exists) {
    watched.push({
      tmdbId,
      type,
      title: body.title ?? "",
      year: body.year ?? 0,
      posterPath: body.posterPath ?? null,
      genres: body.genres ?? [],
      directors: body.directors ?? "",
      tmdbRating: body.tmdbRating ?? null,
    });
    await writeCache("watched.json", watched);
  }

  return NextResponse.json({ watched: watched.length });
}

export async function GET() {
  const watched = (await readCache<WatchedItem[]>("watched.json")) ?? [];
  return NextResponse.json({ watched });
}
