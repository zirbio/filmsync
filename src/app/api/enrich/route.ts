import { NextResponse } from "next/server";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb";
import { readCache, writeCache } from "@/lib/cache";
import type { EnrichedRating, FilmAffinityRating } from "@/types";
import path from "path";

async function enrichRating(rating: FilmAffinityRating): Promise<EnrichedRating> {
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

export async function POST() {
  try {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");
    const ratings = await parseFilmAffinityCSV(csvPath);

    const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const enrichedTitles = new Set(existing?.map((r) => `${r.title}-${r.year}`) ?? []);

    const toEnrich = ratings.filter(
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

    return NextResponse.json({
      total: results.length,
      newlyEnriched: processed,
      notFound: results.filter((r) => r.tmdbId === null).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const data = await readCache<EnrichedRating[]>("enriched_ratings.json");
  if (!data) {
    return NextResponse.json(
      { error: "No enriched data. Run POST /api/enrich first." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    total: data.length,
    notFound: data.filter((r) => r.tmdbId === null).length,
    sample: data.slice(0, 3),
  });
}
