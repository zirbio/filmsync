import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb";
import { readCache, writeCache } from "@/lib/cache";
import type { EnrichedRating, FilmAffinityRating } from "@/types";

export async function enrichRating(rating: FilmAffinityRating): Promise<EnrichedRating> {
  const movieResult = await searchMovie(rating.title, rating.year);
  if (movieResult) {
    const details = await getMovieDetails(movieResult.id);
    return {
      ...rating,
      tmdbId: details.id,
      tmdbType: "movie",
      genres: details.genres?.map((g) => g.name) ?? [],
      overview: details.overview ?? "",
      posterPath: details.poster_path,
      tmdbRating: details.vote_average ?? null,
      cast: details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
      keywords: details.keywords?.keywords?.map((k) => k.name) ?? [],
      runtime: details.runtime ?? null,
    };
  }

  const tvResult = await searchTV(rating.title, rating.year);
  if (tvResult) {
    const details = await getTVDetails(tvResult.id);
    return {
      ...rating,
      tmdbId: details.id,
      tmdbType: "tv",
      genres: details.genres?.map((g) => g.name) ?? [],
      overview: details.overview ?? "",
      posterPath: details.poster_path,
      tmdbRating: details.vote_average ?? null,
      cast: details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
      keywords: details.keywords?.results?.map((k) => k.name) ?? [],
      runtime: null,
    };
  }

  return {
    ...rating,
    tmdbId: null,
    tmdbType: null,
    genres: [],
    overview: "",
    posterPath: null,
    tmdbRating: null,
    cast: [],
    keywords: [],
    runtime: null,
  };
}

/**
 * Enrich a batch of ratings, skipping already-enriched titles.
 * Saves checkpoint every 20 items and throttles 100ms between TMDB calls.
 * Returns { results, newlyEnriched, updated, notFound }.
 */
export async function enrichBatch(
  newRatings: FilmAffinityRating[]
): Promise<{ results: EnrichedRating[]; newlyEnriched: number; updated: number; notFound: number }> {
  const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
  const enrichedMap = new Map<string, EnrichedRating>(
    existing?.map((r) => [`${r.title}-${r.year}`, r]) ?? []
  );

  const toEnrich: FilmAffinityRating[] = [];
  let updated = 0;

  for (const rating of newRatings) {
    const key = `${rating.title}-${rating.year}`;
    const cached = enrichedMap.get(key);
    if (cached) {
      if (cached.rating10 !== rating.rating10 || cached.watchedDate !== rating.watchedDate) {
        enrichedMap.set(key, {
          ...cached,
          rating10: rating.rating10,
          rating: rating.rating,
          watchedDate: rating.watchedDate,
        });
        updated++;
      }
    } else {
      toEnrich.push(rating);
    }
  }

  const results: EnrichedRating[] = [...enrichedMap.values()];
  let processed = 0;

  for (const rating of toEnrich) {
    const enriched = await enrichRating(rating);
    results.push(enriched);
    processed++;

    if (processed % 20 === 0) {
      await writeCache("enriched_ratings.json", results);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await writeCache("enriched_ratings.json", results);

  return {
    results,
    newlyEnriched: processed,
    updated,
    notFound: results.filter((r) => r.tmdbId === null).length,
  };
}
