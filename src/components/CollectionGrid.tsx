"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Upload, Search, Star } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
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
