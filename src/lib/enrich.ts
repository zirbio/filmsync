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
 * Returns { results, newlyEnriched, notFound }.
 */
export async function enrichBatch(
  newRatings: FilmAffinityRating[]
): Promise<{ results: EnrichedRating[]; newlyEnriched: number; notFound: number }> {
  const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
  const enrichedTitles = new Set(
    existing?.map((r) => `${r.title}-${r.year}`) ?? []
  );

  const toEnrich = newRatings.filter(
    (r) => !enrichedTitles.has(`${r.title}-${r.year}`)
  );

  const results: EnrichedRating[] = existing ?? [];
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
    notFound: results.filter((r) => r.tmdbId === null).length,
  };
}
