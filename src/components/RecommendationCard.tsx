"use client";

import Image from "next/image";
import type { Recommendation, StreamingProviderKey } from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onDismiss: (tmdbId: number, type: "movie" | "tv") => void;
  inWatchlist?: boolean;
}

const PROVIDER_COLORS: Record<StreamingProviderKey, string> = {
  netflix: "bg-red-600",
  hbo: "bg-purple-700",
  prime: "bg-blue-500",
  disney: "bg-blue-700",
  apple: "bg-gray-800",
};

export function RecommendationCard({
  recommendation,
  onDismiss,
  inWatchlist,
}: RecommendationCardProps) {
  const { title, reason, score } = recommendation;
  const posterUrl = title.posterPath
    ? `https://image.tmdb.org/t/p/w342${title.posterPath}`
    : null;

  return (
    <div className="group flex gap-4 rounded-xl bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-900">
      <div className="h-48 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title.title}
            width={128}
            height={192}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            Sin poster
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {title.title}
            </h3>
            <p className="text-sm text-gray-500">
              {title.year} &middot;{" "}
              {title.type === "movie" ? "Pelicula" : "Serie"} &middot;{" "}
              {title.directors.join(", ") || "Director desconocido"}
              {title.runtime ? ` · ${title.runtime} min` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 dark:bg-amber-900">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {title.tmdbRating.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {title.genres.slice(0, 4).map((genre) => (
            <span
              key={genre}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              {genre}
            </span>
          ))}
        </div>

        <div className="mt-2 flex gap-1">
          {title.providers.map((providerKey) => (
            <span
              key={providerKey}
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${PROVIDER_COLORS[providerKey]}`}
            >
              {STREAMING_PROVIDERS[providerKey].name}
            </span>
          ))}
        </div>

        {inWatchlist && (
          <span className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            En tu watchlist
          </span>
        )}

        <p className="mt-3 flex-1 text-sm italic text-gray-600 dark:text-gray-400">
          &ldquo;{reason}&rdquo;
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Afinidad: {score}%
          </span>
          <button
            onClick={() => onDismiss(title.tmdbId, title.type)}
            className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
          >
            Ya la vi
          </button>
        </div>
      </div>
    </div>
  );
}
