"use client";

import { Eye } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
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

  return (
    <TitleCard
      poster={title.posterPath}
      title={title.title}
      year={title.year}
      directors={title.directors.join(", ") || undefined}
      genres={title.genres}
      type={title.type}
      tmdbScore={title.tmdbRating}
      runtime={title.runtime}
    >
      <div className="flex flex-wrap items-center gap-2">
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
          className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground-subtle opacity-100 transition-all duration-200 hover:bg-background-elevated hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
        >
          <Eye size={14} strokeWidth={1.5} />
          Ya la vi
        </button>
      </div>
    </TitleCard>
  );
}
