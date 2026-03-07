"use client";

import { PlatformFilter } from "./PlatformFilter";
import { GenreFilter } from "./GenreFilter";
import type { RecommendationFilters } from "@/types";

interface FiltersProps {
  filters: RecommendationFilters;
  genres: string[];
  onChange: (filters: RecommendationFilters) => void;
  onGenerate: () => void;
  loading: boolean;
}

export function Filters({
  filters,
  genres,
  onChange,
  onGenerate,
  loading,
}: FiltersProps) {
  return (
    <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Plataformas
        </h3>
        <PlatformFilter
          selected={filters.providers}
          onChange={(providers) => onChange({ ...filters, providers })}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tipo
        </h3>
        <div className="flex gap-2">
          {(["all", "movie", "tv"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onChange({ ...filters, type })}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filters.type === type
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {type === "all"
                ? "Todo"
                : type === "movie"
                  ? "Peliculas"
                  : "Series"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Generos
        </h3>
        <GenreFilter
          genres={genres}
          selected={filters.genres}
          onChange={(g) => onChange({ ...filters, genres: g })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-gray-500">
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-gray-500">
            Nota minima TMDB
          </label>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={filters.minRating ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                minRating: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            placeholder="Ej: 7.0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={loading || filters.providers.length === 0}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Generando recomendaciones..." : "Generar recomendaciones"}
      </button>
    </div>
  );
}
