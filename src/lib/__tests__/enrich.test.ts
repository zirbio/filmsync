import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichBatch } from "@/lib/enrich";
import * as cache from "@/lib/cache";
import * as tmdb from "@/lib/tmdb";
import type { EnrichedRating, FilmAffinityRating } from "@/types";

vi.mock("@/lib/cache");
vi.mock("@/lib/tmdb");

const makeRating = (overrides: Partial<FilmAffinityRating> = {}): FilmAffinityRating => ({
  title: "Inception",
  year: 2010,
  directors: "Christopher Nolan",
  watchedDate: "2024-01-15",
  rating: 4,
  rating10: 8,
  ...overrides,
});

const makeEnriched = (overrides: Partial<EnrichedRating> = {}): EnrichedRating => ({
  title: "Inception",
  year: 2010,
  directors: "Christopher Nolan",
  watchedDate: "2024-01-15",
  rating: 4,
  rating10: 8,
  tmdbId: 27205,
  tmdbType: "movie",
  genres: ["Sci-Fi"],
  overview: "A mind-bending thriller",
  posterPath: "/poster.jpg",
  tmdbRating: 8.4,
  cast: ["Leonardo DiCaprio"],
  keywords: ["dream"],
  runtime: 148,
  ...overrides,
});

describe("enrichBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tmdb.searchMovie).mockResolvedValue(null);
    vi.mocked(tmdb.searchTV).mockResolvedValue(null);
  });

  it("skips already-enriched ratings with same data", async () => {
    const existing = [makeEnriched()];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating()]);

    expect(result.newlyEnriched).toBe(0);
    expect(result.updated).toBe(0);
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("updates rating10 without re-calling TMDB", async () => {
    const existing = [makeEnriched({ rating10: 8 })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ rating10: 9 })]);

    expect(result.updated).toBe(1);
    expect(result.newlyEnriched).toBe(0);
    expect(result.results[0].rating10).toBe(9);
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("updates watchedDate without re-calling TMDB", async () => {
    const existing = [makeEnriched({ watchedDate: "2024-01-15" })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ watchedDate: "2024-06-20" })]);

    expect(result.updated).toBe(1);
    expect(result.results[0].watchedDate).toBe("2024-06-20");
    expect(tmdb.searchMovie).not.toHaveBeenCalled();
  });

  it("returns updated count in result", async () => {
    const existing = [makeEnriched({ rating10: 7 })];
    vi.mocked(cache.readCache).mockResolvedValue(existing);
    vi.mocked(cache.writeCache).mockResolvedValue(undefined);

    const result = await enrichBatch([makeRating({ rating10: 9 })]);

    expect(result).toHaveProperty("updated", 1);
    expect(result).toHaveProperty("newlyEnriched", 0);
  });
});
