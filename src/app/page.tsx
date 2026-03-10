"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Filters } from "@/components/Filters";
import { RecommendationCard } from "@/components/RecommendationCard";
import { SetupPanel } from "@/components/SetupPanel";
import type {
  Recommendation,
  RecommendationFilters,
  RecommendationCache,
} from "@/types";

type AppState = "loading" | "setup" | "ready";

const DEFAULT_FILTERS: RecommendationFilters = {
  providers: ["netflix", "hbo", "prime", "disney", "apple"],
  type: "movie",
  genreCategories: [],
  minYear: null,
};

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [filters, setFilters] = useState<RecommendationFilters>(DEFAULT_FILTERS);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const [enrichRes, cacheRes] = await Promise.all([
          fetch("/api/enrich"),
          fetch("/api/recommendations"),
        ]);
        if (!enrichRes.ok) {
          setAppState("setup");
          return;
        }
        setAppState("ready");
        if (cacheRes.ok) {
          const cache: RecommendationCache = await cacheRes.json();
          setRecommendations(cache.recommendations);
          setFilters(cache.filters);
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

  if (appState === "setup") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <SetupPanel onComplete={() => setAppState("ready")} />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-24">
      <motion.header
        className="mb-16 md:mb-24"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 className="font-display text-5xl tracking-tight text-foreground md:text-6xl lg:text-7xl">
          FilmSync
        </h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
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
                transition={{
                  duration: 0.5,
                  ease: "easeOut",
                }}
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
    </main>
  );
}
