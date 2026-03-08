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
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

function buildFilterHash(filters: RecommendationFilters): string {
  const key = [
    filters.type,
    [...filters.genreCategories].sort().join(","),
    filters.minYear ?? "any",
    [...filters.providers].sort().join(","),
  ].join("|");
  // Simple hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(request: NextRequest) {
  try {
    const filters: RecommendationFilters = await request.json();

    // Check cache first
    const filterHash = buildFilterHash(filters);
    const existingCache = await readCache<RecommendationCache>("recommendations_cache.json");
    if (existingCache) {
      const cacheAge = Date.now() - new Date(existingCache.generated_at).getTime();
      const existingHash = buildFilterHash(existingCache.filters);
      if (existingHash === filterHash && cacheAge < CACHE_TTL_MS) {
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

    // Verify each recommendation against TMDB
    const recommendations: Recommendation[] = [];
    for (const rec of claudeRecs) {
      const verified = await verifyRecommendation(
        rec,
        filters.type,
        filters.providers
      );
      if (verified) {
        recommendations.push({
          title: verified,
          reason: rec.reason,
          score: rec.score,
        });
      }
      // Throttle TMDB calls
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

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
