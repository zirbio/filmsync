import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb";
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
