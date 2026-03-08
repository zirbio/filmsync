import type {
  TMDBMovie,
  TMDBTVShow,
  TMDBGenre,
  StreamingProviderKey,
  ClaudeRecommendation,
  StreamingTitle,
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

const BASE_URL = "https://api.themoviedb.org/3";
const WATCH_REGION = "ES";
const LANGUAGE = "es-ES";

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY not set in environment");
  return key;
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function searchMovie(
  title: string,
  year?: number
): Promise<TMDBMovie | null> {
  const params: Record<string, string> = { query: title };
  if (year) params.year = year.toString();

  const data = await tmdbFetch<{ results: TMDBMovie[] }>("/search/movie", params);
  return data.results[0] ?? null;
}

export async function searchTV(
  title: string,
  year?: number
): Promise<TMDBTVShow | null> {
  const params: Record<string, string> = { query: title };
  if (year) params.first_air_date_year = year.toString();

  const data = await tmdbFetch<{ results: TMDBTVShow[] }>("/search/tv", params);
  return data.results[0] ?? null;
}

export async function getMovieDetails(id: number): Promise<TMDBMovie> {
  return tmdbFetch<TMDBMovie>(`/movie/${id}`, {
    append_to_response: "credits,keywords",
  });
}

export async function getTVDetails(id: number): Promise<TMDBTVShow> {
  return tmdbFetch<TMDBTVShow>(`/tv/${id}`, {
    append_to_response: "credits,keywords",
  });
}

export async function getGenreList(): Promise<TMDBGenre[]> {
  const [movieGenres, tvGenres] = await Promise.all([
    tmdbFetch<{ genres: TMDBGenre[] }>("/genre/movie/list"),
    tmdbFetch<{ genres: TMDBGenre[] }>("/genre/tv/list"),
  ]);

  const genreMap = new Map<number, TMDBGenre>();
  for (const g of [...movieGenres.genres, ...tvGenres.genres]) {
    genreMap.set(g.id, g);
  }
  return Array.from(genreMap.values());
}

interface DiscoverResult {
  results: (TMDBMovie | TMDBTVShow)[];
  total_pages: number;
  page: number;
}

export async function discoverStreamingTitles(
  providers: StreamingProviderKey[],
  type: "movie" | "tv",
  options: {
    genreIds?: number[];
    minYear?: number;
    minRating?: number;
    page?: number;
  } = {}
): Promise<DiscoverResult> {
  const providerIds = providers.map((p) => STREAMING_PROVIDERS[p].id).join("|");

  const params: Record<string, string> = {
    watch_region: WATCH_REGION,
    with_watch_providers: providerIds,
    with_watch_monetization_types: "flatrate",
    sort_by: "vote_average.desc",
    "vote_count.gte": "50",
    page: (options.page ?? 1).toString(),
  };

  if (options.genreIds?.length) {
    params.with_genres = options.genreIds.join(",");
  }
  if (options.minYear) {
    const dateKey = type === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
    params[dateKey] = `${options.minYear}-01-01`;
  }
  if (options.minRating) {
    params["vote_average.gte"] = options.minRating.toString();
  }

  return tmdbFetch<DiscoverResult>(`/discover/${type}`, params);
}

export async function getWatchProviders(
  id: number,
  type: "movie" | "tv"
): Promise<StreamingProviderKey[]> {
  const data = await tmdbFetch<{
    results: Record<string, { flatrate?: { provider_id: number }[] }>;
  }>(`/${type}/${id}/watch/providers`);

  const esProviders = data.results?.ES?.flatrate ?? [];
  const providerIdToKey = new Map<number, StreamingProviderKey>();
  for (const [key, value] of Object.entries(STREAMING_PROVIDERS)) {
    providerIdToKey.set(value.id, key as StreamingProviderKey);
  }

  return esProviders
    .map((p) => providerIdToKey.get(p.provider_id))
    .filter((k): k is StreamingProviderKey => k !== undefined);
}

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function verifyRecommendation(
  rec: ClaudeRecommendation,
  type: "movie" | "tv",
  allowedProviders: StreamingProviderKey[]
): Promise<StreamingTitle | null> {
  // 1. Search TMDB
  const searchResult = type === "movie"
    ? await searchMovie(rec.title, rec.year)
    : await searchTV(rec.title, rec.year);

  if (!searchResult) return null;

  // 2. Check streaming availability in Spain
  const providers = await getWatchProviders(searchResult.id, type);
  const matchingProviders = providers.filter((p) => allowedProviders.includes(p));
  if (matchingProviders.length === 0) return null;

  // 3. Get full details
  const isMovie = type === "movie";
  let directors: string[] = [];
  let cast: string[] = [];
  let runtime: number | null = null;
  let genres: string[] = [];

  if (isMovie) {
    const details = await getMovieDetails(searchResult.id);
    directors = details.credits?.crew
      ?.filter((c) => c.job === "Director")
      .map((c) => c.name) ?? [];
    cast = details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [];
    runtime = details.runtime ?? null;
    genres = details.genres?.map((g) => g.name) ?? [];
  } else {
    const details = await getTVDetails(searchResult.id);
    directors = details.credits?.crew
      ?.filter((c) => c.job === "Executive Producer" || c.job === "Creator")
      .slice(0, 3)
      .map((c) => c.name) ?? [];
    cast = details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [];
    genres = details.genres?.map((g) => g.name) ?? [];
  }

  const title = "title" in searchResult ? searchResult.title : searchResult.name;
  const year = parseInt(
    ("release_date" in searchResult ? searchResult.release_date : searchResult.first_air_date)?.slice(0, 4) ?? "0",
    10
  );

  return {
    tmdbId: searchResult.id,
    type,
    title,
    overview: searchResult.overview ?? "",
    year,
    genres,
    directors,
    cast,
    tmdbRating: searchResult.vote_average ?? 0,
    posterPath: searchResult.poster_path,
    runtime,
    providers: matchingProviders,
  };
}
