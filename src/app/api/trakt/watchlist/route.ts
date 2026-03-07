import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/trakt";
import { getWatchProviders, getMovieDetails, getTVDetails } from "@/lib/tmdb";
import { writeCache } from "@/lib/cache";
import type { TraktWatchlistItem } from "@/types";

export async function GET() {
  try {
    const rawWatchlist = await getWatchlist();

    const enriched: TraktWatchlistItem[] = [];
    for (const item of rawWatchlist) {
      try {
        const providers = await getWatchProviders(item.tmdbId, item.type);
        let genres: string[] = [];
        let tmdbRating: number | null = null;
        let posterPath: string | null = null;

        if (item.type === "movie") {
          const details = await getMovieDetails(item.tmdbId);
          genres = details.genres?.map((g) => g.name) ?? [];
          tmdbRating = details.vote_average ?? null;
          posterPath = details.poster_path;
        } else {
          const details = await getTVDetails(item.tmdbId);
          genres = details.genres?.map((g) => g.name) ?? [];
          tmdbRating = details.vote_average ?? null;
          posterPath = details.poster_path;
        }

        enriched.push({
          title: item.title,
          year: item.year,
          tmdbId: item.tmdbId,
          type: item.type,
          posterPath,
          genres,
          tmdbRating,
          providers,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        enriched.push({
          title: item.title,
          year: item.year,
          tmdbId: item.tmdbId,
          type: item.type,
          posterPath: null,
          genres: [],
          tmdbRating: null,
          providers: [],
        });
      }
    }

    await writeCache("watchlist.json", enriched);

    const available = enriched.filter((i) => i.providers.length > 0);
    const unavailable = enriched.filter((i) => i.providers.length === 0);

    return NextResponse.json({
      total: enriched.length,
      available,
      unavailable,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
