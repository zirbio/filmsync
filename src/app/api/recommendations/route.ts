import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import { generateRecommendations } from "@/lib/claude";
import type {
  TasteProfile,
  StreamingTitle,
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

    const watched = (await readCache<string[]>("watched.json")) ?? [];

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

    filtered = filtered.filter(
      (t) => !watched.includes(`${t.tmdbId}-${t.type}`)
    );

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
