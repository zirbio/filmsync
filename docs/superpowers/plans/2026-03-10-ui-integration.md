# UI Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate all backend features into the UI with tabbed navigation (Descubrir + Mi Biblioteca), import modal, library views, and shared components.

**Architecture:** Client-side tab switching via `AppShell` component with `useState`. Both views stay mounted to preserve state. Library has 3 subsections via segmented control. Import modal offers CSV upload + FA scraper.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind CSS v4, motion v12, lucide-react, vitest

**Spec:** `docs/superpowers/specs/2026-03-10-ui-integration-design.md`

---

## Chunk 1: Backend Changes

### Task 1: Fix globals.css banned font fallback

**Files:**
- Modify: `src/app/globals.css:57`

- [ ] **Step 1: Remove `system-ui` from font-family fallback**

In `src/app/globals.css`, line 57, change:
```css
font-family: var(--font-body), system-ui;
```
to:
```css
font-family: var(--font-body);
```

The font variable already includes the full stack from `next/font/google`. No fallback needed beyond what Next.js provides.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(css): remove banned system-ui font fallback"
```

---

### Task 2: Modify GET /api/enrich to support `?full=true`

**Files:**
- Modify: `src/app/api/enrich/route.ts:97-110` (GET handler)
- Test: `src/lib/__tests__/enrich-api.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/enrich-api.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("GET /api/enrich", () => {
  it("returns summary by default (no full param)", async () => {
    const { GET } = await import("@/app/api/enrich/route");

    const request = new Request("http://localhost/api/enrich");
    const response = await GET(request);
    const data = await response.json();

    if (response.status === 200) {
      expect(data).toHaveProperty("total");
      expect(data).toHaveProperty("notFound");
      expect(data).toHaveProperty("sample");
      expect(data).not.toHaveProperty("ratings");
    }
  });

  it("returns full ratings array when ?full=true", async () => {
    const { GET } = await import("@/app/api/enrich/route");

    const request = new Request("http://localhost/api/enrich?full=true");
    const response = await GET(request);
    const data = await response.json();

    if (response.status === 200) {
      expect(data).toHaveProperty("total");
      expect(data).toHaveProperty("notFound");
      expect(data).toHaveProperty("ratings");
      expect(Array.isArray(data.ratings)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/enrich-api.test.ts`
Expected: FAIL — current GET handler doesn't accept `Request` parameter and doesn't support `?full=true`

- [ ] **Step 3: Implement the change**

Modify `src/app/api/enrich/route.ts` — update the GET handler to accept a `Request` parameter and check for `?full=true`. Use standard `new URL(request.url).searchParams` (not `request.nextUrl`) so the handler works both in Next.js runtime and in vitest tests:

```typescript
// Keep existing imports — no need to import NextRequest for GET

export async function GET(request: Request) {
  const data = await readCache<EnrichedRating[]>("enriched_ratings.json");
  if (!data) {
    return NextResponse.json(
      { error: "No enriched data. Run POST /api/enrich first." },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const full = searchParams.get("full") === "true";

  if (full) {
    return NextResponse.json({
      total: data.length,
      notFound: data.filter((r) => r.tmdbId === null).length,
      ratings: data,
    });
  }

  return NextResponse.json({
    total: data.length,
    notFound: data.filter((r) => r.tmdbId === null).length,
    sample: data.slice(0, 3),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/enrich-api.test.ts`
Expected: PASS

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/enrich/route.ts src/lib/__tests__/enrich-api.test.ts
git commit -m "feat(api): add ?full=true param to GET /api/enrich"
```

---

### Task 3: Modify POST /api/enrich to accept multipart file upload

**Files:**
- Modify: `src/app/api/enrich/route.ts:57-95` (POST handler)

- [ ] **Step 1: Update POST handler to accept FormData**

The POST handler should check if the request has a `multipart/form-data` content type. If yes, extract the file and save to `data/filmaffinity_ratings.csv`. If no, use the existing local file.

First, add `fs` import at the top of the file (currently only `path` is imported, not `fs`):
```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
// ... rest of existing imports stay the same ...
```

Also update the import line to include `NextRequest` (currently only `NextResponse` is imported).

Then update the POST handler to accept `NextRequest`:

```typescript
export async function POST(request: NextRequest) {
  try {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");

    // Check if request has a file upload
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.mkdir(path.dirname(csvPath), { recursive: true });
      await fs.writeFile(csvPath, buffer);
    }

    // Rest of existing enrichment logic stays exactly the same from here
    const ratings = await parseFilmAffinityCSV(csvPath);
    // ... same as before ...
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/enrich/route.ts
git commit -m "feat(api): accept multipart CSV upload in POST /api/enrich"
```

---

### Task 4: Modify /api/watched to store full metadata and support remove

**Files:**
- Modify: `src/app/api/watched/route.ts`

Currently `watched.json` stores only string keys like `"12345-movie"`. But watched items come from *recommendations* (not from the user's imported FA ratings), so we can't look up their metadata from enriched ratings. We need to store full metadata to display them in the WatchedList.

**Migration approach:** Store an array of objects instead of strings. Keep backwards compatibility — if the file contains old-format string keys, they'll be filtered out (they lack metadata anyway).

- [ ] **Step 1: Update watched route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";

interface WatchedItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  year: number;
  posterPath: string | null;
  genres: string[];
  directors: string;
  tmdbRating: number | null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tmdbId, type, action = "add" } = body;
  const key = `${tmdbId}-${type}`;

  const watched = (await readCache<WatchedItem[]>("watched.json")) ?? [];

  if (action === "remove") {
    const filtered = watched.filter(
      (item) => `${item.tmdbId}-${item.type}` !== key
    );
    await writeCache("watched.json", filtered);
    return NextResponse.json({ watched: filtered.length });
  }

  // Add — requires metadata in the body
  const exists = watched.some(
    (item) => `${item.tmdbId}-${item.type}` === key
  );
  if (!exists) {
    watched.push({
      tmdbId,
      type,
      title: body.title ?? "",
      year: body.year ?? 0,
      posterPath: body.posterPath ?? null,
      genres: body.genres ?? [],
      directors: body.directors ?? "",
      tmdbRating: body.tmdbRating ?? null,
    });
    await writeCache("watched.json", watched);
  }

  return NextResponse.json({ watched: watched.length });
}

export async function GET() {
  const watched = (await readCache<WatchedItem[]>("watched.json")) ?? [];
  return NextResponse.json({ watched });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/watched/route.ts
git commit -m "feat(api): add remove action to POST /api/watched"
```

---

### Task 5a: Extract `enrichRating` to shared module (DRY)

**Files:**
- Create: `src/lib/enrich.ts`
- Modify: `src/app/api/enrich/route.ts`

The `enrichRating` function is defined in `src/app/api/enrich/route.ts` and will also be needed by the new scrape route. Extract it now to avoid duplication (per CLAUDE.md DRY rule).

- [ ] **Step 1: Create `src/lib/enrich.ts`**

Move the `enrichRating` function from `enrich/route.ts` to a shared module:

```typescript
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
```

- [ ] **Step 2: Update `src/app/api/enrich/route.ts`**

Remove the `enrichRating` function body and replace with an import:

```typescript
import { enrichRating } from "@/lib/enrich";
```

Remove the old `import { searchMovie, searchTV, getMovieDetails, getTVDetails } from "@/lib/tmdb"` line (no longer needed directly in the route).

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass (no behavior change)

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrich.ts src/app/api/enrich/route.ts
git commit -m "refactor: extract enrichRating to shared lib/enrich.ts"
```

---

### Task 5b: Modify fa-scraper to throw typed errors

**Files:**
- Modify: `src/lib/fa-scraper.ts`

Currently `scrapeFilmAffinity` catches all errors and returns `[]`, making it impossible to distinguish between "user not found", "CLI not installed", and "timeout". Modify it to throw typed errors.

- [ ] **Step 1: Update fa-scraper.ts**

```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import type { FilmAffinityRating } from "@/types";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_INSTALLED" | "TIMEOUT" | "SCRAPE_FAILED"
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

export async function scrapeFilmAffinity(
  userId: string
): Promise<FilmAffinityRating[]> {
  const outputPath = path.resolve(process.cwd(), "data/fa_scraped.csv");

  try {
    await execFileAsync(
      "fa-scraper",
      [userId, "--csv", outputPath, "--lang", "en"],
      { timeout: 120_000 }
    );
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean };

    if (err.code === "ENOENT") {
      throw new ScraperError(
        "fa-scraper CLI tool not found",
        "NOT_INSTALLED"
      );
    }

    if (err.killed || err.code === "ETIMEDOUT") {
      throw new ScraperError("Scraping timed out", "TIMEOUT");
    }

    throw new ScraperError(
      err.message ?? "Scraping failed",
      "SCRAPE_FAILED"
    );
  }

  const ratings = await parseFilmAffinityCSV(outputPath);
  await fs.unlink(outputPath).catch(() => {});

  return ratings;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/fa-scraper.ts
git commit -m "refactor(fa-scraper): throw typed errors instead of returning empty"
```

---

### Task 5c: Create POST /api/scrape route

**Files:**
- Create: `src/app/api/scrape/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { scrapeFilmAffinity, ScraperError } from "@/lib/fa-scraper";
import { enrichRating } from "@/lib/enrich";
import { readCache, writeCache } from "@/lib/cache";
import type { EnrichedRating } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const scraped = await scrapeFilmAffinity(userId);

    if (scraped.length === 0) {
      return NextResponse.json(
        { error: "User not found on FilmAffinity" },
        { status: 404 }
      );
    }

    const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const enrichedTitles = new Set(
      existing?.map((r) => `${r.title}-${r.year}`) ?? []
    );

    const toEnrich = scraped.filter(
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
    if (error instanceof ScraperError) {
      switch (error.code) {
        case "NOT_INSTALLED":
          return NextResponse.json(
            { error: "fa-scraper tool not available" },
            { status: 500 }
          );
        case "TIMEOUT":
          return NextResponse.json(
            { error: "Scraping timed out" },
            { status: 504 }
          );
        case "SCRAPE_FAILED":
          return NextResponse.json(
            { error: "Failed to scrape FilmAffinity" },
            { status: 500 }
          );
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scrape/route.ts
git commit -m "feat(api): add POST /api/scrape for FA user scraping"
```

---

## Chunk 2: Shared Components

### Task 6: Create TitleCard component

**Files:**
- Create: `src/components/TitleCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import Image from "next/image";

interface TitleCardProps {
  poster: string | null;
  title: string;
  year: number;
  directors?: string;
  genres: string[];
  type: "movie" | "tv";
  tmdbScore?: number;
  runtime?: number | null;
  children?: React.ReactNode;
}

export function TitleCard({
  poster,
  title,
  year,
  directors,
  genres,
  type,
  tmdbScore,
  runtime,
  children,
}: TitleCardProps) {
  const posterUrl = poster
    ? `https://image.tmdb.org/t/p/w500${poster}`
    : null;

  return (
    <article className="group">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated transition-transform duration-200 group-hover:scale-[1.02]">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-foreground-subtle">
            Sin poster
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-5 pb-5 pt-20">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                {type === "movie" ? "Película" : "Serie"}
                {runtime ? ` · ${runtime} min` : ""}
              </span>
            </div>
            {tmdbScore != null && (
              <div className="flex-shrink-0 rounded-md bg-white/15 px-2 py-1 backdrop-blur-sm">
                <span className="text-sm font-bold text-white">
                  {tmdbScore.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="font-display text-2xl tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-sm text-foreground-subtle">
            {year}{directors ? ` · ${directors}` : ""}
          </p>
        </div>

        {genres.length > 0 && (
          <p className="text-xs text-foreground-subtle">
            {genres.slice(0, 3).join(" · ")}
          </p>
        )}

        {children}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TitleCard.tsx
git commit -m "feat(ui): add shared TitleCard component"
```

---

### Task 7: Refactor RecommendationCard to use TitleCard

**Files:**
- Modify: `src/components/RecommendationCard.tsx`

- [ ] **Step 1: Refactor to wrap TitleCard**

Replace the full file content. `RecommendationCard` now wraps `TitleCard` and adds recommendation-specific children:

```typescript
"use client";

import { Eye } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
import type { Recommendation } from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onDismiss: (tmdbId: number, type: "movie" | "tv") => void;
  inWatchlist?: boolean;
}

export function RecommendationCard({
  recommendation,
  onDismiss,
  inWatchlist,
}: RecommendationCardProps) {
  const { title, reason, score } = recommendation;

  return (
    <TitleCard
      poster={title.posterPath}
      title={title.title}
      year={title.year}
      directors={title.directors.join(", ") || undefined}
      genres={title.genres}
      type={title.type}
      tmdbScore={title.tmdbRating}
      runtime={title.runtime}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-subtle">
          {title.providers
            .map((key) => STREAMING_PROVIDERS[key].name)
            .join(", ")}
        </span>
      </div>

      {inWatchlist && (
        <span className="inline-block rounded-full bg-primary-muted px-2.5 py-0.5 text-xs font-medium text-primary">
          En tu watchlist
        </span>
      )}

      <blockquote className="border-l-2 border-primary/30 pl-4">
        <p className="font-display text-base italic leading-relaxed text-foreground-muted">
          &ldquo;{reason}&rdquo;
        </p>
      </blockquote>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-background-subtle">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="text-xs text-foreground-subtle">
            {score}% afinidad
          </span>
        </div>
        <button
          onClick={() => onDismiss(title.tmdbId, title.type)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground-subtle opacity-0 transition-all duration-200 hover:bg-background-elevated hover:text-foreground group-hover:opacity-100"
        >
          <Eye size={14} strokeWidth={1.5} />
          Ya la vi
        </button>
      </div>
    </TitleCard>
  );
}
```

- [ ] **Step 2: Verify visual parity**

Run: `npm run dev`
Navigate to home page. Recommendation cards should look identical to before.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RecommendationCard.tsx
git commit -m "refactor(ui): RecommendationCard now wraps TitleCard"
```

---

## Chunk 3: AppShell and Navigation

### Task 8: Create AppShell component

**Files:**
- Create: `src/components/AppShell.tsx`

- [ ] **Step 1: Create the component**

This is the main shell with header, tabs, and content area. Initially it renders placeholder divs for the views — we'll wire up the real views in later tasks.

```typescript
"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Compass, Library } from "lucide-react";

type Tab = "discover" | "library";

interface AppShellProps {
  discoverView: React.ReactNode;
  libraryView: React.ReactNode;
}

export function AppShell({
  discoverView,
  libraryView,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>("discover");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "discover",
      label: "Descubrir",
      icon: <Compass size={20} strokeWidth={1.5} />,
    },
    {
      id: "library",
      label: "Mi Biblioteca",
      icon: <Library size={20} strokeWidth={1.5} />,
    },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* Desktop header */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur-md md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
          <h1 className="font-display text-2xl tracking-tight text-foreground">
            FilmSync
          </h1>
          <nav className="relative flex gap-1" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`focus-ring relative rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.id
                    ? "text-foreground"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-x-2 -bottom-[17px] h-0.5 bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content — both views always mounted */}
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-16">
        <motion.div
          animate={{
            opacity: activeTab === "discover" ? 1 : 0,
            x: activeTab === "discover" ? 0 : -20,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ display: activeTab === "discover" ? "block" : "none" }}
        >
          {discoverView}
        </motion.div>
        <motion.div
          animate={{
            opacity: activeTab === "library" ? 1 : 0,
            x: activeTab === "library" ? 0 : 20,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ display: activeTab === "library" ? "block" : "none" }}
        >
          {libraryView}
        </motion.div>
      </main>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background-elevated md:hidden"
        role="tablist"
      >
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`focus-ring flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-200 ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-foreground-muted"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(ui): add AppShell with tabbed navigation"
```

---

### Task 9: Create DiscoverView (extract from page.tsx)

**Files:**
- Create: `src/components/DiscoverView.tsx`

- [ ] **Step 1: Extract discover logic from page.tsx**

Move the ready-state rendering and all associated state (filters, recommendations, loading, generate, dismiss) into a standalone component:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Filters } from "@/components/Filters";
import { RecommendationCard } from "@/components/RecommendationCard";
import type {
  Recommendation,
  RecommendationFilters,
  RecommendationCache,
} from "@/types";

const DEFAULT_FILTERS: RecommendationFilters = {
  providers: ["netflix", "hbo", "prime", "disney", "apple"],
  type: "movie",
  genreCategories: [],
  minYear: null,
};

interface DiscoverViewProps {
  hasData: boolean;
  onNeedImport: () => void;
}

export function DiscoverView({ hasData, onNeedImport }: DiscoverViewProps) {
  const [filters, setFilters] =
    useState<RecommendationFilters>(DEFAULT_FILTERS);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  // Load cached recommendations on mount
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
        // No cached data — that's fine
      }
    }
    if (hasData) loadCache();
  }, [hasData]);

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
    } catch {
      // Error generating — recommendations stay empty
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const dismissTitle = async (tmdbId: number, type: "movie" | "tv") => {
    // Find the full recommendation to store metadata for WatchedList
    const rec = recommendations.find((r) => r.title.tmdbId === tmdbId);
    await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId,
        type,
        title: rec?.title.title,
        year: rec?.title.year,
        posterPath: rec?.title.posterPath,
        genres: rec?.title.genres,
        directors: rec?.title.directors.join(", "),
        tmdbRating: rec?.title.tmdbRating,
      }),
    });
    setRecommendations((prev) =>
      prev.filter((r) => r.title.tmdbId !== tmdbId)
    );
  };

  if (!hasData) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-2xl text-foreground-subtle md:text-3xl">
          Importa tus valoraciones para empezar a descubrir
        </p>
        <button
          onClick={onNeedImport}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
        >
          Importar valoraciones
        </button>
      </div>
    );
  }

  return (
    <div>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <Filters
          filters={filters}
          onChange={setFilters}
          onGenerate={generateRecommendations}
          loading={loading}
        />
      </motion.section>

      <section className="mt-16 md:mt-24">
        {recommendations.length === 0 && !loading && (
          <motion.div
            className="py-24 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <p className="font-display text-2xl text-foreground-subtle md:text-3xl">
              Pulsa &ldquo;Generar recomendaciones&rdquo; para empezar
            </p>
          </motion.div>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-background-elevated" />
                <div className="mt-5 space-y-3">
                  <div className="h-6 w-3/4 rounded bg-background-elevated" />
                  <div className="h-4 w-1/2 rounded bg-background-elevated" />
                  <div className="h-20 w-full rounded bg-background-elevated" />
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length > 0 && !loading && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            {recommendations.map((rec) => (
              <motion.div
                key={`${rec.title.tmdbId}-${rec.title.type}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <RecommendationCard
                  recommendation={rec}
                  onDismiss={dismissTitle}
                />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/DiscoverView.tsx
git commit -m "feat(ui): add DiscoverView extracted from page.tsx"
```

---

### Task 10: Create ImportModal component

**Files:**
- Create: `src/components/ImportModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileUp, Globe, AlertCircle, CheckCircle } from "lucide-react";

type ImportStep = "choose" | "csv" | "scraper" | "progress" | "done" | "error";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ImportModal({ open, onClose, onComplete }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>("choose");
  const [userId, setUserId] = useState("");
  const [progress, setProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{
    total: number;
    notFound: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Store trigger element for focus restoration
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  // Focus trap and escape key
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // Focus first element in modal
    const timer = setTimeout(() => {
      modalRef.current
        ?.querySelector<HTMLElement>("button, input")
        ?.focus();
    }, 100);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  const reset = useCallback(() => {
    setStep("choose");
    setUserId("");
    setProgress("");
    setErrorMessage("");
    setResult(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrorMessage("El archivo debe ser un CSV (.csv)");
      setStep("error");
      return;
    }

    setStep("progress");
    setProgress("Subiendo archivo...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/enrich", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Error al procesar el CSV");

      setResult({ total: data.total, notFound: data.notFound ?? 0 });
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "El archivo no es un CSV válido de FilmAffinity."
      );
      setStep("error");
    }
  };

  const handleScrape = async () => {
    if (!userId.trim()) return;

    setStep("progress");
    setProgress("Importando desde FilmAffinity...");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 500 && data.error?.includes("not available")) {
          throw new Error(
            "La herramienta de scraping no está disponible. Usa la opción de subir CSV."
          );
        }
        throw new Error(
          data.error ?? "No se pudo acceder al perfil de FilmAffinity."
        );
      }

      setResult({ total: data.total, notFound: data.notFound ?? 0 });
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error desconocido"
      );
      setStep("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
            className="relative w-full max-w-lg rounded-2xl bg-background-elevated p-8 shadow-elevated"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
              <h2
                id="import-modal-title"
                className="font-display text-2xl tracking-tight text-foreground"
              >
                Importar valoraciones
              </h2>
              <button
                onClick={handleClose}
                className="focus-ring rounded-lg p-2 text-foreground-muted transition-colors duration-200 hover:bg-background-subtle hover:text-foreground"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            {/* Choose method */}
            {step === "choose" && (
              <div className="space-y-4">
                <button
                  onClick={() => setStep("csv")}
                  className="focus-ring flex w-full items-start gap-4 rounded-xl border border-border p-5 text-left transition-all duration-200 hover:border-primary hover:bg-primary-muted/30"
                >
                  <FileUp
                    size={24}
                    strokeWidth={1.5}
                    className="mt-0.5 flex-shrink-0 text-primary"
                  />
                  <div>
                    <h3 className="font-medium text-foreground">
                      Subir archivo CSV
                    </h3>
                    <p className="mt-1 text-sm text-foreground-muted">
                      Exporta tus valoraciones desde FilmAffinity y sube el
                      archivo CSV
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setStep("scraper")}
                  className="focus-ring flex w-full items-start gap-4 rounded-xl border border-border p-5 text-left transition-all duration-200 hover:border-primary hover:bg-primary-muted/30"
                >
                  <Globe
                    size={24}
                    strokeWidth={1.5}
                    className="mt-0.5 flex-shrink-0 text-primary"
                  />
                  <div>
                    <h3 className="font-medium text-foreground">
                      Importar desde FilmAffinity
                    </h3>
                    <p className="mt-1 text-sm text-foreground-muted">
                      Introduce tu nombre de usuario de FilmAffinity
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* CSV upload */}
            {step === "csv" && (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`focus-ring cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
                    dragActive
                      ? "border-primary bg-primary-muted/20"
                      : "border-border hover:border-foreground-subtle"
                  }`}
                >
                  <FileUp
                    size={32}
                    strokeWidth={1.5}
                    className="mx-auto text-foreground-muted"
                  />
                  <p className="mt-3 text-sm text-foreground-muted">
                    Arrastra tu archivo CSV aquí o haz click para seleccionar
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                </div>
                <button
                  onClick={() => setStep("choose")}
                  className="focus-ring text-sm text-foreground-muted transition-colors duration-200 hover:text-foreground"
                >
                  &larr; Volver
                </button>
              </div>
            )}

            {/* FA scraper */}
            {step === "scraper" && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="fa-user-id"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Nombre de usuario de FilmAffinity
                  </label>
                  <input
                    id="fa-user-id"
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                    placeholder="mi_usuario"
                    className="focus-ring w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground-subtle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setStep("choose")}
                    className="focus-ring text-sm text-foreground-muted transition-colors duration-200 hover:text-foreground"
                  >
                    &larr; Volver
                  </button>
                  <button
                    onClick={handleScrape}
                    disabled={!userId.trim()}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Importar
                  </button>
                </div>
              </div>
            )}

            {/* Progress */}
            {step === "progress" && (
              <div className="space-y-6 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-foreground-muted">{progress}</p>
              </div>
            )}

            {/* Done */}
            {step === "done" && result && (
              <div className="space-y-6 text-center">
                <div className="flex items-center justify-center gap-2 text-success">
                  <CheckCircle size={20} strokeWidth={1.5} />
                  <span className="font-medium">Importación completada</span>
                </div>
                <p className="text-sm text-foreground-muted">
                  Se importaron {result.total - result.notFound} de{" "}
                  {result.total} títulos.
                  {result.notFound > 0 &&
                    ` ${result.notFound} no se encontraron en TMDB.`}
                </p>
                <button
                  onClick={() => {
                    handleClose();
                    onComplete();
                  }}
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                >
                  Ver mi colección
                </button>
              </div>
            )}

            {/* Error */}
            {step === "error" && (
              <div className="space-y-6 text-center">
                <div className="flex items-center justify-center gap-2 text-error">
                  <AlertCircle size={20} strokeWidth={1.5} />
                  <span className="font-medium">Error</span>
                </div>
                <p className="text-sm text-error/80">{errorMessage}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={reset}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportModal.tsx
git commit -m "feat(ui): add ImportModal with CSV upload and FA scraper"
```

---

## Chunk 4: Library Views

### Task 11: Create CollectionGrid component

**Files:**
- Create: `src/components/CollectionGrid.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Upload, Search } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
import { Star } from "lucide-react";
import type { EnrichedRating } from "@/types";

interface CollectionGridProps {
  onImport: () => void;
}

type SortKey = "rating" | "watchedDate" | "year";
type TypeFilter = "all" | "movie" | "tv";

export function CollectionGrid({ onImport }: CollectionGridProps) {
  const [ratings, setRatings] = useState<EnrichedRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("rating");

  useEffect(() => {
    async function load() {
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
  }, []);

  const filtered = useMemo(() => {
    let items = ratings.filter((r) => r.tmdbId !== null);

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.title.toLowerCase().includes(q));
    }

    if (typeFilter !== "all") {
      items = items.filter((r) => r.tmdbType === typeFilter);
    }

    items.sort((a, b) => {
      if (sortBy === "rating") return b.rating10 - a.rating10;
      if (sortBy === "year") return b.year - a.year;
      if (sortBy === "watchedDate")
        return (
          new Date(b.watchedDate).getTime() -
          new Date(a.watchedDate).getTime()
        );
      return 0;
    });

    return items;
  }, [ratings, search, typeFilter, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (ratings.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-2xl text-foreground-subtle">
          Aún no has importado valoraciones
        </p>
        <button
          onClick={onImport}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
        >
          <Upload size={16} strokeWidth={1.5} />
          Importar ahora
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl text-foreground">
          {filtered.length} títulos importados
        </h2>
        <button
          onClick={onImport}
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-background-subtle px-4 py-2 text-sm font-medium text-foreground-muted transition-colors duration-200 hover:bg-border hover:text-foreground"
        >
          <Upload size={14} strokeWidth={1.5} />
          Importar
        </button>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle"
          />
          <input
            type="text"
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="focus-ring w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-foreground-subtle"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="focus-ring rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="all">Todos</option>
          <option value="movie">Películas</option>
          <option value="tv">Series</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="focus-ring rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="rating">Nota</option>
          <option value="year">Año</option>
          <option value="watchedDate">Fecha vista</option>
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((rating, index) => (
          <motion.div
            key={`${rating.tmdbId}-${rating.tmdbType}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: Math.min(index * 0.05, 0.4),
              ease: "easeOut",
            }}
          >
            <TitleCard
              poster={rating.posterPath}
              title={rating.title}
              year={rating.year}
              directors={rating.directors}
              genres={rating.genres}
              type={rating.tmdbType ?? "movie"}
              tmdbScore={rating.tmdbRating ?? undefined}
            >
              <div className="flex items-center gap-1 text-primary">
                <Star size={14} strokeWidth={1.5} className="fill-current" />
                <span className="text-sm font-medium">{rating.rating10}</span>
              </div>
            </TitleCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CollectionGrid.tsx
git commit -m "feat(ui): add CollectionGrid for imported ratings"
```

---

### Task 12: Create WatchedList component

**Files:**
- Create: `src/components/WatchedList.tsx`

- [ ] **Step 1: Create the component**

Watched items now store full metadata (see Task 4). `GET /api/watched` returns `{ watched: WatchedItem[] }` directly.

```typescript
"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Undo2 } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";

interface WatchedItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  year: number;
  posterPath: string | null;
  genres: string[];
  directors: string;
  tmdbRating: number | null;
}

export function WatchedList() {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
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
  }, []);

  const handleRestore = async (tmdbId: number, type: string) => {
    await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, type, action: "remove" }),
    });
    setItems((prev) =>
      prev.filter((item) => `${item.tmdbId}-${item.type}` !== `${tmdbId}-${type}`)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-xl text-foreground-subtle">
          Cuando descartes una recomendación con &ldquo;Ya la vi&rdquo;,
          aparecerá aquí
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-8 font-display text-xl text-foreground">
        {items.length} títulos vistos
      </h2>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item, index) => (
          <motion.div
            key={`${item.tmdbId}-${item.type}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: Math.min(index * 0.05, 0.4),
              ease: "easeOut",
            }}
          >
            <TitleCard
              poster={item.posterPath}
              title={item.title}
              year={item.year}
              directors={item.directors}
              genres={item.genres}
              type={item.type}
              tmdbScore={item.tmdbRating ?? undefined}
            >
              <button
                onClick={() =>
                  handleRestore(item.tmdbId, item.type)
                }
                className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground-muted transition-all duration-200 hover:bg-background-elevated hover:text-foreground"
              >
                <Undo2 size={14} strokeWidth={1.5} />
                Restaurar
              </button>
            </TitleCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WatchedList.tsx
git commit -m "feat(ui): add WatchedList with restore functionality"
```

---

### Task 13: Create TraktSection component

**Files:**
- Create: `src/components/TraktSection.tsx`
- Reference: `src/app/sync/page.tsx` (source to migrate from)

- [ ] **Step 1: Create TraktSection by migrating sync/page.tsx**

Extract the sync page logic into a component. Keep the inline sub-components (`TypeBadge`, `StarRating`, `WatchlistItemCard`, `SyncDiffTable`) inside the file since they are only used here. Remove the page-level header and layout — `LibraryView` provides that context.

The component should be functionally identical to `sync/page.tsx` but without the `<main>` wrapper, page header, and motion entry animations (those are handled by the parent). Also fix `duration: 0.6` → `duration: 0.5`.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  Star,
} from "lucide-react";
import type {
  SyncItem,
  SyncDiff,
  SyncResult,
  TraktWatchlistItem,
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

// ... Copy TypeBadge, StarRating, WatchlistItemCard, SyncDiffTable exactly from sync/page.tsx ...
// ... Copy the full state machine and handlers from SyncPage ...
// ... But export as named export `TraktSection` instead of default ...
// ... Remove <main> wrapper and page-level header/title ...
// ... Keep the three sections: connection, sync, watchlist ...
```

The full component is a direct copy of `src/app/sync/page.tsx` lines 29-598, with these changes:
1. Export as `export function TraktSection()` (named export, not default)
2. Remove `<main>` wrapper and the `<motion.header>` with "Sincronización FA → Trakt"
3. The three `<motion.section>` blocks become the top-level content
4. Change all `duration: 0.6` to `duration: 0.5`
5. Keep all inline sub-components (`TypeBadge`, `StarRating`, `WatchlistItemCard`, `SyncDiffTable`) as-is inside the file

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TraktSection.tsx
git commit -m "feat(ui): add TraktSection migrated from sync page"
```

---

### Task 14: Create LibraryView component

**Files:**
- Create: `src/components/LibraryView.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CollectionGrid } from "@/components/CollectionGrid";
import { WatchedList } from "@/components/WatchedList";
import { TraktSection } from "@/components/TraktSection";

type LibraryTab = "collection" | "watched" | "trakt";

interface LibraryViewProps {
  onImport: () => void;
}

export function LibraryView({ onImport }: LibraryViewProps) {
  const [activeSection, setActiveSection] =
    useState<LibraryTab>("collection");

  const sections: { id: LibraryTab; label: string }[] = [
    { id: "collection", label: "Mi colección" },
    { id: "watched", label: "Vistos" },
    { id: "trakt", label: "Trakt" },
  ];

  return (
    <div>
      {/* Segmented control */}
      <div className="mb-10 inline-flex rounded-lg bg-background-subtle p-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`focus-ring relative rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              activeSection === section.id
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {activeSection === section.id && (
              <motion.div
                layoutId="library-pill"
                className="absolute inset-0 rounded-md bg-background-elevated"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "collection" && (
        <CollectionGrid onImport={onImport} />
      )}
      {activeSection === "watched" && <WatchedList />}
      {activeSection === "trakt" && <TraktSection />}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/LibraryView.tsx
git commit -m "feat(ui): add LibraryView with segmented control"
```

---

## Chunk 5: Wire Everything Together

### Task 15: Rewrite page.tsx to use AppShell

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx content**

```typescript
"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AppShell } from "@/components/AppShell";
import { DiscoverView } from "@/components/DiscoverView";
import { LibraryView } from "@/components/LibraryView";
import { ImportModal } from "@/components/ImportModal";

export default function Home() {
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch("/api/enrich");
        if (res.ok) {
          setHasData(true);
        } else {
          setImportOpen(true);
        }
      } catch {
        setImportOpen(true);
      } finally {
        setLoading(false);
      }
    }
    checkSetup();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </motion.div>
      </div>
    );
  }

  const handleImportComplete = () => {
    setHasData(true);
    setImportOpen(false);
  };

  return (
    <>
      <AppShell
        discoverView={
          <DiscoverView
            hasData={hasData}
            onNeedImport={() => setImportOpen(true)}
          />
        }
        libraryView={
          <LibraryView onImport={() => setImportOpen(true)} />
        }
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
      />
    </>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run dev server and verify**

Run: `npm run dev`
- Both tabs should be navigable
- Filters and recommendations should work in Descubrir
- Library should show collection, watched, and Trakt subsections
- Import modal should open on first launch or via "Importar" button

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): wire AppShell with all views in page.tsx"
```

---

### Task 16: Delete sync page and SetupPanel

**Files:**
- Delete: `src/app/sync/page.tsx`
- Delete: `src/components/SetupPanel.tsx`

- [ ] **Step 1: Remove old files**

```bash
rm src/app/sync/page.tsx
rmdir src/app/sync 2>/dev/null || true
rm src/components/SetupPanel.tsx
```

- [ ] **Step 2: Verify no imports reference deleted files**

Run: `npx tsc --noEmit`
Expected: 0 errors. If there are errors, it means something still imports `SetupPanel` or the sync page — fix those imports.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove sync page and SetupPanel (migrated to AppShell)"
```

---

### Task 17: Final verification

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` and verify:
1. App loads, tabs visible (desktop: header, mobile: bottom bar)
2. First launch without data → ImportModal opens automatically
3. Descubrir tab: filters work, generate recommendations, dismiss with "Ya la vi"
4. Biblioteca > Mi colección: shows imported ratings with search/filter/sort
5. Biblioteca > Vistos: shows dismissed titles, restore works
6. Biblioteca > Trakt: connect, sync, watchlist all functional
7. State preserved when switching tabs (filters, recommendations stay)
8. Responsive: bottom bar appears on mobile, header tabs on desktop
