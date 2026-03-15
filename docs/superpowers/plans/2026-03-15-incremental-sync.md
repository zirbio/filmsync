# Incremental Sync Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FilmSync fully reactive: exclude watched titles from recommendations, detect rating updates on re-import, and refresh the UI after imports.

**Architecture:** Three surgical changes — (1) `POST /api/recommendations` reads `watched.json` and passes exclusions to Claude's prompt + filters results, with hash-based cache invalidation for both watched set and enriched data, (2) `enrichBatch()` uses a Map instead of Set to detect and update changed ratings, (3) `page.tsx` passes a `refreshKey` counter to child components that triggers re-fetches after import.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Vitest

---

## Prerequisites

- [ ] **Create feature branch:**

```bash
git checkout -b feature/incremental-sync
```

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/enrich.ts` | Modify | Detect and update changed ratings in `enrichBatch()` |
| `src/lib/__tests__/enrich.test.ts` | Create | Tests for incremental enrichment + rating updates |
| `src/app/api/enrich/route.ts` | Modify | Return `updated` count in response |
| `src/app/api/scrape/route.ts` | Modify | Return `updated` count in response (also calls `enrichBatch`) |
| `src/lib/claude.ts` | Modify | Accept `excludeTitles` param, add exclusion section to prompt |
| `src/app/api/recommendations/route.ts` | Modify | Read `watched.json`, pass to Claude, filter results, hash-based cache invalidation |
| `src/app/page.tsx` | Modify | Add `refreshKey` counter, increment on import complete |
| `src/components/DiscoverView.tsx` | Modify | Accept `refreshKey` prop, use as useEffect dependency |
| `src/components/LibraryView.tsx` | Modify | Accept and forward `refreshKey` prop |
| `src/components/CollectionGrid.tsx` | Modify | Accept `refreshKey` prop, use as useEffect dependency |
| `src/components/WatchedList.tsx` | Modify | Accept `refreshKey` prop, use as useEffect dependency |

---

## Task 1: Detect and update changed ratings in `enrichBatch()`

**Files:**
- Modify: `src/lib/enrich.ts:59-93`
- Modify: `src/app/api/enrich/route.ts:27-33`
- Modify: `src/app/api/scrape/route.ts:23-29`
- Create: `src/lib/__tests__/enrich.test.ts`

### Step 1: Write failing tests for rating update detection

- [ ] Create `src/lib/__tests__/enrich.test.ts` with tests that verify:
  1. New ratings get enriched (existing behavior)
  2. Ratings with changed `rating10` get updated without re-calling TMDB
  3. Ratings with changed `watchedDate` get updated
  4. Unchanged ratings are skipped entirely
  5. Return value includes `updated` count

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichBatch } from "@/lib/enrich";
import * as cache from "@/lib/cache";
import * as tmdb from "@/lib/tmdb";
import type { EnrichedRating, FilmAffinityRating } from "@/types";

vi.mock("@/lib/cache");
vi.mock("@/lib/tmdb");

const makeRating = (overrides: Partial<FilmAffinityRating> = {}): FilmAffinityRating => ({
  title: "Inception",
  year: 2010,
  directors: "Christopher Nolan",
  watchedDate: "2024-01-15",
  rating: 4,
  rating10: 8,
  ...overrides,
});

const makeEnriched = (overrides: Partial<EnrichedRating> = {}): EnrichedRating => ({
  title: "Inception",
  year: 2010,
  directors: "Christopher Nolan",
  watchedDate: "2024-01-15",
  rating: 4,
  rating10: 8,
  tmdbId: 27205,
  tmdbType: "movie",
  genres: ["Sci-Fi"],
  overview: "A mind-bending thriller",
  posterPath: "/poster.jpg",
  tmdbRating: 8.4,
  cast: ["Leonardo DiCaprio"],
  keywords: ["dream"],
  runtime: 148,
  ...overrides,
});

describe("enrichBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tmdb.searchMovie).mockResolvedValue(null);
    vi.mocked(tmdb.searchTV).mockResolvedValue(null);
  });

  it("skips already-enriched ratings with same data", async () => {
    const existing = [makeEnriched()];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating()]);

    expect(result.newlyEnriched).toBe(0);
    expect(result.updated).toBe(0);
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("updates rating10 without re-calling TMDB", async () => {
    const existing = [makeEnriched({ rating10: 8 })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ rating10: 9 })]);

    expect(result.updated).toBe(1);
    expect(result.newlyEnriched).toBe(0);
    expect(result.results[0].rating10).toBe(9);
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("updates watchedDate without re-calling TMDB", async () => {
    const existing = [makeEnriched({ watchedDate: "2024-01-15" })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ watchedDate: "2024-06-20" })]);

    expect(result.updated).toBe(1);
    expect(result.results[0].watchedDate).toBe("2024-06-20");
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("returns updated count in result", async () => {
    const existing = [makeEnriched({ rating10: 7 })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ rating10: 9 })]);

    expect(result).toHaveProperty("updated", 1);
    expect(result).toHaveProperty("newlyEnriched", 0);
  });
});
```

- [ ] Run tests to verify they fail:

```bash
npx vitest run src/lib/__tests__/enrich.test.ts
```

Expected: FAIL — `updated` property doesn't exist on return type, and ratings aren't being updated.

### Step 2: Implement rating update detection

- [ ] Modify `src/lib/enrich.ts` — replace `enrichBatch()`:

Replace the Set-based dedup with a Map. For each incoming rating, check if it exists: if yes, compare `rating10` and `watchedDate` and update in-place if different. Only call TMDB for genuinely new titles.

**Note:** the inner variable is named `cached` (not `existing`) to avoid shadowing the outer `readCache` result.

```typescript
export async function enrichBatch(
  newRatings: FilmAffinityRating[]
): Promise<{ results: EnrichedRating[]; newlyEnriched: number; updated: number; notFound: number }> {
  const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
  const enrichedMap = new Map<string, EnrichedRating>(
    existing?.map((r) => [`${r.title}-${r.year}`, r]) ?? []
  );

  const toEnrich: FilmAffinityRating[] = [];
  let updated = 0;

  for (const rating of newRatings) {
    const key = `${rating.title}-${rating.year}`;
    const cached = enrichedMap.get(key);
    if (cached) {
      let changed = false;
      if (cached.rating10 !== rating.rating10) {
        cached.rating10 = rating.rating10;
        cached.rating = rating.rating;
        changed = true;
      }
      if (cached.watchedDate !== rating.watchedDate) {
        cached.watchedDate = rating.watchedDate;
        changed = true;
      }
      if (changed) updated++;
    } else {
      toEnrich.push(rating);
    }
  }

  const results: EnrichedRating[] = [...enrichedMap.values()];
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
    updated,
    notFound: results.filter((r) => r.tmdbId === null).length,
  };
}
```

- [ ] Run tests to verify they pass:

```bash
npx vitest run src/lib/__tests__/enrich.test.ts
```

Expected: all 4 tests PASS.

### Step 3: Update API routes to return `updated` count

- [ ] Modify `src/app/api/enrich/route.ts:27-33` — add `updated` to the response:

```typescript
const { results, newlyEnriched, updated, notFound } = await enrichBatch(ratings);

return NextResponse.json({
  total: results.length,
  newlyEnriched,
  updated,
  notFound,
});
```

- [ ] Modify `src/app/api/scrape/route.ts:23-29` — add `updated` to the response:

```typescript
const { results, newlyEnriched, updated, notFound } = await enrichBatch(scraped);

return NextResponse.json({
  total: results.length,
  newlyEnriched,
  updated,
  notFound,
});
```

### Step 4: Verify and commit

- [ ] Run type check, lint, and tests:

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: 0 errors.

- [ ] Commit:

```bash
git add src/lib/enrich.ts src/lib/__tests__/enrich.test.ts src/app/api/enrich/route.ts src/app/api/scrape/route.ts
git commit -m "feat(enrich): detect and update changed ratings on re-import"
```

---

## Task 2: Exclude watched titles from recommendations

**Files:**
- Modify: `src/lib/claude.ts:14-82`
- Modify: `src/app/api/recommendations/route.ts:1-142`

### Step 1: Add `excludeTitles` parameter to `generateRecommendations()`

- [ ] Modify `src/lib/claude.ts` — add an optional `excludeTitles` parameter:

Change the function signature:

```typescript
export async function generateRecommendations(
  filteredRatings: EnrichedRating[],
  filters: {
    type: "movie" | "tv";
    genreCategories: string[];
    platforms: string[];
  },
  excludeTitles?: { title: string; year: number }[]
): Promise<ClaudeRecommendation[]> {
```

Build the exclusion section string before the prompt:

```typescript
const excludeSection =
  excludeTitles && excludeTitles.length > 0
    ? `\n\nTÍTULOS QUE EL USUARIO YA HA VISTO O DESCARTADO (NO recomiendes NINGUNO de estos):\n${excludeTitles.map((t) => `- "${t.title}" (${t.year})`).join("\n")}`
    : "";
```

Insert `${excludeSection}` in the prompt text right after the line "- NO recomiendes ningún título que aparezca en el historial del usuario."

- [ ] Run type check:

```bash
npx tsc --noEmit
```

Expected: 0 errors (parameter is optional, so existing callers don't break).

### Step 2: Rewrite recommendations route with hash-based cache invalidation

- [ ] Rewrite `src/app/api/recommendations/route.ts` POST handler to:
  1. Read `watched.json` **before** the cache check
  2. Build a `watchedHash` from sorted tmdbIds (not just a count)
  3. Store `enrichedCount` in cache to detect re-imports with new/updated data
  4. Pass `excludeTitles` to `generateRecommendations()`
  5. Post-filter results by `watchedTmdbIds` as safety net

Add the `WatchedItem` import at the top:

```typescript
import type {
  EnrichedRating,
  RecommendationFilters,
  RecommendationCache,
  Recommendation,
  ClaudeRecommendation,
  WatchedItem,
} from "@/types";
```

Replace the entire POST handler body:

```typescript
export async function POST(request: NextRequest) {
  try {
    const filters: RecommendationFilters = await request.json();
    const filterKey = buildFilterKey(filters);

    // Read watched titles (needed for cache check + exclusion)
    const watchedItems = (await readCache<WatchedItem[]>("watched.json")) ?? [];
    const watchedHash = watchedItems
      .map((w) => w.tmdbId)
      .sort((a, b) => a - b)
      .join(",");

    // Read enriched ratings
    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    if (!enriched || enriched.length === 0) {
      return NextResponse.json(
        { error: "No enriched data. Run POST /api/enrich first." },
        { status: 400 }
      );
    }

    // Check cache — invalidate if filters, watched set, or enriched data changed
    const existingCache = await readCache<
      RecommendationCache & { filterKey?: string; watchedHash?: string; enrichedCount?: number }
    >("recommendations_cache.json");
    if (existingCache) {
      const cacheAge = Date.now() - new Date(existingCache.generated_at).getTime();
      const existingKey = existingCache.filterKey ?? buildFilterKey(existingCache.filters);
      if (
        existingKey === filterKey &&
        (existingCache.watchedHash ?? "") === watchedHash &&
        (existingCache.enrichedCount ?? 0) === enriched.length &&
        cacheAge < CACHE_TTL_MS
      ) {
        return NextResponse.json(existingCache);
      }
    }

    // Filter ratings by user criteria
    const filtered = filterRatingsByCriteria(enriched, {
      type: filters.type,
      genreCategories: filters.genreCategories,
      minYear: filters.minYear,
    });

    if (filtered.length < 5) {
      return NextResponse.json(
        { error: "Muy pocas valoraciones con estos filtros. Prueba con otros géneros o un rango de años más amplio.", count: filtered.length },
        { status: 400 }
      );
    }

    // Generate recommendations via Claude (with watched exclusions)
    const platformNames = filters.providers.map(
      (p) => STREAMING_PROVIDERS[p].name
    );
    const excludeTitles = watchedItems.map((w) => ({ title: w.title, year: w.year }));
    const claudeRecs = await generateRecommendations(filtered, {
      type: filters.type,
      genreCategories: filters.genreCategories,
      platforms: platformNames,
    }, excludeTitles);

    // Verify recommendations against TMDB (batched concurrency)
    const verified = await verifyInBatches(
      claudeRecs.map((rec) => ({ rec })),
      filters.type,
      filters.providers
    );

    // Safety net: filter out any watched titles Claude might have included
    const watchedTmdbIds = new Set(watchedItems.map((w) => w.tmdbId));
    const recommendations = verified
      .filter((r): r is Recommendation => r !== null)
      .filter((r) => !watchedTmdbIds.has(r.title.tmdbId));

    const cache: RecommendationCache & { filterKey: string; watchedHash: string; enrichedCount: number } = {
      filterKey,
      watchedHash,
      enrichedCount: enriched.length,
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
```

### Step 3: Verify and commit

- [ ] Run type check, lint, and tests:

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: 0 errors.

- [ ] Commit:

```bash
git add src/lib/claude.ts src/app/api/recommendations/route.ts
git commit -m "feat(recommendations): exclude watched titles from Claude prompt and results"
```

---

## Task 3: Refresh UI after import

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/DiscoverView.tsx`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/components/CollectionGrid.tsx`
- Modify: `src/components/WatchedList.tsx`

**Note:** All five component files must be modified atomically in the same commit. Intermediate `tsc --noEmit` checks will fail if (e.g.) `WatchedList` adds a required `refreshKey` prop before `LibraryView` passes it.

### Step 1: Add `refreshKey` state to `page.tsx`

- [ ] Modify `src/app/page.tsx`:

Add a `refreshKey` counter state:

```typescript
const [refreshKey, setRefreshKey] = useState(0);
```

Update `handleImportComplete` to increment it:

```typescript
const handleImportComplete = () => {
  setHasData(true);
  setImportOpen(false);
  setRefreshKey((k) => k + 1);
};
```

Pass `refreshKey` to `DiscoverView` and `LibraryView`:

```tsx
<AppShell
  discoverView={
    <DiscoverView
      hasData={hasData}
      onNeedImport={() => setImportOpen(true)}
      refreshKey={refreshKey}
    />
  }
  libraryView={
    <LibraryView onImport={() => setImportOpen(true)} refreshKey={refreshKey} />
  }
/>
```

### Step 2: Wire `refreshKey` into `DiscoverView`

- [ ] Modify `src/components/DiscoverView.tsx`:

Add `refreshKey` to the props interface:

```typescript
interface DiscoverViewProps {
  hasData: boolean;
  onNeedImport: () => void;
  refreshKey: number;
}
```

Destructure it:

```typescript
export function DiscoverView({ hasData, onNeedImport, refreshKey }: DiscoverViewProps) {
```

Update the cache-loading `useEffect`. **Only clear recommendations when refreshKey > 0** to avoid a blank flash on initial mount:

```typescript
useEffect(() => {
  async function loadCache() {
    try {
      const res = await fetch("/api/recommendations");
      if (res.ok) {
        const cache: RecommendationCache = await res.json();
        setRecommendations(cache.recommendations);
        setFilters(cache.filters);
      }
    } catch {
      // No cached data
    }
  }
  if (hasData) {
    if (refreshKey > 0) setRecommendations([]);
    loadCache();
  }
}, [hasData, refreshKey]);
```

### Step 3: Wire `refreshKey` into `LibraryView` → `CollectionGrid` and `WatchedList`

- [ ] Modify `src/components/LibraryView.tsx`:

Add `refreshKey` to props:

```typescript
interface LibraryViewProps {
  onImport: () => void;
  refreshKey: number;
}

export function LibraryView({ onImport, refreshKey }: LibraryViewProps) {
```

Pass to children:

```tsx
{activeSection === "collection" && (
  <CollectionGrid onImport={onImport} refreshKey={refreshKey} />
)}
{activeSection === "watched" && <WatchedList refreshKey={refreshKey} />}
```

- [ ] Modify `src/components/CollectionGrid.tsx`:

Add `refreshKey` to props:

```typescript
interface CollectionGridProps {
  onImport: () => void;
  refreshKey: number;
}

export function CollectionGrid({ onImport, refreshKey }: CollectionGridProps) {
```

Update the data-loading `useEffect` — add `setLoading(true)` before fetch and `refreshKey` as dependency:

```typescript
useEffect(() => {
  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/enrich?full=true");
      if (res.ok) {
        const data = await res.json();
        setRatings(data.ratings ?? []);
      }
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }
  load();
}, [refreshKey]);
```

- [ ] Modify `src/components/WatchedList.tsx`:

Add `refreshKey` to props:

```typescript
interface WatchedListProps {
  refreshKey: number;
}

export function WatchedList({ refreshKey }: WatchedListProps) {
```

Update the data-loading `useEffect` — add `setLoading(true)` before fetch and `refreshKey` as dependency:

```typescript
useEffect(() => {
  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/watched");
      if (res.ok) {
        const data = await res.json();
        setItems(data.watched ?? []);
      }
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }
  load();
}, [refreshKey]);
```

### Step 4: Verify and commit

- [ ] Run type check, lint, and tests:

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: 0 errors on all three.

- [ ] Commit:

```bash
git add src/app/page.tsx src/components/DiscoverView.tsx src/components/LibraryView.tsx src/components/CollectionGrid.tsx src/components/WatchedList.tsx
git commit -m "feat(ui): refresh all views after import via refreshKey prop"
```

---

## Final Verification

After all three tasks, run the full CI pipeline locally:

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

All must pass with 0 errors before pushing.
