import { NextResponse } from "next/server";
import { scrapeFilmAffinity } from "@/lib/fa-scraper";
import { searchMovie, searchTV } from "@/lib/tmdb";
import { readCache, writeCache } from "@/lib/cache";
import type { LastSync, SyncDiff, SyncItem, FilmAffinityRating } from "@/types";

async function resolveToTmdb(
  rating: FilmAffinityRating
): Promise<SyncItem> {
  const movie = await searchMovie(rating.title, rating.year);
  if (movie) {
    return {
      title: rating.title,
      year: rating.year,
      rating10: rating.rating10,
      tmdbId: movie.id,
      tmdbType: "movie",
      watchedDate: rating.watchedDate,
    };
  }

  const tv = await searchTV(rating.title, rating.year);
  if (tv) {
    return {
      title: rating.title,
      year: rating.year,
      rating10: rating.rating10,
      tmdbId: tv.id,
      tmdbType: "tv",
      watchedDate: rating.watchedDate,
    };
  }

  return {
    title: rating.title,
    year: rating.year,
    rating10: rating.rating10,
    tmdbId: null,
    tmdbType: null,
    watchedDate: rating.watchedDate,
  };
}

export async function POST() {
  try {
    const userId = process.env.FILMAFFINITY_USER_ID;
    if (!userId) {
      return NextResponse.json(
        { error: "FILMAFFINITY_USER_ID not set" },
        { status: 500 }
      );
    }

    const faRatings = await scrapeFilmAffinity(userId);
    const lastSync = await readCache<LastSync>("last_sync.json");
    const syncedSet = new Set(
      lastSync?.syncedTitles.map((t) => `${t.title}-${t.year}`) ?? []
    );

    const newRatings = faRatings.filter(
      (r) => !syncedSet.has(`${r.title}-${r.year}`)
    );

    const syncItems: SyncItem[] = [];
    for (const rating of newRatings) {
      const item = await resolveToTmdb(rating);
      syncItems.push(item);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await writeCache("pending_sync.json", syncItems);

    const diff: SyncDiff = {
      newRatings: syncItems,
      totalFA: faRatings.length,
      totalSynced: lastSync?.syncedTitles.length ?? 0,
    };

    return NextResponse.json(diff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
