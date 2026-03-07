# Recomendador de Peliculas - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a movie/series recommendation web app that uses FilmAffinity ratings + Claude AI + TMDB streaming data to suggest personalized content available on Spanish streaming platforms.

**Architecture:** Next.js 15 fullstack app. CSV ratings are enriched via TMDB API (genres, synopsis, posters). Claude generates a taste profile from ratings, then recommends titles from the streaming catalog. All data cached as local JSON files.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, @anthropic-ai/sdk, papaparse (CSV), TMDB API v3

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `.env.local`, `.gitignore`, `data/` directory
- Move: `filmaffinity_ratings.csv` into `data/`

**Step 1: Initialize Next.js project**

Run:
```bash
cd /Users/silvio_requena/Code/recomendador-peliculas
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

When prompted, accept defaults. If it asks about overwriting, confirm yes.

**Step 2: Install dependencies**

Run:
```bash
npm install @anthropic-ai/sdk papaparse
npm install -D @types/papaparse
```

**Step 3: Create .env.local**

Create `.env.local` with placeholder keys:
```
TMDB_API_KEY=your_tmdb_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

**Step 4: Move CSV to data directory**

Run:
```bash
mkdir -p data
mv filmaffinity_ratings.csv data/
```

**Step 5: Update .gitignore**

Add to `.gitignore`:
```
# Data cache files
data/enriched_ratings.json
data/taste_profile.json
data/streaming_catalog.json
data/recommendations_cache.json
data/watched.json

# Keep CSV tracked
!data/filmaffinity_ratings.csv

# Env
.env.local
```

**Step 6: Initialize git and commit**

Run:
```bash
git init
git add -A
git commit -m "chore: scaffold Next.js project with dependencies"
```

---

### Task 2: TypeScript types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create all type definitions**

```typescript
// src/types/index.ts

export interface FilmAffinityRating {
  title: string;
  year: number;
  directors: string;
  watchedDate: string;
  rating: number;
  rating10: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  genres: TMDBGenre[];
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
  keywords?: { keywords: { id: number; name: string }[] };
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  genres: TMDBGenre[];
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  number_of_seasons: number;
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
  keywords?: { results: { id: number; name: string }[] };
}

export interface EnrichedRating extends FilmAffinityRating {
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
  genres: string[];
  overview: string;
  posterPath: string | null;
  tmdbRating: number | null;
  cast: string[];
  keywords: string[];
  runtime: number | null;
}

export interface TasteProfile {
  preferred_genres: string[];
  preferred_directors: string[];
  preferred_themes: string[];
  preferred_decades: string[];
  avoid_patterns: string[];
  taste_summary: string;
  generated_at: string;
}

export const STREAMING_PROVIDERS = {
  netflix: { id: 8, name: "Netflix", logo: "/logos/netflix.svg" },
  hbo: { id: 384, name: "Max (HBO)", logo: "/logos/hbo.svg" },
  prime: { id: 119, name: "Prime Video", logo: "/logos/prime.svg" },
  disney: { id: 337, name: "Disney+", logo: "/logos/disney.svg" },
  apple: { id: 350, name: "Apple TV+", logo: "/logos/apple.svg" },
} as const;

export type StreamingProviderKey = keyof typeof STREAMING_PROVIDERS;

export interface StreamingTitle {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  overview: string;
  year: number;
  genres: string[];
  directors: string[];
  cast: string[];
  tmdbRating: number;
  posterPath: string | null;
  runtime: number | null;
  providers: StreamingProviderKey[];
}

export interface Recommendation {
  title: StreamingTitle;
  reason: string;
  score: number;
}

export interface RecommendationFilters {
  providers: StreamingProviderKey[];
  type: "movie" | "tv" | "all";
  genres: string[];
  minYear: number | null;
  minRating: number | null;
  maxDuration: number | null;
}

export interface RecommendationCache {
  filters: RecommendationFilters;
  recommendations: Recommendation[];
  generated_at: string;
}
```

**Step 2: Commit**

Run:
```bash
git add src/types/index.ts
git commit -m "feat(types): add TypeScript type definitions"
```

---

### Task 3: CSV parser

**Files:**
- Create: `src/lib/csv-parser.ts`
- Test: `src/lib/__tests__/csv-parser.test.ts`

**Step 1: Install test runner**

Run:
```bash
npm install -D vitest @vitejs/plugin-react
```

Create `vitest.config.ts` at project root:
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 2: Write the failing test**

```typescript
// src/lib/__tests__/csv-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import path from "path";

describe("parseFilmAffinityCSV", () => {
  it("parses the CSV file and returns typed ratings", async () => {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");
    const ratings = await parseFilmAffinityCSV(csvPath);

    expect(ratings.length).toBeGreaterThan(0);
    expect(ratings[0]).toHaveProperty("title");
    expect(ratings[0]).toHaveProperty("year");
    expect(ratings[0]).toHaveProperty("directors");
    expect(ratings[0]).toHaveProperty("watchedDate");
    expect(ratings[0]).toHaveProperty("rating");
    expect(ratings[0]).toHaveProperty("rating10");
    expect(typeof ratings[0].year).toBe("number");
    expect(typeof ratings[0].rating).toBe("number");
    expect(typeof ratings[0].rating10).toBe("number");
  });

  it("correctly parses a known entry", async () => {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");
    const ratings = await parseFilmAffinityCSV(csvPath);
    const marty = ratings.find((r) => r.title === "Marty Supreme");

    expect(marty).toBeDefined();
    expect(marty!.year).toBe(2025);
    expect(marty!.directors).toBe("Joshua Safdie");
    expect(marty!.rating10).toBe(8);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/csv-parser.test.ts`
Expected: FAIL — module not found

**Step 4: Write implementation**

```typescript
// src/lib/csv-parser.ts
import Papa from "papaparse";
import fs from "fs/promises";
import type { FilmAffinityRating } from "@/types";

interface CSVRow {
  Title: string;
  Year: string;
  Directors: string;
  WatchedDate: string;
  Rating: string;
  Rating10: string;
}

export async function parseFilmAffinityCSV(
  filePath: string
): Promise<FilmAffinityRating[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const { data } = Papa.parse<CSVRow>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return data.map((row) => ({
    title: row.Title,
    year: parseInt(row.Year, 10),
    directors: row.Directors,
    watchedDate: row.WatchedDate,
    rating: parseFloat(row.Rating),
    rating10: parseInt(row.Rating10, 10),
  }));
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/csv-parser.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/csv-parser.ts src/lib/__tests__/csv-parser.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(csv-parser): add FilmAffinity CSV parser with tests"
```

---

### Task 4: Cache utility

**Files:**
- Create: `src/lib/cache.ts`
- Test: `src/lib/__tests__/cache.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readCache, writeCache } from "@/lib/cache";
import fs from "fs/promises";
import path from "path";

const TEST_CACHE_PATH = path.resolve(process.cwd(), "data/test_cache.json");

describe("cache", () => {
  afterEach(async () => {
    try {
      await fs.unlink(TEST_CACHE_PATH);
    } catch {}
  });

  it("returns null when cache file does not exist", async () => {
    const result = await readCache<{ foo: string }>("test_cache.json");
    expect(result).toBeNull();
  });

  it("writes and reads cache correctly", async () => {
    const data = { foo: "bar", count: 42 };
    await writeCache("test_cache.json", data);
    const result = await readCache<typeof data>("test_cache.json");
    expect(result).toEqual(data);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/cache.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/lib/cache.ts
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");

export async function readCache<T>(filename: string): Promise<T | null> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(filename: string, data: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/cache.ts src/lib/__tests__/cache.test.ts
git commit -m "feat(cache): add JSON file cache utility with tests"
```

---

### Task 5: TMDB client

**Files:**
- Create: `src/lib/tmdb.ts`

This task does NOT use TDD since it depends on external API calls. We'll test it manually.

**Step 1: Create TMDB client**

```typescript
// src/lib/tmdb.ts
import type {
  TMDBMovie,
  TMDBTVShow,
  TMDBGenre,
  StreamingProviderKey,
  StreamingTitle,
  STREAMING_PROVIDERS,
} from "@/types";

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
  const { STREAMING_PROVIDERS: SP } = await import("@/types");
  const providerIds = providers.map((p) => SP[p].id).join("|");

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
  const { STREAMING_PROVIDERS: SP } = await import("@/types");
  const data = await tmdbFetch<{
    results: Record<string, { flatrate?: { provider_id: number }[] }>;
  }>(`/${type}/${id}/watch/providers`);

  const esProviders = data.results?.ES?.flatrate ?? [];
  const providerIdToKey = new Map<number, StreamingProviderKey>();
  for (const [key, value] of Object.entries(SP)) {
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
```

**Step 2: Commit**

```bash
git add src/lib/tmdb.ts
git commit -m "feat(tmdb): add TMDB API client"
```

---

### Task 6: Enrich API route

**Files:**
- Create: `src/app/api/enrich/route.ts`

This route reads the CSV, searches each title in TMDB, enriches it with metadata, and saves to `data/enriched_ratings.json`.

**Step 1: Create enrich route**

```typescript
// src/app/api/enrich/route.ts
import { NextResponse } from "next/server";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb";
import { readCache, writeCache } from "@/lib/cache";
import type { EnrichedRating, FilmAffinityRating } from "@/types";
import path from "path";

async function enrichRating(rating: FilmAffinityRating): Promise<EnrichedRating> {
  // Try movie first, then TV
  let movieResult = await searchMovie(rating.title, rating.year);
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

  // Not found in TMDB
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

    // Check for existing enriched data to resume from
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

      // Save progress every 20 items
      if (processed % 20 === 0) {
        await writeCache("enriched_ratings.json", results);
      }

      // Rate limiting: ~2 requests per title, TMDB allows 40/s
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
```

**Step 2: Commit**

```bash
git add src/app/api/enrich/route.ts
git commit -m "feat(enrich): add API route to enrich ratings with TMDB data"
```

---

### Task 7: Claude client — taste profile

**Files:**
- Create: `src/lib/claude.ts`

**Step 1: Create Claude client**

```typescript
// src/lib/claude.ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  EnrichedRating,
  TasteProfile,
  StreamingTitle,
  Recommendation,
} from "@/types";

function getClient(): Anthropic {
  return new Anthropic();
}

export async function generateTasteProfile(
  ratings: EnrichedRating[]
): Promise<TasteProfile> {
  const client = getClient();

  // Format ratings for the prompt, sorted by rating descending
  const sorted = [...ratings]
    .filter((r) => r.tmdbId !== null)
    .sort((a, b) => b.rating10 - a.rating10);

  const ratingsText = sorted
    .map(
      (r) =>
        `- "${r.title}" (${r.year}) — Nota: ${r.rating10}/10 — Generos: ${r.genres.join(", ") || "N/A"} — Director: ${r.directors} — Temas: ${r.keywords.slice(0, 5).join(", ") || "N/A"}`
    )
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Eres un experto en cine y series. Analiza las siguientes valoraciones de un usuario y genera un perfil detallado de sus gustos cinematograficos.

VALORACIONES DEL USUARIO (${sorted.length} titulos, ordenados de mayor a menor nota):

${ratingsText}

Genera un perfil de gustos en formato JSON con esta estructura exacta:
{
  "preferred_genres": ["lista de generos preferidos, ordenados por preferencia"],
  "preferred_directors": ["lista de directores favoritos basado en las notas altas"],
  "preferred_themes": ["temas y tematicas recurrentes en sus favoritos"],
  "preferred_decades": ["decadas preferidas"],
  "avoid_patterns": ["patrones que no le gustan, basado en notas bajas"],
  "taste_summary": "Un parrafo describiendo el perfil cinematografico del usuario, su estilo, lo que busca en una pelicula/serie, patrones interesantes"
}

Responde SOLO con el JSON, sin texto adicional.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const profile: TasteProfile = {
    ...JSON.parse(content.text),
    generated_at: new Date().toISOString(),
  };

  return profile;
}

export async function generateRecommendations(
  profile: TasteProfile,
  availableTitles: StreamingTitle[],
  watchedTitles: string[]
): Promise<Recommendation[]> {
  const client = getClient();

  const titlesText = availableTitles
    .map(
      (t, i) =>
        `${i + 1}. "${t.title}" (${t.year}) — ${t.type === "movie" ? "Pelicula" : "Serie"} — Generos: ${t.genres.join(", ")} — Director: ${t.directors.join(", ")} — TMDB: ${t.tmdbRating}/10 — Plataformas: ${t.providers.join(", ")} — Sinopsis: ${t.overview.slice(0, 150)}`
    )
    .join("\n");

  const watchedText =
    watchedTitles.length > 0
      ? `\nTITULOS YA VISTOS (NO recomendar estos):\n${watchedTitles.join(", ")}`
      : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Eres un experto en recomendaciones de cine y series. Basandote en el perfil de gustos de un usuario, recomienda las mejores peliculas y series de la lista disponible.

PERFIL DE GUSTOS DEL USUARIO:
${JSON.stringify(profile, null, 2)}
${watchedText}

TITULOS DISPONIBLES EN STREAMING:
${titlesText}

Selecciona los 20 titulos que MEJOR encajan con los gustos del usuario. Para cada uno, explica brevemente POR QUE le gustaria a este usuario en particular.

Responde en formato JSON con esta estructura exacta:
[
  {
    "index": 1,
    "score": 95,
    "reason": "Explicacion personalizada de por que le gustaria"
  }
]

Donde "index" es el numero del titulo en la lista (empezando en 1), "score" es tu confianza de 0-100 de que le gustara, y "reason" es la explicacion.

Ordena de mayor a menor score. Responde SOLO con el JSON.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const parsed: { index: number; score: number; reason: string }[] = JSON.parse(
    content.text
  );

  return parsed
    .map((item) => {
      const title = availableTitles[item.index - 1];
      if (!title) return null;
      return {
        title,
        reason: item.reason,
        score: item.score,
      };
    })
    .filter((r): r is Recommendation => r !== null);
}
```

**Step 2: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat(claude): add Claude API client for taste profile and recommendations"
```

---

### Task 8: Profile API route

**Files:**
- Create: `src/app/api/profile/route.ts`

**Step 1: Create profile route**

```typescript
// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import { generateTasteProfile } from "@/lib/claude";
import type { EnrichedRating, TasteProfile } from "@/types";

export async function POST() {
  try {
    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    if (!enriched) {
      return NextResponse.json(
        { error: "No enriched data. Run POST /api/enrich first." },
        { status: 400 }
      );
    }

    const profile = await generateTasteProfile(enriched);
    await writeCache("taste_profile.json", profile);

    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const profile = await readCache<TasteProfile>("taste_profile.json");
  if (!profile) {
    return NextResponse.json(
      { error: "No taste profile. Run POST /api/profile first." },
      { status: 404 }
    );
  }
  return NextResponse.json(profile);
}
```

**Step 2: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat(profile): add API route to generate taste profile"
```

---

### Task 9: Streaming catalog API route

**Files:**
- Create: `src/app/api/streaming/route.ts`

**Step 1: Create streaming route**

```typescript
// src/app/api/streaming/route.ts
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
  TMDBGenre,
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

    // Get genre map
    const genres = await getGenreList();
    const genreMap = new Map(genres.map((g) => [g.id, g.name]));

    // Load watched titles to exclude
    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const watchedTmdbIds = new Set(
      enriched?.filter((r) => r.tmdbId).map((r) => r.tmdbId) ?? []
    );

    const allTitles: StreamingTitle[] = [];
    const types: ("movie" | "tv")[] =
      type === "all" ? ["movie", "tv"] : [type];

    for (const mediaType of types) {
      // Fetch first 3 pages (~60 results per type)
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

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 80));
        }

        if (page >= result.total_pages) break;
      }
    }

    // Enrich top titles with director/cast info
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
```

**Step 2: Commit**

```bash
git add src/app/api/streaming/route.ts
git commit -m "feat(streaming): add API route to fetch streaming catalog from TMDB"
```

---

### Task 10: Recommendations API route

**Files:**
- Create: `src/app/api/recommendations/route.ts`

**Step 1: Create recommendations route**

```typescript
// src/app/api/recommendations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import { generateRecommendations } from "@/lib/claude";
import type {
  TasteProfile,
  StreamingTitle,
  Recommendation,
  RecommendationCache,
  RecommendationFilters,
} from "@/types";

export async function POST(request: NextRequest) {
  try {
    const filters: RecommendationFilters = await request.json();

    const profile = await readCache<TasteProfile>("taste_profile.json");
    if (!profile) {
      return NextResponse.json(
        { error: "No taste profile. Run POST /api/profile first." },
        { status: 400 }
      );
    }

    const catalog = await readCache<StreamingTitle[]>("streaming_catalog.json");
    if (!catalog || catalog.length === 0) {
      return NextResponse.json(
        { error: "No streaming catalog. Run POST /api/streaming first." },
        { status: 400 }
      );
    }

    // Load watched/dismissed titles
    const watched = await readCache<string[]>("watched.json") ?? [];

    // Apply client-side filters
    let filtered = catalog.filter((t) => {
      if (filters.type !== "all" && t.type !== filters.type) return false;
      if (
        filters.providers.length > 0 &&
        !t.providers.some((p) => filters.providers.includes(p))
      )
        return false;
      if (
        filters.genres.length > 0 &&
        !t.genres.some((g) =>
          filters.genres.some(
            (fg) => g.toLowerCase().includes(fg.toLowerCase())
          )
        )
      )
        return false;
      if (filters.minYear && t.year < filters.minYear) return false;
      if (filters.minRating && t.tmdbRating < filters.minRating) return false;
      if (
        filters.maxDuration &&
        t.type === "movie" &&
        t.runtime &&
        t.runtime > filters.maxDuration
      )
        return false;
      return true;
    });

    // Exclude watched titles
    filtered = filtered.filter(
      (t) => !watched.includes(`${t.tmdbId}-${t.type}`)
    );

    // Take top 100 by TMDB rating for the LLM
    filtered.sort((a, b) => b.tmdbRating - a.tmdbRating);
    const forLLM = filtered.slice(0, 100);

    if (forLLM.length === 0) {
      return NextResponse.json({
        recommendations: [],
        message: "No hay titulos disponibles con estos filtros.",
      });
    }

    const watchedTitles = watched.map((w) => w.split("-")[0]);
    const recommendations = await generateRecommendations(
      profile,
      forLLM,
      watchedTitles
    );

    const cache: RecommendationCache = {
      filters,
      recommendations,
      generated_at: new Date().toISOString(),
    };
    await writeCache("recommendations_cache.json", cache);

    return NextResponse.json(cache);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const cache = await readCache<RecommendationCache>(
    "recommendations_cache.json"
  );
  if (!cache) {
    return NextResponse.json(
      { error: "No recommendations cached. Run POST /api/recommendations." },
      { status: 404 }
    );
  }
  return NextResponse.json(cache);
}
```

**Step 2: Create watched/dismiss endpoint**

```typescript
// src/app/api/watched/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";

export async function POST(request: NextRequest) {
  const { tmdbId, type } = await request.json();
  const key = `${tmdbId}-${type}`;

  const watched = (await readCache<string[]>("watched.json")) ?? [];
  if (!watched.includes(key)) {
    watched.push(key);
    await writeCache("watched.json", watched);
  }

  return NextResponse.json({ watched: watched.length });
}

export async function GET() {
  const watched = (await readCache<string[]>("watched.json")) ?? [];
  return NextResponse.json({ watched });
}
```

**Step 3: Commit**

```bash
git add src/app/api/recommendations/route.ts src/app/api/watched/route.ts
git commit -m "feat(recommendations): add recommendation and watched API routes"
```

---

### Task 11: Genre list API route

**Files:**
- Create: `src/app/api/genres/route.ts`

**Step 1: Create genres route**

```typescript
// src/app/api/genres/route.ts
import { NextResponse } from "next/server";
import { getGenreList } from "@/lib/tmdb";

export async function GET() {
  try {
    const genres = await getGenreList();
    return NextResponse.json(genres);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/genres/route.ts
git commit -m "feat(genres): add genre list API route"
```

---

### Task 12: UI — Platform and filter components

**Files:**
- Create: `src/components/PlatformFilter.tsx`
- Create: `src/components/GenreFilter.tsx`
- Create: `src/components/Filters.tsx`

**Step 1: Create PlatformFilter component**

Use the `@frontend-design` skill for implementation. Create a visually polished component with toggle buttons for each streaming platform. Each button shows the platform name and toggles on/off with distinct styling.

```typescript
// src/components/PlatformFilter.tsx
"use client";

import { STREAMING_PROVIDERS, type StreamingProviderKey } from "@/types";

interface PlatformFilterProps {
  selected: StreamingProviderKey[];
  onChange: (providers: StreamingProviderKey[]) => void;
}

const PROVIDER_COLORS: Record<StreamingProviderKey, string> = {
  netflix: "bg-red-600",
  hbo: "bg-purple-700",
  prime: "bg-blue-500",
  disney: "bg-blue-700",
  apple: "bg-gray-800",
};

export function PlatformFilter({ selected, onChange }: PlatformFilterProps) {
  const toggle = (key: StreamingProviderKey) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(STREAMING_PROVIDERS) as StreamingProviderKey[]).map(
        (key) => {
          const provider = STREAMING_PROVIDERS[key];
          const isSelected = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? `${PROVIDER_COLORS[key]} text-white shadow-lg`
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {provider.name}
            </button>
          );
        }
      )}
    </div>
  );
}
```

**Step 2: Create GenreFilter component**

```typescript
// src/components/GenreFilter.tsx
"use client";

interface GenreFilterProps {
  genres: string[];
  selected: string[];
  onChange: (genres: string[]) => void;
}

export function GenreFilter({ genres, selected, onChange }: GenreFilterProps) {
  const toggle = (genre: string) => {
    if (selected.includes(genre)) {
      onChange(selected.filter((g) => g !== genre));
    } else {
      onChange([...selected, genre]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((genre) => {
        const isSelected = selected.includes(genre);
        return (
          <button
            key={genre}
            onClick={() => toggle(genre)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              isSelected
                ? "bg-amber-500 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            {genre}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 3: Create Filters component**

```typescript
// src/components/Filters.tsx
"use client";

import { PlatformFilter } from "./PlatformFilter";
import { GenreFilter } from "./GenreFilter";
import type { RecommendationFilters, StreamingProviderKey } from "@/types";

interface FiltersProps {
  filters: RecommendationFilters;
  genres: string[];
  onChange: (filters: RecommendationFilters) => void;
  onGenerate: () => void;
  loading: boolean;
}

export function Filters({
  filters,
  genres,
  onChange,
  onGenerate,
  loading,
}: FiltersProps) {
  return (
    <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
      {/* Plataformas */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Plataformas
        </h3>
        <PlatformFilter
          selected={filters.providers}
          onChange={(providers) => onChange({ ...filters, providers })}
        />
      </div>

      {/* Tipo */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tipo
        </h3>
        <div className="flex gap-2">
          {(["all", "movie", "tv"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onChange({ ...filters, type })}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filters.type === type
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {type === "all"
                ? "Todo"
                : type === "movie"
                  ? "Peliculas"
                  : "Series"}
            </button>
          ))}
        </div>
      </div>

      {/* Generos */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Generos
        </h3>
        <GenreFilter
          genres={genres}
          selected={filters.genres}
          onChange={(g) => onChange({ ...filters, genres: g })}
        />
      </div>

      {/* Anyo minimo y nota minima */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-gray-500">
            Anyo minimo
          </label>
          <input
            type="number"
            min={1950}
            max={2026}
            value={filters.minYear ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                minYear: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            placeholder="Ej: 2010"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-gray-500">
            Nota minima TMDB
          </label>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={filters.minRating ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                minRating: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            placeholder="Ej: 7.0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
      </div>

      {/* Boton generar */}
      <button
        onClick={onGenerate}
        disabled={loading || filters.providers.length === 0}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Generando recomendaciones..." : "Generar recomendaciones"}
      </button>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/PlatformFilter.tsx src/components/GenreFilter.tsx src/components/Filters.tsx
git commit -m "feat(ui): add filter components for platforms, genres, and search"
```

---

### Task 13: UI — RecommendationCard component

**Files:**
- Create: `src/components/RecommendationCard.tsx`

**Step 1: Create RecommendationCard**

Use `@frontend-design` skill. Create a visually appealing card that displays movie/series info with poster, metadata, platform badges, and the personalized recommendation reason.

```typescript
// src/components/RecommendationCard.tsx
"use client";

import Image from "next/image";
import type { Recommendation, StreamingProviderKey } from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onDismiss: (tmdbId: number, type: "movie" | "tv") => void;
}

const PROVIDER_COLORS: Record<StreamingProviderKey, string> = {
  netflix: "bg-red-600",
  hbo: "bg-purple-700",
  prime: "bg-blue-500",
  disney: "bg-blue-700",
  apple: "bg-gray-800",
};

export function RecommendationCard({
  recommendation,
  onDismiss,
}: RecommendationCardProps) {
  const { title, reason, score } = recommendation;
  const posterUrl = title.posterPath
    ? `https://image.tmdb.org/t/p/w342${title.posterPath}`
    : null;

  return (
    <div className="group flex gap-4 rounded-xl bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-900">
      {/* Poster */}
      <div className="h-48 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title.title}
            width={128}
            height={192}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            Sin poster
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {title.title}
            </h3>
            <p className="text-sm text-gray-500">
              {title.year} &middot;{" "}
              {title.type === "movie" ? "Pelicula" : "Serie"} &middot;{" "}
              {title.directors.join(", ") || "Director desconocido"}
              {title.runtime ? ` · ${title.runtime} min` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 dark:bg-amber-900">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {title.tmdbRating.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Genres */}
        <div className="mt-2 flex flex-wrap gap-1">
          {title.genres.slice(0, 4).map((genre) => (
            <span
              key={genre}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              {genre}
            </span>
          ))}
        </div>

        {/* Providers */}
        <div className="mt-2 flex gap-1">
          {title.providers.map((providerKey) => (
            <span
              key={providerKey}
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${PROVIDER_COLORS[providerKey]}`}
            >
              {STREAMING_PROVIDERS[providerKey].name}
            </span>
          ))}
        </div>

        {/* Reason */}
        <p className="mt-3 flex-1 text-sm italic text-gray-600 dark:text-gray-400">
          &ldquo;{reason}&rdquo;
        </p>

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Afinidad: {score}%
          </span>
          <button
            onClick={() => onDismiss(title.tmdbId, title.type)}
            className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
          >
            Ya la vi
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/RecommendationCard.tsx
git commit -m "feat(ui): add RecommendationCard component"
```

---

### Task 14: UI — Main page

**Files:**
- Create: `src/components/SetupPanel.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create SetupPanel component**

This component guides first-time setup (enrich data, generate profile).

```typescript
// src/components/SetupPanel.tsx
"use client";

import { useState } from "react";

interface SetupPanelProps {
  onComplete: () => void;
}

type SetupStep = "idle" | "enriching" | "profiling" | "done" | "error";

export function SetupPanel({ onComplete }: SetupPanelProps) {
  const [step, setStep] = useState<SetupStep>("idle");
  const [message, setMessage] = useState("");

  const runSetup = async () => {
    try {
      // Step 1: Enrich
      setStep("enriching");
      setMessage("Enriqueciendo tus valoraciones con datos de TMDB...");
      const enrichRes = await fetch("/api/enrich", { method: "POST" });
      const enrichData = await enrichRes.json();
      if (!enrichRes.ok) throw new Error(enrichData.error);
      setMessage(
        `Enriquecidas ${enrichData.total} peliculas (${enrichData.notFound} no encontradas en TMDB).`
      );

      // Step 2: Generate profile
      setStep("profiling");
      setMessage("Generando tu perfil de gustos con IA...");
      const profileRes = await fetch("/api/profile", { method: "POST" });
      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.error);

      setStep("done");
      setMessage("Perfil generado correctamente.");
      setTimeout(onComplete, 1500);
    } catch (error) {
      setStep("error");
      setMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  return (
    <div className="mx-auto max-w-lg rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-900">
      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
        Configuracion inicial
      </h2>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Necesitamos enriquecer tus valoraciones de FilmAffinity con datos de
        TMDB y generar tu perfil de gustos. Esto solo se hace una vez.
      </p>

      {step === "idle" && (
        <button
          onClick={runSetup}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl"
        >
          Iniciar configuracion
        </button>
      )}

      {(step === "enriching" || step === "profiling") && (
        <div className="space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
      )}

      {step === "done" && (
        <p className="font-medium text-green-600">{message}</p>
      )}

      {step === "error" && (
        <div className="space-y-3">
          <p className="text-red-600">{message}</p>
          <button
            onClick={() => setStep("idle")}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm dark:bg-gray-700"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Rewrite main page**

```typescript
// src/app/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Filters } from "@/components/Filters";
import { RecommendationCard } from "@/components/RecommendationCard";
import { SetupPanel } from "@/components/SetupPanel";
import type {
  Recommendation,
  RecommendationFilters,
  RecommendationCache,
  TasteProfile,
  TMDBGenre,
} from "@/types";

type AppState = "loading" | "setup" | "ready";

const DEFAULT_FILTERS: RecommendationFilters = {
  providers: ["netflix", "hbo", "prime", "disney", "apple"],
  type: "all",
  genres: [],
  minYear: null,
  minRating: null,
  maxDuration: null,
};

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [filters, setFilters] = useState<RecommendationFilters>(DEFAULT_FILTERS);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  // Check if setup is done
  useEffect(() => {
    async function checkSetup() {
      try {
        const [profileRes, genresRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/genres"),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
          setAppState("ready");

          // Load cached recommendations
          const cacheRes = await fetch("/api/recommendations");
          if (cacheRes.ok) {
            const cache: RecommendationCache = await cacheRes.json();
            setRecommendations(cache.recommendations);
            setFilters(cache.filters);
          }
        } else {
          setAppState("setup");
        }

        if (genresRes.ok) {
          const genreData: TMDBGenre[] = await genresRes.json();
          setGenres(genreData.map((g) => g.name));
        }
      } catch {
        setAppState("setup");
      }
    }
    checkSetup();
  }, []);

  const generateRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      // First refresh streaming catalog
      await fetch("/api/streaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: filters.providers,
          type: filters.type,
          minYear: filters.minYear,
          minRating: filters.minRating,
        }),
      });

      // Then generate recommendations
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const data: RecommendationCache = await res.json();
      setRecommendations(data.recommendations ?? []);
    } catch (error) {
      console.error("Error generating recommendations:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const dismissTitle = async (tmdbId: number, type: "movie" | "tv") => {
    await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, type }),
    });
    setRecommendations((prev) =>
      prev.filter((r) => r.title.tmdbId !== tmdbId)
    );
  };

  if (appState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (appState === "setup") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <SetupPanel onComplete={() => setAppState("ready")} />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Mi Recomendador
        </h1>
        {profile && (
          <p className="mt-2 text-sm text-gray-500">
            {profile.taste_summary.slice(0, 150)}...
          </p>
        )}
      </header>

      <Filters
        filters={filters}
        genres={genres}
        onChange={setFilters}
        onGenerate={generateRecommendations}
        loading={loading}
      />

      <div className="mt-8 space-y-4">
        {recommendations.length === 0 && !loading && (
          <p className="text-center text-gray-500">
            Pulsa &ldquo;Generar recomendaciones&rdquo; para empezar.
          </p>
        )}
        {recommendations.map((rec) => (
          <RecommendationCard
            key={`${rec.title.tmdbId}-${rec.title.type}`}
            recommendation={rec}
            onDismiss={dismissTitle}
          />
        ))}
      </div>
    </main>
  );
}
```

**Step 3: Update layout**

Read `src/app/layout.tsx` first, then update the metadata:

```typescript
// Only change the metadata in src/app/layout.tsx
export const metadata: Metadata = {
  title: "Mi Recomendador de Peliculas",
  description: "Recomendaciones personalizadas basadas en tus gustos de FilmAffinity",
};
```

**Step 4: Configure Next.js for TMDB images**

Read `next.config.ts` first, then add image domain:

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
```

**Step 5: Run `tsc --noEmit` and fix any type errors**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 6: Run `npm run build` to verify everything compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/components/SetupPanel.tsx next.config.ts
git commit -m "feat(ui): add main page with filters, recommendations, and setup flow"
```

---

### Task 15: Run all tests and final verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run linter**

Run: `npx next lint`
Expected: No errors

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Fix any issues found in steps 1-4**

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, build succeeds"
```

---

## Post-implementation: Manual testing

After all tasks are complete, test the full flow:

1. Add real API keys to `.env.local`:
   ```
   TMDB_API_KEY=<your-key>
   ANTHROPIC_API_KEY=<your-key>
   ```

2. Run `npm run dev`

3. Open the app — should show setup panel

4. Click "Iniciar configuracion":
   - Should enrich CSV with TMDB data (~2-3 min for 743 titles)
   - Should generate taste profile via Claude

5. Select platforms and click "Generar recomendaciones":
   - Should fetch streaming catalog from TMDB
   - Should call Claude for personalized recommendations
   - Should display recommendation cards

6. Click "Ya la vi" on a card — should disappear and be excluded from future recommendations
