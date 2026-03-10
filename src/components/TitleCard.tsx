"use client";

import Image from "next/image";

interface TitleCardProps {
  poster: string | null;
  title: string;
  year: number;
  directors?: string;
  genres: string[];
  type: "movie" | "tv";
  tmdbScore?: number;
  runtime?: number | null;
  children?: React.ReactNode;
}

export function TitleCard({
  poster,
  title,
  year,
  directors,
  genres,
  type,
  tmdbScore,
  runtime,
  children,
}: TitleCardProps) {
  const posterUrl = poster
    ? `https://image.tmdb.org/t/p/w500${poster}`
    : null;

  return (
    <article className="group">
      <div className="shadow-elevated relative aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-elevated-hover">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
                {type === "movie" ? "Película" : "Serie"}
                {runtime ? ` · ${runtime} min` : ""}
              </span>
            </div>
            {tmdbScore != null && (
              <div className="flex-shrink-0 rounded-md bg-white/15 px-2 py-1 backdrop-blur-sm">
                <span className="text-sm font-bold text-white">
                  {tmdbScore.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="font-display text-2xl tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-sm text-foreground-subtle">
            {year}{directors ? ` · ${directors}` : ""}
          </p>
        </div>

        {genres.length > 0 && (
          <p className="text-xs text-foreground-subtle">
            {genres.slice(0, 3).join(" · ")}
          </p>
        )}

        {children}
      </div>
    </article>
  );
}
