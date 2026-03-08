import type { EnrichedRating } from "@/types";
import { GENRE_CATEGORIES } from "@/types";

interface FilterCriteria {
  type: "movie" | "tv";
  genreCategories: string[];
  minYear: number | null;
}

export function filterRatingsByCriteria(
  ratings: EnrichedRating[],
  criteria: FilterCriteria
): EnrichedRating[] {
  const tmdbGenres: string[] = criteria.genreCategories.length > 0
    ? criteria.genreCategories.flatMap((cat) => GENRE_CATEGORIES[cat] ?? [])
    : [];

  return ratings
    .filter((r) => {
      if (!r.tmdbId || !r.tmdbType) return false;
      if (r.tmdbType !== criteria.type) return false;
      if (tmdbGenres.length > 0 && !r.genres.some((g) => tmdbGenres.includes(g))) return false;
      if (criteria.minYear && r.year < criteria.minYear) return false;
      return true;
    })
    .sort((a, b) => b.rating10 - a.rating10);
}
