import { describe, it, expect } from "vitest";
import { filterRatingsByCriteria } from "../rating-filter";
import type { EnrichedRating } from "@/types";

function makeRating(overrides: Partial<EnrichedRating>): EnrichedRating {
  return {
    title: "Test Movie",
    year: 2020,
    directors: "Test Director",
    watchedDate: "2024-01-01",
    rating: 4,
    rating10: 8,
    tmdbId: 1,
    tmdbType: "movie",
    genres: ["Drama"],
    overview: "",
    posterPath: null,
    tmdbRating: 7.5,
    cast: [],
    keywords: [],
    runtime: 120,
    ...overrides,
  };
}

describe("filterRatingsByCriteria", () => {
  const ratings: EnrichedRating[] = [
    makeRating({ title: "Drama Movie", genres: ["Drama", "Crimen"], tmdbType: "movie", year: 2015 }),
    makeRating({ title: "Comedy Movie", genres: ["Comedia"], tmdbType: "movie", year: 2020 }),
    makeRating({ title: "Drama Series", genres: ["Drama"], tmdbType: "tv", year: 2018 }),
    makeRating({ title: "Action Movie", genres: ["Acción", "Aventura"], tmdbType: "movie", year: 2005 }),
    makeRating({ title: "No TMDB", genres: ["Drama"], tmdbId: null, tmdbType: null }),
  ];

  it("filters by type movie", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie", "Comedy Movie", "Action Movie"]);
  });

  it("filters by type tv", () => {
    const result = filterRatingsByCriteria(ratings, { type: "tv", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Series"]);
  });

  it("filters by genre category with multiple TMDB genres", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: ["Thriller / Crimen"], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie"]);
  });

  it("filters by genre category Acción / Aventura", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: ["Acción / Aventura"], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["Action Movie"]);
  });

  it("returns all genres when genreCategories is empty", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: [], minYear: null });
    expect(result).toHaveLength(3);
  });

  it("filters by minYear", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: [], minYear: 2010 });
    expect(result.map((r) => r.title)).toEqual(["Drama Movie", "Comedy Movie"]);
  });

  it("excludes ratings without tmdbId", () => {
    const result = filterRatingsByCriteria(ratings, { type: "movie", genreCategories: ["Drama"], minYear: null });
    expect(result.find((r) => r.title === "No TMDB")).toBeUndefined();
  });

  it("sorts by rating10 descending", () => {
    const mixed = [
      makeRating({ title: "Low", rating10: 5, genres: ["Drama"], tmdbType: "movie" }),
      makeRating({ title: "High", rating10: 10, genres: ["Drama"], tmdbType: "movie" }),
      makeRating({ title: "Mid", rating10: 7, genres: ["Drama"], tmdbType: "movie" }),
    ];
    const result = filterRatingsByCriteria(mixed, { type: "movie", genreCategories: [], minYear: null });
    expect(result.map((r) => r.title)).toEqual(["High", "Mid", "Low"]);
  });
});
