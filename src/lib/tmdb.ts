import type {
  TMDBMovie,
  TMDBTVShow,
  TMDBGenre,
  StreamingProviderKey,
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
