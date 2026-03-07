import { NextRequest, NextResponse } from "next/server";
import {
  discoverStreamingTitles,
  getMovieDetails,
  getTVDetails,
  getWatchProviders,
  getGenreList,
} from "@/lib/tmdb";
import { readCache, writeCache } from "@/lib/cache";
import type {
  StreamingTitle,
  StreamingProviderKey,
  TMDBMovie,
  TMDBTVShow,
  EnrichedRating,
} from "@/types";

function isMovie(item: TMDBMovie | TMDBTVShow): item is TMDBMovie {
  return "title" in item;
}

async function buildStreamingTitle(
  item: TMDBMovie | TMDBTVShow,
  type: "movie" | "tv",
  genreMap: Map<number, string>,
  providers: StreamingProviderKey[]
): Promise<StreamingTitle> {
  const title = isMovie(item) ? item.title : item.name;
  const year = parseInt(
    (isMovie(item) ? item.release_date : item.first_air_date)?.slice(0, 4) ?? "0",
    10
  );

  return {
    tmdbId: item.id,
    type,
    title,
    overview: item.overview ?? "",
    year,
    genres: (item.genre_ids ?? []).map((id) => genreMap.get(id) ?? "Unknown"),
    directors: [],
    cast: [],
    tmdbRating: item.vote_average ?? 0,
    posterPath: item.poster_path,
    runtime: isMovie(item) ? (item as TMDBMovie).runtime ?? null : null,
    providers,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const selectedProviders: StreamingProviderKey[] = body.providers ?? [
      "netflix",
      "hbo",
      "prime",
      "disney",
      "apple",
    ];
    const type: "movie" | "tv" | "all" = body.type ?? "all";
    const minYear: number | undefined = body.minYear;
    const minRating: number | undefined = body.minRating;
    const genreIds: number[] | undefined = body.genreIds;

    const genres = await getGenreList();
    const genreMap = new Map(genres.map((g) => [g.id, g.name]));

    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const watchedTmdbIds = new Set(
      enriched?.filter((r) => r.tmdbId).map((r) => r.tmdbId) ?? []
    );

    const allTitles: StreamingTitle[] = [];
    const types: ("movie" | "tv")[] =
      type === "all" ? ["movie", "tv"] : [type];

    for (const mediaType of types) {
      for (let page = 1; page <= 3; page++) {
        const result = await discoverStreamingTitles(
          selectedProviders,
          mediaType,
          { genreIds, minYear, minRating, page }
        );

        for (const item of result.results) {
          if (watchedTmdbIds.has(item.id)) continue;

          const providers = await getWatchProviders(item.id, mediaType);
          if (providers.length === 0) continue;

          const title = await buildStreamingTitle(
            item,
            mediaType,
            genreMap,
            providers
          );
          allTitles.push(title);

          await new Promise((resolve) => setTimeout(resolve, 80));
        }

        if (page >= result.total_pages) break;
      }
    }

    for (const title of allTitles.slice(0, 100)) {
      try {
        if (title.type === "movie") {
          const details = await getMovieDetails(title.tmdbId);
          title.directors =
            details.credits?.crew
              ?.filter((c) => c.job === "Director")
              .map((c) => c.name) ?? [];
          title.cast =
            details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [];
          title.runtime = details.runtime ?? null;
        } else {
          const details = await getTVDetails(title.tmdbId);
          title.directors =
            details.credits?.crew
              ?.filter(
                (c) =>
                  c.job === "Executive Producer" || c.job === "Creator"
              )
              .slice(0, 3)
              .map((c) => c.name) ?? [];
          title.cast =
            details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [];
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
      } catch {
        // Skip enrichment errors for individual titles
      }
    }

    await writeCache("streaming_catalog.json", allTitles);

    return NextResponse.json({
      total: allTitles.length,
      movies: allTitles.filter((t) => t.type === "movie").length,
      tvShows: allTitles.filter((t) => t.type === "tv").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const catalog = await readCache<StreamingTitle[]>("streaming_catalog.json");
  if (!catalog) {
    return NextResponse.json(
      { error: "No streaming catalog. Run POST /api/streaming first." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    total: catalog.length,
    movies: catalog.filter((t) => t.type === "movie").length,
    tvShows: catalog.filter((t) => t.type === "tv").length,
    titles: catalog,
  });
}
