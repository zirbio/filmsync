import { NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import {
  syncRatings,
  syncHistory,
  getWatchlist,
  removeFromWatchlist,
} from "@/lib/trakt";
import { getMovieDetails, getTVDetails } from "@/lib/tmdb";
import type { SyncItem, LastSync, SyncResult, EnrichedRating } from "@/types";

export async function POST() {
  try {
    const pendingItems = await readCache<SyncItem[]>("pending_sync.json");
    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json(
        { error: "No pending sync items. Run POST /api/sync first." },
        { status: 400 }
      );
    }

    const itemsWithTmdb = pendingItems.filter((i) => i.tmdbId && i.tmdbType);

    // 1. Sync ratings to Trakt
    await syncRatings(itemsWithTmdb);

    // 2. Mark as watched in Trakt
    await syncHistory(itemsWithTmdb);

    // 3. Check watchlist and remove synced items
    const watchlist = await getWatchlist();
    const toRemove = itemsWithTmdb.filter((i) =>
      watchlist.some((w) => w.tmdbId === i.tmdbId)
    );
    if (toRemove.length > 0) {
      await removeFromWatchlist(toRemove);
    }

    // 4. Update last_sync.json
    const lastSync = await readCache<LastSync>("last_sync.json");
    const existingTitles = lastSync?.syncedTitles ?? [];
    const allSynced = [
      ...existingTitles,
      ...pendingItems.map((i) => ({ title: i.title, year: i.year })),
    ];
    await writeCache("last_sync.json", {
      syncedTitles: allSynced,
      lastSyncDate: new Date().toISOString(),
    });

    // 5. Update enriched_ratings.json with new items
    const existingEnriched =
      (await readCache<EnrichedRating[]>("enriched_ratings.json")) ?? [];
    const enrichedSet = new Set(
      existingEnriched.map((r) => `${r.title}-${r.year}`)
    );
    for (const item of itemsWithTmdb) {
      if (enrichedSet.has(`${item.title}-${item.year}`)) continue;
      if (!item.tmdbId || !item.tmdbType) continue;

      try {
        if (item.tmdbType === "movie") {
          const details = await getMovieDetails(item.tmdbId);
          existingEnriched.push({
            title: item.title,
            year: item.year,
            directors:
              details.credits?.crew?.find((c) => c.job === "Director")?.name ??
              "",
            watchedDate: item.watchedDate,
            rating: item.rating10 / 2,
            rating10: item.rating10,
            tmdbId: item.tmdbId,
            tmdbType: "movie",
            genres: details.genres?.map((g) => g.name) ?? [],
            overview: details.overview ?? "",
            posterPath: details.poster_path,
            tmdbRating: details.vote_average ?? null,
            cast:
              details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
            keywords:
              details.keywords?.keywords?.map((k) => k.name) ?? [],
            runtime: details.runtime ?? null,
          });
        } else {
          const details = await getTVDetails(item.tmdbId);
          existingEnriched.push({
            title: item.title,
            year: item.year,
            directors:
              details.credits?.crew?.find((c) => c.job === "Director")?.name ??
              "",
            watchedDate: item.watchedDate,
            rating: item.rating10 / 2,
            rating10: item.rating10,
            tmdbId: item.tmdbId,
            tmdbType: "tv",
            genres: details.genres?.map((g) => g.name) ?? [],
            overview: details.overview ?? "",
            posterPath: details.poster_path,
            tmdbRating: details.vote_average ?? null,
            cast:
              details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
            keywords:
              details.keywords?.results?.map((k) => k.name) ?? [],
            runtime: null,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        // Skip items that fail TMDB enrichment
      }
    }
    await writeCache("enriched_ratings.json", existingEnriched);

    // 6. Clear pending sync
    await writeCache("pending_sync.json", []);

    const result: SyncResult = {
      syncedCount: itemsWithTmdb.length,
      removedFromWatchlist: toRemove.length,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
