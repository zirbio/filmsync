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
