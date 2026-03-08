# Recommendation Engine Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current "generic TMDB catalog + Claude ranker" pipeline with a "filtered user history + Claude as cinephile recommender + TMDB verification" pipeline.

**Architecture:** User selects filters (type, genre category, year, platforms). Backend filters enriched_ratings.json to matching titles. Sends filtered ratings to Claude with an expert cinephile prompt. Claude recommends ~20 titles from its own knowledge. Backend verifies each on TMDB for availability in Spain. Returns verified recommendations with metadata.

**Tech Stack:** Next.js API Routes, Anthropic SDK (claude-sonnet-4-5-20250929), TMDB API v3, TypeScript strict, Vitest

---

### Task 1: Update types and add genre category mapping

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Update RecommendationFilters type**

Remove `minRating` and `maxDuration` from `RecommendationFilters`. The type should become:

```typescript
export interface RecommendationFilters {
  providers: StreamingProviderKey[];
  type: "movie" | "tv";
  genreCategories: string[];
  minYear: number | null;
}
```

Note: `type` no longer includes `"all"` — user must pick movie or tv. `genres` is replaced by `genreCategories` (the simplified category names).

**Step 2: Add genre category constant**

Add after `STREAMING_PROVIDERS`:

```typescript
export const GENRE_CATEGORIES: Record<string, string[]> = {
  "Drama": ["Drama"],
  "Comedia": ["Comedia"],
  "Thriller / Crimen": ["Crimen", "Suspense", "Misterio"],
  "Acción / Aventura": ["Acción", "Aventura"],
  "Sci-Fi / Fantasía": ["Ciencia ficción", "Fantasía"],
  "Histórico / Bélico": ["Historia", "Bélica"],
  "Romance": ["Romance"],
  "Animación": ["Animación"],
} as const;
```

**Step 3: Add ClaudeRecommendation type**

Add a type for the raw output from Claude (before TMDB verification):

```typescript
export interface ClaudeRecommendation {
  title: string;
  year: number;
  director: string;
  reason: string;
  score: number;
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors in files that reference old `RecommendationFilters` fields — this is expected and will be fixed in later tasks.

**Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor(types): update RecommendationFilters and add genre categories"
```

---

### Task 2: Create rating filter utility with tests

**Files:**
- Create: `src/lib/rating-filter.ts`
- Create: `src/lib/__tests__/rating-filter.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { filterRatingsBycriteria } from "../rating-filter";
import type { EnrichedRating } from "@/types";

function makeRating(overrides: Partial<EnrichedRating>): EnrichedRating {
  return {
    title: "Test Movie",
    year: 2020,
    directors: "Test Director",
    watchedDate: "2024-01-01",
    rating: 4,
    rating10: 8,
    tmdbId: 1,
    tmdbType: "movie",
    genres: ["Drama"],
    overview: "",
    posterPath: null,
    tmdbRating: 7.5,
    cast: [],
    keywords: [],
    runtime: 120,
    ...overrides,
  };
}

describe("filterRatingsBycriteria", () => {
  const ratings: EnrichedRating[] = [
    makeRating({ title: "Drama Movie", genres: ["Drama", "Crimen"], tmdbType: "movie", year: 2015 }),
    makeRating({ title: "Comedy Movie", genres: ["Comedia"], tmdbType: "movie", year: 2020 }),
    makeRating({ title: "Drama Series", genres: ["Drama"], tmdbType: "tv", year: 2018 }),
    makeRating({ title: "Action Movie", genres: ["Acción", "Aventura"], tmdbType: "movie", year: 2005 }),
    makeRating({ title: "No TMDB", genres: ["Drama"], tmdbId: null, tmdbType: null }),
  ];

  it("filters by type movie", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie", "Comedy Movie", "Action Movie"]);
  });

  it("filters by type tv", () => {
    const result = filterRatingsBycriteria(ratings, { type: "tv", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Series"]);
  });

  it("filters by genre category with multiple TMDB genres", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: ["Thriller / Crimen"], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie"]);
  });

  it("filters by genre category Acción / Aventura", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: ["Acción / Aventura"], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Action Movie"]);
  });

  it("returns all genres when genreCategories is empty", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: [], minYear: null });
    expect(result).toHaveLength(3);
  });

  it("filters by minYear", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: [], minYear: 2010 });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie", "Comedy Movie"]);
  });

  it("excludes ratings without tmdbId", () => {
    const result = filterRatingsBycriteria(ratings, { type: "movie", genreCategories: ["Drama"], minYear: null });
    expect(result.find((r) => r.title === "No TMDB")).toBeUndefined();
  });

  it("sorts by rating10 descending", () => {
    const mixed = [
      makeRating({ title: "Low", rating10: 5, genres: ["Drama"], tmdbType: "movie" }),
      makeRating({ title: "High", rating10: 10, genres: ["Drama"], tmdbType: "movie" }),
      makeRating({ title: "Mid", rating10: 7, genres: ["Drama"], tmdbType: "movie" }),
    ];
    const result = filterRatingsBycriteria(mixed, { type: "movie", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["High", "Mid", "Low"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/rating-filter.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

File `src/lib/rating-filter.ts`:

```typescript
import type { EnrichedRating } from "@/types";
import { GENRE_CATEGORIES } from "@/types";

interface FilterCriteria {
  type: "movie" | "tv";
  genreCategories: string[];
  minYear: number | null;
}

export function filterRatingsByriteria(
  ratings: EnrichedRating[],
  criteria: FilterCriteria
): EnrichedRating[] {
  // Expand genre categories to TMDB genre names
  const tmdbGenres: string[] = criteria.genreCategories.length > 0
    ? criteria.genreCategories.flatMap((cat) => GENRE_CATEGORIES[cat] ?? [])
    : [];

  return ratings
    .filter((r) => {
      if (!r.tmdbId || !r.tmdbType) return false;
      if (r.tmdbType !== criteria.type) return false;
      if (tmdbGenres.length > 0 && !r.genres.some((g) => tmdbGenres.includes(g))) return false;
      if (criteria.minYear && r.year < criteria.minYear) return false;
      return true;
    })
    .sort((a, b) => b.rating10 - a.rating10);
}
```

Note: the function name in the test is `filterRatingsByCriteria` — make sure the export matches.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/rating-filter.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/lib/rating-filter.ts src/lib/__tests__/rating-filter.test.ts
git commit -m "feat(rating-filter): add utility to filter enriched ratings by criteria"
```

---

### Task 3: Rewrite Claude recommendation prompt

**Files:**
- Modify: `src/lib/claude.ts`

**Step 1: Replace generateRecommendations function**

Replace the existing `generateRecommendations` with a new version. Keep `extractJSON` helper. Remove `generateTasteProfile` entirely.

The new function signature:

```typescript
export async function generateRecommendations(
  filteredRatings: EnrichedRating[],
  filters: {
    type: "movie" | "tv";
    genreCategories: string[];
    platforms: string[];
  }
): Promise<ClaudeRecommendation[]>
```

The new prompt should:
- Set role as expert film critic, tone between cinephile and casual
- Include the filtered ratings (title, year, director, rating10)
- Tell Claude which platforms to target (Netflix, HBO, Prime, Disney+, Apple TV+ in Spain)
- Tell Claude what type and genre the user wants
- Explicitly exclude documentaries, stand-ups, concerts, TV specials
- Ask for 20 recommendations with: exact title, year, director, personalized reason, confidence score
- Tell Claude NOT to recommend titles already in the ratings list
- Ask Claude to reference specific titles from the user's history in its explanations
- Output as JSON array of `ClaudeRecommendation`

Example prompt structure:

```
Eres un crítico de cine experto con conocimiento enciclopédico. Tu tarea es recomendar {películas|series} a un usuario basándote en su historial de valoraciones.

HISTORIAL DEL USUARIO ({N} títulos de {género} que ha valorado):

{ratings formatted as: - "Title" (Year) — Director: X — Nota: N/10}

INSTRUCCIONES:
- Recomienda 20 {películas|series} del género {categorías} disponibles en streaming en España ({plataformas}).
- Basa tus recomendaciones en tu propio conocimiento cinematográfico.
- Prioriza títulos que compartan ADN con los que el usuario puntuó más alto: mismo director, misma escuela cinematográfica, temáticas afines, tono similar.
- NO recomiendes documentales, stand-ups, conciertos, especiales de TV ni programas de telerrealidad.
- NO recomiendes ningún título que aparezca en el historial del usuario.
- En la explicación, referencia títulos concretos del historial del usuario (ej: "Si te gustó X por su Y, esto te encantará porque Z").
- Sé honesto: si no estás seguro de que un título esté en streaming en España, inclúyelo igualmente con un score más bajo.

Responde SOLO con un JSON array con esta estructura exacta:
[
  {
    "title": "Título exacto de la película/serie",
    "year": 2024,
    "director": "Nombre del director",
    "reason": "Explicación personalizada de por qué le gustará",
    "score": 90
  }
]

Ordena de mayor a menor score.
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: May still have errors in API routes (will be fixed in Task 5). The claude.ts file itself should have no errors.

**Step 3: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat(claude): rewrite recommendation prompt as cinephile recommender"
```

---

### Task 4: Add TMDB verification function

**Files:**
- Modify: `src/lib/tmdb.ts`

**Step 1: Add verifyRecommendation function**

Add a new exported function that takes a `ClaudeRecommendation` and verifies it against TMDB:

```typescript
export async function verifyRecommendation(
  rec: ClaudeRecommendation,
  type: "movie" | "tv",
  allowedProviders: StreamingProviderKey[]
): Promise<StreamingTitle | null>
```

Logic:
1. Search TMDB by title + year (`searchMovie` or `searchTV`)
2. If not found, return `null`
3. Get watch providers for Spain
4. Filter to only allowed providers
5. If no matching providers, return `null`
6. Get full details (credits, etc.)
7. Return a `StreamingTitle` with all metadata

Import `ClaudeRecommendation` from types.

**Step 2: Add throttle between verification calls**

Add 100ms delay between TMDB calls to respect rate limits (same pattern as existing code).

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean for tmdb.ts

**Step 4: Commit**

```bash
git add src/lib/tmdb.ts
git commit -m "feat(tmdb): add verifyRecommendation function for Claude output validation"
```

---

### Task 5: Rewrite POST /api/recommendations route

**Files:**
- Modify: `src/app/api/recommendations/route.ts`

**Step 1: Rewrite POST handler**

New flow:
1. Parse filters from request body (`RecommendationFilters`)
2. Read `enriched_ratings.json` from cache
3. Filter ratings using `filterRatingsByCriteria()`
4. If filtered ratings < 5, return error suggesting different filters
5. Call `generateRecommendations()` with filtered ratings + filters
6. For each `ClaudeRecommendation`, call `verifyRecommendation()` from tmdb.ts
7. Filter out nulls (not found or not available)
8. Build `Recommendation[]` from verified results
9. Cache with filters hash as key
10. Return response

**Step 2: Update cache key to use filter hash**

Instead of overwriting `recommendations_cache.json` every time, create a deterministic hash from `type + genreCategories.sort().join() + minYear + providers.sort().join()`. Check cache first; if exists and < 7 days old, return cached.

Use a simple approach: save to `recommendations_cache.json` but include the filter hash in the cached object. On GET, return the latest cache. On POST, check if the filters match the cached version.

```typescript
interface RecommendationCache {
  filters: RecommendationFilters;
  filterHash: string;
  recommendations: Recommendation[];
  generated_at: string;
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/api/recommendations/route.ts
git commit -m "feat(api): rewrite recommendations route with new Claude-first pipeline"
```

---

### Task 6: Update UI — Filters component

**Files:**
- Modify: `src/components/Filters.tsx`
- Modify: `src/components/GenreFilter.tsx`

**Step 1: Update GenreFilter to use genre categories**

Replace the dynamic genre list with the 8 hardcoded categories from `GENRE_CATEGORIES`. The component no longer receives `genres` as prop — it imports `GENRE_CATEGORIES` directly.

```typescript
import { GENRE_CATEGORIES } from "@/types";

interface GenreFilterProps {
  selected: string[];
  onChange: (categories: string[]) => void;
}

export function GenreFilter({ selected, onChange }: GenreFilterProps) {
  const categories = Object.keys(GENRE_CATEGORIES);
  // ... toggle logic stays the same, just use categories instead of genres
}
```

**Step 2: Update Filters component**

- Remove `genres` prop (no longer needed)
- Remove `minRating` input field
- Remove `maxDuration` input field (if present)
- Change type selector from `["all", "movie", "tv"]` to `["movie", "tv"]` only
- Update `GenreFilter` to not pass `genres` prop
- Update filter field names: `genres` → `genreCategories`

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/Filters.tsx src/components/GenreFilter.tsx
git commit -m "refactor(ui): simplify filters with genre categories, remove unused fields"
```

---

### Task 7: Update UI — page.tsx

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update DEFAULT_FILTERS**

```typescript
const DEFAULT_FILTERS: RecommendationFilters = {
  providers: ["netflix", "hbo", "prime", "disney", "apple"],
  type: "movie",
  genreCategories: [],
  minYear: null,
};
```

**Step 2: Update checkSetup**

- Remove `fetch("/api/genres")` call — genres are now hardcoded
- Change profile check to enriched data check: `fetch("/api/enrich")` GET instead of `fetch("/api/profile")` GET
- Remove `setGenres` state and `genres` state variable
- Remove `profile` state if taste_summary is no longer shown, OR keep it if we want to still show the summary (decide: the profile endpoint is being removed — so remove the summary display or generate it differently)

Decision: Remove the profile summary display for now. The profile generation step is eliminated.

**Step 3: Update generateRecommendations**

Remove the `fetch("/api/streaming")` POST call. Only call `fetch("/api/recommendations")` POST directly:

```typescript
const generateRecommendations = useCallback(async () => {
  setLoading(true);
  try {
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
```

**Step 4: Update Filters component usage**

Remove `genres` prop from `<Filters>`:

```tsx
<Filters
  filters={filters}
  onChange={setFilters}
  onGenerate={generateRecommendations}
  loading={loading}
/>
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors

**Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor(page): update main page for new recommendation pipeline"
```

---

### Task 8: Update SetupPanel — remove profiling step

**Files:**
- Modify: `src/components/SetupPanel.tsx`

**Step 1: Simplify setup flow**

Remove the "profiling" step. Setup now only does enrichment:

- Change `SetupStep` type to `"idle" | "enriching" | "done" | "error"`
- Remove the profile generation fetch call
- Update progress bar (only 1 step now, not 2)
- Update messaging

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/SetupPanel.tsx
git commit -m "refactor(setup): remove profile generation step, keep only enrichment"
```

---

### Task 9: Cleanup dead code

**Files:**
- Modify: `src/lib/claude.ts` — verify `generateTasteProfile` is removed (done in Task 3)
- Modify: `src/app/api/profile/route.ts` — remove POST handler, keep GET if needed for backward compat, or delete entirely
- Modify: `src/app/api/streaming/route.ts` — remove POST handler, keep GET if needed, or delete entirely
- Modify: `src/app/api/genres/route.ts` — remove if genres are hardcoded now
- Modify: `src/types/index.ts` — remove `TasteProfile` type if no longer used anywhere

**Step 1: Check for remaining references**

Search the codebase for:
- `generateTasteProfile` — should have 0 references
- `taste_profile` — should have 0 references
- `streaming_catalog` — should have 0 references
- `/api/profile` POST — should have 0 references
- `/api/streaming` POST — should have 0 references
- `/api/genres` — should have 0 references

Remove dead files/code. Keep the Trakt sync page (`src/app/sync/page.tsx`) intact — check if it references any of this.

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS (existing tests should still pass; some may need updating if they reference removed functions)

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors

**Step 4: Run linter**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code from old recommendation pipeline"
```

---

### Task 10: End-to-end smoke test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test the full flow**

1. Open browser to `http://localhost:3000`
2. Select type: "Películas"
3. Select genre: "Thriller / Crimen"
4. Click "Generar recomendaciones"
5. Verify: recommendations appear with posters, reasons referencing your history, streaming platform badges
6. Verify: no documentaries, stand-ups, or concerts in results
7. Verify: "Ya la vi" dismiss button works

**Step 3: Test edge cases**

- Select genre with very few ratings in history → should get a meaningful error or fewer results
- Select all genres → should work with the full history

**Step 4: Run full build**

Run: `npm run build`
Expected: PASS

**Step 5: Final commit if any fixes needed**

```bash
git commit -m "fix: address issues found in smoke testing"
```
