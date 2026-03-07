import { readCache, writeCache } from "@/lib/cache";
import type { TraktToken, SyncItem } from "@/types";

const API_BASE = "https://api.trakt.tv";
const AUTH_BASE = "https://trakt.tv";

function getClientId(): string {
  const id = process.env.TRAKT_CLIENT_ID;
  if (!id) throw new Error("TRAKT_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.TRAKT_CLIENT_SECRET;
  if (!secret) throw new Error("TRAKT_CLIENT_SECRET not set");
  return secret;
}

function getRedirectUri(): string {
  return process.env.TRAKT_REDIRECT_URI ?? "http://localhost:3000/api/trakt/callback";
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": getClientId(),
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// --- Auth ---

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
  });
  return `${AUTH_BASE}/oauth/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<TraktToken> {
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Trakt token exchange failed: ${res.status}`);
  const token = (await res.json()) as TraktToken;
  await writeCache("trakt_token.json", token);
  return token;
}

export async function refreshToken(token: TraktToken): Promise<TraktToken> {
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: token.refresh_token,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Trakt token refresh failed: ${res.status}`);
  const newToken = (await res.json()) as TraktToken;
  await writeCache("trakt_token.json", newToken);
  return newToken;
}

export async function getValidToken(): Promise<string> {
  const token = await readCache<TraktToken>("trakt_token.json");
  if (!token) throw new Error("Not authenticated with Trakt. Connect first.");

  const expiresAt = (token.created_at + token.expires_in) * 1000;
  if (Date.now() < expiresAt - 86_400_000) {
    return token.access_token;
  }

  const refreshed = await refreshToken(token);
  return refreshed.access_token;
}

// --- Body builders (pure, testable) ---

interface TraktSyncRatingsBody {
  movies: { rating: number; ids: { tmdb: number } }[];
  shows: { rating: number; ids: { tmdb: number } }[];
}

interface TraktSyncHistoryBody {
  movies: { watched_at: string; ids: { tmdb: number } }[];
  shows: { watched_at: string; ids: { tmdb: number } }[];
}

interface TraktSyncRemoveBody {
  movies: { ids: { tmdb: number } }[];
  shows: { ids: { tmdb: number } }[];
}

export function buildSyncRatingsBody(items: SyncItem[]): TraktSyncRatingsBody {
  const movies: TraktSyncRatingsBody["movies"] = [];
  const shows: TraktSyncRatingsBody["shows"] = [];

  for (const item of items) {
    if (!item.tmdbId || !item.tmdbType) continue;
    const entry = { rating: item.rating10, ids: { tmdb: item.tmdbId } };
    if (item.tmdbType === "movie") movies.push(entry);
    else shows.push(entry);
  }

  return { movies, shows };
}

export function buildSyncHistoryBody(items: SyncItem[]): TraktSyncHistoryBody {
  const movies: TraktSyncHistoryBody["movies"] = [];
  const shows: TraktSyncHistoryBody["shows"] = [];

  for (const item of items) {
    if (!item.tmdbId || !item.tmdbType) continue;
    const watched_at = item.watchedDate
      ? `${item.watchedDate}T00:00:00.000Z`
      : new Date().toISOString();
    const entry = { watched_at, ids: { tmdb: item.tmdbId } };
    if (item.tmdbType === "movie") movies.push(entry);
    else shows.push(entry);
  }

  return { movies, shows };
}

export function buildWatchlistRemoveBody(items: SyncItem[]): TraktSyncRemoveBody {
  const movies: TraktSyncRemoveBody["movies"] = [];
  const shows: TraktSyncRemoveBody["shows"] = [];

  for (const item of items) {
    if (!item.tmdbId || !item.tmdbType) continue;
    const entry = { ids: { tmdb: item.tmdbId } };
    if (item.tmdbType === "movie") movies.push(entry);
    else shows.push(entry);
  }

  return { movies, shows };
}

// --- API calls ---

async function traktFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method ?? "GET",
    headers: headers(token),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trakt API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function syncRatings(items: SyncItem[]): Promise<void> {
  const batches = chunk(items, 100);
  for (const batch of batches) {
    const body = buildSyncRatingsBody(batch);
    await traktFetch("/sync/ratings", { method: "POST", body });
  }
}

export async function syncHistory(items: SyncItem[]): Promise<void> {
  const batches = chunk(items, 100);
  for (const batch of batches) {
    const body = buildSyncHistoryBody(batch);
    await traktFetch("/sync/history", { method: "POST", body });
  }
}

interface TraktWatchlistResponse {
  movie?: { title: string; year: number; ids: { tmdb: number } };
  show?: { title: string; year: number; ids: { tmdb: number } };
}

export async function getWatchlist(): Promise<
  { title: string; year: number; tmdbId: number; type: "movie" | "tv" }[]
> {
  const [movies, shows] = await Promise.all([
    traktFetch<TraktWatchlistResponse[]>("/users/me/watchlist/movies"),
    traktFetch<TraktWatchlistResponse[]>("/users/me/watchlist/shows"),
  ]);

  const result: { title: string; year: number; tmdbId: number; type: "movie" | "tv" }[] = [];

  for (const item of movies) {
    if (item.movie) {
      result.push({
        title: item.movie.title,
        year: item.movie.year,
        tmdbId: item.movie.ids.tmdb,
        type: "movie",
      });
    }
  }

  for (const item of shows) {
    if (item.show) {
      result.push({
        title: item.show.title,
        year: item.show.year,
        tmdbId: item.show.ids.tmdb,
        type: "tv",
      });
    }
  }

  return result;
}

export async function removeFromWatchlist(items: SyncItem[]): Promise<void> {
  const body = buildWatchlistRemoveBody(items);
  await traktFetch("/sync/watchlist/remove", { method: "POST", body });
}

// --- Helpers ---

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
