"use client";

import { PlatformFilter } from "./PlatformFilter";
import { GenreFilter } from "./GenreFilter";
import { Loader2 } from "lucide-react";
import type { RecommendationFilters } from "@/types";

interface FiltersProps {
  filters: RecommendationFilters;
  onChange: (filters: RecommendationFilters) => void;
  onGenerate: () => void;
  loading: boolean;
}

export function Filters({
  filters,
  onChange,
  onGenerate,
  loading,
}: FiltersProps) {
  return (
    <div className="space-y-10 rounded-2xl bg-background-elevated px-6 py-10 md:px-10">
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
          Plataformas
        </h3>
        <PlatformFilter
          selected={filters.providers}
          onChange={(providers) => onChange({ ...filters, providers })}
        />
      </div>

      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
          Tipo
        </h3>
        <div className="inline-flex gap-1 rounded-full bg-background-subtle p-1">
          {(["movie", "tv"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onChange({ ...filters, type })}
              className={`focus-ring rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 ${
                filters.type === type
                  ? "bg-foreground text-background"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {type === "movie" ? "Películas" : "Series"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
          Generos
        </h3>
        <GenreFilter
          selected={filters.genreCategories}
          onChange={(g) => onChange({ ...filters, genreCategories: g })}
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
          Anyo minimo
        </label>
        <input
          type="number"
          min={1950}
          max={2026}
          value={filters.minYear ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              minYear: e.target.value ? parseInt(e.target.value) : null,
            })
          }
          placeholder="Ej: 2010"
          className="focus-ring w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle transition-colors duration-200 hover:border-foreground-subtle sm:max-w-xs"
        />
      </div>

      <button
        onClick={onGenerate}
        disabled={loading || filters.providers.length === 0}
        className="focus-ring inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-primary px-8 py-3.5 font-semibold text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none sm:w-auto"
      >
        {loading && (
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
        )}
        {loading ? "Generando recomendaciones..." : "Generar recomendaciones"}
      </button>
    </div>
  );
}
