export interface FilmAffinityRating {
  title: string;
  year: number;
  directors: string;
  watchedDate: string;
  rating: number;
  rating10: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  genres: TMDBGenre[];
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
  keywords?: { keywords: { id: number; name: string }[] };
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  genres: TMDBGenre[];
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  number_of_seasons: number;
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
  keywords?: { results: { id: number; name: string }[] };
}

export interface EnrichedRating extends FilmAffinityRating {
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
  genres: string[];
  overview: string;
  posterPath: string | null;
  tmdbRating: number | null;
  cast: string[];
  keywords: string[];
  runtime: number | null;
}

export interface TasteProfile {
  preferred_genres: string[];
  preferred_directors: string[];
  preferred_themes: string[];
  preferred_decades: string[];
  avoid_patterns: string[];
  taste_summary: string;
  generated_at: string;
}

export const STREAMING_PROVIDERS = {
  netflix: { id: 8, name: "Netflix", logo: "/logos/netflix.svg" },
  hbo: { id: 384, name: "Max (HBO)", logo: "/logos/hbo.svg" },
  prime: { id: 119, name: "Prime Video", logo: "/logos/prime.svg" },
  disney: { id: 337, name: "Disney+", logo: "/logos/disney.svg" },
  apple: { id: 350, name: "Apple TV+", logo: "/logos/apple.svg" },
} as const;

export type StreamingProviderKey = keyof typeof STREAMING_PROVIDERS;

export const GENRE_CATEGORIES: Record<string, string[]> = {
  "Drama": ["Drama"],
  "Comedia": ["Comedia"],
  "Thriller / Crimen": ["Crimen", "Suspense", "Misterio"],
  "Acción / Aventura": ["Acción", "Aventura"],
  "Sci-Fi / Fantasía": ["Ciencia ficción", "Fantasía"],
  "Histórico / Bélico": ["Historia", "Bélica"],
  "Romance": ["Romance"],
  "Animación": ["Animación"],
} as const;

export interface StreamingTitle {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  overview: string;
  year: number;
  genres: string[];
  directors: string[];
  cast: string[];
  tmdbRating: number;
  posterPath: string | null;
  runtime: number | null;
  providers: StreamingProviderKey[];
}

export interface Recommendation {
  title: StreamingTitle;
  reason: string;
  score: number;
}

export interface RecommendationFilters {
  providers: StreamingProviderKey[];
  type: "movie" | "tv";
  genreCategories: string[];
  minYear: number | null;
}

export interface ClaudeRecommendation {
  title: string;
  year: number;
  director: string;
  reason: string;
  score: number;
}

export interface RecommendationCache {
  filters: RecommendationFilters;
  recommendations: Recommendation[];
  generated_at: string;
}

// --- Trakt Sync Types ---

export interface TraktToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface SyncItem {
  title: string;
  year: number;
  rating10: number;
  tmdbId: number | null;
  tmdbType: "movie" | "tv" | null;
  watchedDate: string;
}

export interface SyncDiff {
  newRatings: SyncItem[];
  totalFA: number;
  totalSynced: number;
}

export interface SyncResult {
  syncedCount: number;
  removedFromWatchlist: number;
}

export interface LastSync {
  syncedTitles: { title: string; year: number }[];
  lastSyncDate: string;
}

export interface TraktWatchlistItem {
  title: string;
  year: number;
  tmdbId: number;
  type: "movie" | "tv";
  posterPath: string | null;
  genres: string[];
  tmdbRating: number | null;
  providers: StreamingProviderKey[];
}
