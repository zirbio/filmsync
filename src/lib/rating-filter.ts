import type { EnrichedRating, GenreCategory } from "@/types";
import { GENRE_CATEGORIES } from "@/types";

interface FilterCriteria {
  type: "movie" | "tv";
  genreCategories: GenreCategory[];
  minYear: number | null;
}

export function filterRatingsByCriteria(
  ratings: EnrichedRating[],
  criteria: FilterCriteria
): EnrichedRating[] {
  const tmdbGenreSet = new Set<string>(
    criteria.genreCategories.flatMap((cat) => [...GENRE_CATEGORIES[cat]])
  );

  return ratings
    .filter((r) => {
      if (!r.tmdbId || !r.tmdbType) return false;
      if (r.tmdbType !== criteria.type) return false;
      if (tmdbGenreSet.size > 0 && !r.genres.some((g) => tmdbGenreSet.has(g))) return false;
      if (criteria.minYear && r.year < criteria.minYear) return false;
      return true;
    })
    .sort((a, b) => b.rating10 - a.rating10);
}
