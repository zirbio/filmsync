"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Compass } from "lucide-react";
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
      // Error generating
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const [dismissing, setDismissing] = useState<Set<number>>(new Set());

  const dismissTitle = async (tmdbId: number, type: "movie" | "tv") => {
    if (dismissing.has(tmdbId)) return;
    const rec = recommendations.find((r) => r.title.tmdbId === tmdbId);
    if (!rec) return;

    setDismissing((prev) => new Set(prev).add(tmdbId));
    try {
      await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId,
          type,
          title: rec.title.title,
          year: rec.title.year,
          posterPath: rec.title.posterPath,
          genres: rec.title.genres,
          directors: rec.title.directors.join(", "),
          tmdbRating: rec.title.tmdbRating,
        }),
      });
      setRecommendations((prev) =>
        prev.filter((r) => r.title.tmdbId !== tmdbId)
      );
    } finally {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(tmdbId);
        return next;
      });
    }
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
            <Compass size={40} strokeWidth={1} className="mx-auto mb-4 text-foreground-subtle" />
            <p className="font-display text-2xl text-foreground-subtle md:text-3xl">
              Pulsa &ldquo;Generar recomendaciones&rdquo; para empezar
            </p>
          </motion.div>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
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
