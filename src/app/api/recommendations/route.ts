import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import { generateRecommendations } from "@/lib/claude";
import { verifyRecommendation } from "@/lib/tmdb";
import { filterRatingsByCriteria } from "@/lib/rating-filter";
import type {
  EnrichedRating,
  RecommendationFilters,
  RecommendationCache,
  Recommendation,
  ClaudeRecommendation,
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

function buildFilterKey(filters: RecommendationFilters): string {
  return [
    filters.type,
    [...filters.genreCategories].sort().join(","),
    filters.minYear ?? "any",
    [...filters.providers].sort().join(","),
  ].join("|");
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TMDB_CONCURRENCY = 5;

async function verifyInBatches(
  recs: { rec: ClaudeRecommendation }[],
  type: "movie" | "tv",
  providers: RecommendationFilters["providers"]
): Promise<(Recommendation | null)[]> {
  const results: (Recommendation | null)[] = [];

  for (let i = 0; i < recs.length; i += TMDB_CONCURRENCY) {
    const batch = recs.slice(i, i + TMDB_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(({ rec }) => verifyRecommendation(rec, type, providers))
    );

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const { rec } = batch[j];
      if (result.status === "fulfilled" && result.value) {
        results.push({ title: result.value, reason: rec.reason, score: rec.score });
      } else {
        results.push(null);
      }
    }

    if (i + TMDB_CONCURRENCY < recs.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const filters: RecommendationFilters = await request.json();

    // Check cache first
    const filterKey = buildFilterKey(filters);
    const existingCache = await readCache<RecommendationCache & { filterKey?: string }>(
      "recommendations_cache.json"
    );
    if (existingCache) {
      const cacheAge = Date.now() - new Date(existingCache.generated_at).getTime();
      const existingKey = existingCache.filterKey ?? buildFilterKey(existingCache.filters);
      if (existingKey === filterKey && cacheAge < CACHE_TTL_MS) {
        return NextResponse.json(existingCache);
      }
    }

    // Read enriched ratings
    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    if (!enriched || enriched.length === 0) {
      return NextResponse.json(
        { error: "No enriched data. Run POST /api/enrich first." },
        { status: 400 }
      );
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

    // Generate recommendations via Claude
    const platformNames = filters.providers.map(
      (p) => STREAMING_PROVIDERS[p].name
    );
    const claudeRecs = await generateRecommendations(filtered, {
      type: filters.type,
      genreCategories: filters.genreCategories,
      platforms: platformNames,
    });

    // Verify recommendations against TMDB (batched concurrency)
    const verified = await verifyInBatches(
      claudeRecs.map((rec) => ({ rec })),
      filters.type,
      filters.providers
    );
    const recommendations = verified.filter((r): r is Recommendation => r !== null);

    const cache: RecommendationCache & { filterKey: string } = {
      filterKey,
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
