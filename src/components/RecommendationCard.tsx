"use client";

import Image from "next/image";
import { Eye } from "lucide-react";
import type { Recommendation } from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onDismiss: (tmdbId: number, type: "movie" | "tv") => void;
  inWatchlist?: boolean;
}

export function RecommendationCard({
  recommendation,
  onDismiss,
  inWatchlist,
}: RecommendationCardProps) {
  const { title, reason, score } = recommendation;
  const posterUrl = title.posterPath
    ? `https://image.tmdb.org/t/p/w500${title.posterPath}`
    : null;

  return (
    <article className="group">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated transition-transform duration-300 group-hover:scale-[1.01]">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title.title}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-foreground-subtle">
            Sin poster
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-5 pb-5 pt-20">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                {title.type === "movie" ? "Pelicula" : "Serie"}
                {title.runtime ? ` · ${title.runtime} min` : ""}
              </span>
            </div>
            <div className="flex-shrink-0 rounded-md bg-white/15 px-2 py-1 backdrop-blur-sm">
              <span className="text-sm font-bold text-white">
                {title.tmdbRating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="font-display text-2xl tracking-tight text-foreground">
            {title.title}
          </h3>
          <p className="mt-1 text-sm text-foreground-subtle">
            {title.year} · {title.directors.join(", ") || "Director desconocido"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground-subtle">
            {title.genres.slice(0, 3).join(" · ")}
          </span>
          <span className="text-foreground-subtle/30">|</span>
          <span className="text-xs text-foreground-subtle">
            {title.providers
              .map((key) => STREAMING_PROVIDERS[key].name)
              .join(", ")}
          </span>
        </div>

        {inWatchlist && (
          <span className="inline-block rounded-full bg-primary-muted px-2.5 py-0.5 text-xs font-medium text-primary">
            En tu watchlist
          </span>
        )}

        <blockquote className="border-l-2 border-primary/30 pl-4">
          <p className="font-display text-base italic leading-relaxed text-foreground-muted">
            &ldquo;{reason}&rdquo;
          </p>
        </blockquote>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-background-subtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-xs text-foreground-subtle">
              {score}% afinidad
            </span>
          </div>
          <button
            onClick={() => onDismiss(title.tmdbId, title.type)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground-subtle opacity-0 transition-all duration-200 hover:bg-background-elevated hover:text-foreground group-hover:opacity-100"
          >
            <Eye size={14} strokeWidth={1.5} />
            Ya la vi
          </button>
        </div>
      </div>
    </article>
  );
}
