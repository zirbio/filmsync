# FA-Trakt Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sync FilmAffinity ratings to Trakt and show watchlist streaming availability.

**Architecture:** Python `fa-scraper` CLI executed as child process from Next.js API routes. Trakt OAuth2 for auth. File-based cache for tokens and sync state. New `/sync` page with two-phase sync flow (scrape+diff, then confirm+push).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, fa-scraper (Python CLI via pipx), Trakt API v2, TMDB API.

---

## Trakt API Reference

- **Base URL:** `https://api.trakt.tv`
- **Auth URL:** `https://trakt.tv/oauth/authorize`
- **Token URL:** `https://api.trakt.tv/oauth/token`
- **Required headers for all API calls:**
  ```
  Content-Type: application/json
  trakt-api-version: 2
  trakt-api-key: <TRAKT_CLIENT_ID>
  Authorization: Bearer <access_token>  (for authenticated endpoints)
  ```
- **Rate limit:** 1000 calls per 5 minutes. Batch endpoints accept up to 100 items per request.
- **IDs:** Items can be identified by `ids: { tmdb: <number> }` in request bodies.

### Key Endpoints

**POST /oauth/token** (exchange code for token):
```json
{
  "code": "<auth_code>",
  "client_id": "<client_id>",
  "client_secret": "<client_secret>",
  "redirect_uri": "http://localhost:3000/api/trakt/callback",
  "grant_type": "authorization_code"
}
```
Response: `{ "access_token", "token_type", "expires_in", "refresh_token", "scope", "created_at" }`

**POST /sync/ratings** (add ratings):
```json
{
  "movies": [
    { "rating": 8, "ids": { "tmdb": 272 } }
  ],
  "shows": [
    { "rating": 9, "ids": { "tmdb": 1399 } }
  ]
}
```

**POST /sync/history** (mark as watched):
```json
{
  "movies": [
    { "watched_at": "2026-01-15T00:00:00.000Z", "ids": { "tmdb": 272 } }
  ],
  "shows": [
    { "watched_at": "2026-01-15T00:00:00.000Z", "ids": { "tmdb": 1399 } }
  ]
}
```

**GET /users/me/watchlist/movies** and **GET /users/me/watchlist/shows**:
Response array of `{ movie: { title, year, ids: { tmdb, imdb, ... } } }` or `{ show: { ... } }`

**POST /sync/watchlist/remove**:
```json
{
  "movies": [{ "ids": { "tmdb": 272 } }],
  "shows": [{ "ids": { "tmdb": 1399 } }]
}
```

---

## Task 1: Add Trakt types to `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add new types at the end of the file**

```typescript
// --- Trakt Sync Types ---

export interface TraktToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface SyncItem {
  title: string;
  year: number;
  rating10: number;
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
  watchedDate: string;
}

export interface SyncDiff {
  newRatings: SyncItem[];
  totalFA: number;
  totalSynced: number;
}

export interface SyncResult {
  syncedCount: number;
  removedFromWatchlist: number;
}

export interface LastSync {
  syncedTitles: { title: string; year: number }[];
  lastSyncDate: string;
}

export interface TraktWatchlistItem {
  title: string;
  year: number;
  tmdbId: number;
  type: "movie" | "tv";
  posterPath: string | null;
  genres: string[];
  tmdbRating: number | null;
  providers: StreamingProviderKey[];
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Trakt sync type definitions"
```

---

## Task 2: Add environment variables

**Files:**
- Modify: `.env.local`
- Modify: `.gitignore` (verify `*.env*` or `.env.local` is ignored)

**Step 1: Add Trakt and FA env vars to `.env.local`**

Append to `.env.local`:
```
FILMAFFINITY_USER_ID=664084
TRAKT_CLIENT_ID=692024b5fcd2067896a4039a6e64012f9a370f6c5552c3cfc92381b8e79c1713
TRAKT_CLIENT_SECRET=6acd4e2a7e2b848a0578f591b62c9be77092c1c705750cb41996ca94f34f82da
TRAKT_REDIRECT_URI=http://localhost:3000/api/trakt/callback
```

**Step 2: Verify .gitignore includes .env.local**

Run: `grep -q ".env.local" .gitignore && echo "OK" || echo "MISSING"`
Expected: OK

**Step 3: No commit needed** (env files not tracked)

---

## Task 3: Create `src/lib/fa-scraper.ts` — wrapper for fa-scraper CLI

**Files:**
- Create: `src/lib/fa-scraper.ts`
- Create: `src/lib/__tests__/fa-scraper.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/fa-scraper.test.ts
import { describe, it, expect } from "vitest";
import { scrapeFilmAffinity } from "@/lib/fa-scraper";

describe("scrapeFilmAffinity", () => {
  it("scrapes ratings and returns parsed array", async () => {
    const ratings = await scrapeFilmAffinity("664084");
    expect(ratings.length).toBeGreaterThan(0);
    expect(ratings[0]).toHaveProperty("title");
    expect(ratings[0]).toHaveProperty("year");
    expect(ratings[0]).toHaveProperty("rating10");
    expect(ratings[0]).toHaveProperty("watchedDate");
  }, 120_000); // 2 min timeout for scraping
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/fa-scraper.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/lib/fa-scraper.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import type { FilmAffinityRating } from "@/types";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export async function scrapeFilmAffinity(
  userId: string
): Promise<FilmAffinityRating[]> {
  const outputPath = path.resolve(process.cwd(), "data/fa_scraped.csv");

  await execFileAsync("fa-scraper", [userId, "--csv", outputPath, "--lang", "en"], {
    timeout: 120_000,
  });

  const ratings = await parseFilmAffinityCSV(outputPath);

  await fs.unlink(outputPath).catch(() => {});

  return ratings;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/fa-scraper.test.ts`
Expected: PASS (takes ~30s for scraping)

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/lib/fa-scraper.ts src/lib/__tests__/fa-scraper.test.ts
git commit -m "feat(fa-scraper): add wrapper for fa-scraper Python CLI"
```

---

## Task 4: Create `src/lib/trakt.ts` — Trakt API client

**Files:**
- Create: `src/lib/trakt.ts`
- Create: `src/lib/__tests__/trakt.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/trakt.test.ts
import { describe, it, expect } from "vitest";
import { buildAuthUrl, buildSyncRatingsBody, buildSyncHistoryBody, buildWatchlistRemoveBody } from "@/lib/trakt";

describe("trakt utilities", () => {
  it("builds correct OAuth authorize URL", () => {
    const url = buildAuthUrl();
    expect(url).toContain("https://trakt.tv/oauth/authorize");
    expect(url).toContain("client_id=");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("response_type=code");
  });

  it("builds sync ratings body with TMDB IDs", () => {
    const items = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie" as const, watchedDate: "2024-01-01" },
      { title: "Show", year: 2024, rating10: 9, tmdbId: 456, tmdbType: "tv" as const, watchedDate: "2024-02-01" },
    ];
    const body = buildSyncRatingsBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].rating).toBe(8);
    expect(body.movies[0].ids.tmdb).toBe(123);
    expect(body.shows).toHaveLength(1);
    expect(body.shows[0].rating).toBe(9);
    expect(body.shows[0].ids.tmdb).toBe(456);
  });

  it("builds sync history body with watched dates", () => {
    const items = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie" as const, watchedDate: "2024-01-15" },
    ];
    const body = buildSyncHistoryBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].ids.tmdb).toBe(123);
    expect(body.movies[0].watched_at).toContain("2024-01-15");
  });

  it("builds watchlist remove body", () => {
    const items = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie" as const, watchedDate: "2024-01-01" },
    ];
    const body = buildWatchlistRemoveBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].ids.tmdb).toBe(123);
  });

  it("skips items without tmdbId", () => {
    const items = [
      { title: "Unknown", year: 2024, rating10: 7, tmdbId: null, tmdbType: null, watchedDate: "2024-01-01" },
    ];
    const body = buildSyncRatingsBody(items);
    expect(body.movies).toHaveLength(0);
    expect(body.shows).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/trakt.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/lib/trakt.ts
import { readCache, writeCache } from "@/lib/cache";
import type { TraktToken, SyncItem, TraktWatchlistItem } from "@/types";

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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/trakt.test.ts`
Expected: PASS

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/lib/trakt.ts src/lib/__tests__/trakt.test.ts
git commit -m "feat(trakt): add Trakt API client with auth, sync, and watchlist"
```

---

## Task 5: Create Trakt OAuth routes

**Files:**
- Create: `src/app/api/trakt/auth/route.ts`
- Create: `src/app/api/trakt/callback/route.ts`
- Create: `src/app/api/trakt/status/route.ts`

**Step 1: Create auth route (redirect to Trakt)**

```typescript
// src/app/api/trakt/auth/route.ts
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/trakt";

export async function GET() {
  const url = buildAuthUrl();
  return NextResponse.redirect(url);
}
```

**Step 2: Create callback route (exchange code for token)**

```typescript
// src/app/api/trakt/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/trakt";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL("/sync", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Create status route (check if connected)**

```typescript
// src/app/api/trakt/status/route.ts
import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";
import type { TraktToken } from "@/types";

export async function GET() {
  const token = await readCache<TraktToken>("trakt_token.json");
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const expiresAt = (token.created_at + token.expires_in) * 1000;
  return NextResponse.json({
    connected: true,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add src/app/api/trakt/
git commit -m "feat(trakt): add OAuth auth, callback, and status routes"
```

---

## Task 6: Create sync API routes

**Files:**
- Create: `src/app/api/sync/route.ts`
- Create: `src/app/api/sync/confirm/route.ts`

**Step 1: Create Phase 1 route — scrape + diff**

```typescript
// src/app/api/sync/route.ts
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
      // Rate limit: 100ms between TMDB calls
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Cache the diff for the confirm step
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
```

**Step 2: Create Phase 2 route — confirm + push to Trakt**

```typescript
// src/app/api/sync/confirm/route.ts
import { NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import {
  syncRatings,
  syncHistory,
  getWatchlist,
  removeFromWatchlist,
} from "@/lib/trakt";
import type { SyncItem, LastSync, SyncResult, EnrichedRating } from "@/types";
import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb";

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
    const syncedTmdbIds = new Set(itemsWithTmdb.map((i) => i.tmdbId));
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
    const existingEnriched = await readCache<EnrichedRating[]>("enriched_ratings.json") ?? [];
    const enrichedSet = new Set(existingEnriched.map((r) => `${r.title}-${r.year}`));
    for (const item of itemsWithTmdb) {
      if (enrichedSet.has(`${item.title}-${item.year}`)) continue;
      if (!item.tmdbId || !item.tmdbType) continue;

      try {
        if (item.tmdbType === "movie") {
          const details = await getMovieDetails(item.tmdbId);
          existingEnriched.push({
            title: item.title,
            year: item.year,
            directors: details.credits?.crew?.find((c) => c.job === "Director")?.name ?? "",
            watchedDate: item.watchedDate,
            rating: item.rating10 / 2,
            rating10: item.rating10,
            tmdbId: item.tmdbId,
            tmdbType: "movie",
            genres: details.genres?.map((g) => g.name) ?? [],
            overview: details.overview ?? "",
            posterPath: details.poster_path,
            tmdbRating: details.vote_average ?? null,
            cast: details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
            keywords: details.keywords?.keywords?.map((k) => k.name) ?? [],
            runtime: details.runtime ?? null,
          });
        } else {
          const details = await getTVDetails(item.tmdbId);
          existingEnriched.push({
            title: item.title,
            year: item.year,
            directors: details.credits?.crew?.find((c) => c.job === "Director")?.name ?? "",
            watchedDate: item.watchedDate,
            rating: item.rating10 / 2,
            rating10: item.rating10,
            tmdbId: item.tmdbId,
            tmdbType: "tv",
            genres: details.genres?.map((g) => g.name) ?? [],
            overview: details.overview ?? "",
            posterPath: details.poster_path,
            tmdbRating: details.vote_average ?? null,
            cast: details.credits?.cast?.slice(0, 5).map((c) => c.name) ?? [],
            keywords: details.keywords?.results?.map((k) => k.name) ?? [],
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
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/app/api/sync/
git commit -m "feat(sync): add scrape+diff and confirm+push API routes"
```

---

## Task 7: Create watchlist API route with streaming availability

**Files:**
- Create: `src/app/api/trakt/watchlist/route.ts`

**Step 1: Create watchlist route**

```typescript
// src/app/api/trakt/watchlist/route.ts
import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/trakt";
import { getWatchProviders, getMovieDetails, getTVDetails, posterUrl } from "@/lib/tmdb";
import { writeCache, readCache } from "@/lib/cache";
import type { TraktWatchlistItem } from "@/types";

export async function GET() {
  try {
    const rawWatchlist = await getWatchlist();

    const enriched: TraktWatchlistItem[] = [];
    for (const item of rawWatchlist) {
      try {
        const providers = await getWatchProviders(item.tmdbId, item.type);
        let genres: string[] = [];
        let tmdbRating: number | null = null;
        let posterPath: string | null = null;

        if (item.type === "movie") {
          const details = await getMovieDetails(item.tmdbId);
          genres = details.genres?.map((g) => g.name) ?? [];
          tmdbRating = details.vote_average ?? null;
          posterPath = details.poster_path;
        } else {
          const details = await getTVDetails(item.tmdbId);
          genres = details.genres?.map((g) => g.name) ?? [];
          tmdbRating = details.vote_average ?? null;
          posterPath = details.poster_path;
        }

        enriched.push({
          title: item.title,
          year: item.year,
          tmdbId: item.tmdbId,
          type: item.type,
          posterPath,
          genres,
          tmdbRating,
          providers,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        enriched.push({
          title: item.title,
          year: item.year,
          tmdbId: item.tmdbId,
          type: item.type,
          posterPath: null,
          genres: [],
          tmdbRating: null,
          providers: [],
        });
      }
    }

    await writeCache("watchlist.json", enriched);

    const available = enriched.filter((i) => i.providers.length > 0);
    const unavailable = enriched.filter((i) => i.providers.length === 0);

    return NextResponse.json({
      total: enriched.length,
      available,
      unavailable,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add src/app/api/trakt/watchlist/route.ts
git commit -m "feat(watchlist): add Trakt watchlist route with streaming availability"
```

---

## Task 8: Add watchlist badge to RecommendationCard

**Files:**
- Modify: `src/components/RecommendationCard.tsx`

**Step 1: Add `inWatchlist` prop and badge**

Add a new optional prop `inWatchlist?: boolean` to `RecommendationCardProps`.

In the JSX, after the streaming providers section (line ~87), add:

```tsx
{inWatchlist && (
  <span className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
    En tu watchlist
  </span>
)}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add src/components/RecommendationCard.tsx
git commit -m "feat(ui): add watchlist badge to RecommendationCard"
```

---

## Task 9: Create `/sync` page

**Files:**
- Create: `src/app/sync/page.tsx`

**Step 1: Create the sync page**

This is a client component with the following sections:
1. **Connection status** — shows if connected to Trakt, with connect button
2. **Sync section** — Sync button, spinner during scraping, diff table with checkboxes, confirm button
3. **Watchlist section** — available/unavailable lists with streaming providers

The page uses `useState` for UI state and `fetch()` to call our API routes:
- `GET /api/trakt/status` — check connection
- `GET /api/trakt/auth` — redirect to OAuth (via window.location)
- `POST /api/sync` — phase 1
- `POST /api/sync/confirm` — phase 2
- `GET /api/trakt/watchlist` — load watchlist

States: `idle` | `scraping` | `diff-ready` | `confirming` | `done` | `error`

The full implementation should follow the UI mockup from the design doc (see `docs/plans/2026-03-07-fa-trakt-sync-design.md`, section "Pagina /sync — UI").

Use Tailwind CSS classes consistent with existing components (dark mode support, rounded-xl cards, same color palette).

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Manual test**

Run: `npm run dev`
Navigate to: `http://localhost:3000/sync`
Expected: Page renders with "Connect with Trakt" button (since not authenticated yet)

**Step 4: Commit**

```bash
git add src/app/sync/page.tsx
git commit -m "feat(ui): add /sync page for FA-Trakt synchronization"
```

---

## Task 10: Integration test — full flow

**Step 1: Verify fa-scraper works**

Run: `fa-scraper 664084 --csv /tmp/fa_verify.csv --lang en 2>&1 && head -3 /tmp/fa_verify.csv`
Expected: CSV with headers `Title,Year,Directors,WatchedDate,Rating,Rating10`

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with 0 errors

**Step 4: Run lint**

Run: `npm run lint`
Expected: 0 errors

**Step 5: Manual E2E test**

1. `npm run dev`
2. Go to `/sync`
3. Click "Connect with Trakt" → complete OAuth flow
4. Click "Sync" → should scrape FA and show diff
5. Click "Confirm" → should push to Trakt
6. Verify watchlist section loads

**Step 6: Final commit if any fixes needed**

---

## Summary of commits

| # | Message | Files |
|---|---------|-------|
| 1 | `feat(types): add Trakt sync type definitions` | `src/types/index.ts` |
| 2 | (env vars — not committed) | `.env.local` |
| 3 | `feat(fa-scraper): add wrapper for fa-scraper Python CLI` | `src/lib/fa-scraper.ts`, test |
| 4 | `feat(trakt): add Trakt API client with auth, sync, and watchlist` | `src/lib/trakt.ts`, test |
| 5 | `feat(trakt): add OAuth auth, callback, and status routes` | `src/app/api/trakt/*` |
| 6 | `feat(sync): add scrape+diff and confirm+push API routes` | `src/app/api/sync/*` |
| 7 | `feat(watchlist): add Trakt watchlist route with streaming availability` | `src/app/api/trakt/watchlist/` |
| 8 | `feat(ui): add watchlist badge to RecommendationCard` | `src/components/RecommendationCard.tsx` |
| 9 | `feat(ui): add /sync page for FA-Trakt synchronization` | `src/app/sync/page.tsx` |
| 10 | Integration verification | (fixes if needed) |
