import { describe, it, expect, beforeAll } from "vitest";
import { buildSyncRatingsBody, buildSyncHistoryBody, buildWatchlistRemoveBody, buildAuthUrl } from "@/lib/trakt";
import type { SyncItem } from "@/types";

describe("trakt utilities", () => {
  beforeAll(() => {
    process.env.TRAKT_CLIENT_ID ??= "test-client-id";
    process.env.TRAKT_REDIRECT_URI ??= "http://localhost:3000/api/trakt/callback";
  });

  it("builds correct OAuth authorize URL", () => {
    const url = buildAuthUrl();
    expect(url).toContain("https://trakt.tv/oauth/authorize");
    expect(url).toContain("client_id=");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("response_type=code");
  });

  it("builds sync ratings body with TMDB IDs", () => {
    const items: SyncItem[] = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie", watchedDate: "2024-01-01" },
      { title: "Show", year: 2024, rating10: 9, tmdbId: 456, tmdbType: "tv", watchedDate: "2024-02-01" },
    ];
    const body = buildSyncRatingsBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].rating).toBe(8);
    expect(body.movies[0].ids.tmdb).toBe(123);
    expect(body.shows).toHaveLength(1);
    expect(body.shows[0].rating).toBe(9);
    expect(body.shows[0].ids.tmdb).toBe(456);
  });

  it("builds sync history body with watched dates", () => {
    const items: SyncItem[] = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie", watchedDate: "2024-01-15" },
    ];
    const body = buildSyncHistoryBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].ids.tmdb).toBe(123);
    expect(body.movies[0].watched_at).toContain("2024-01-15");
  });

  it("builds watchlist remove body", () => {
    const items: SyncItem[] = [
      { title: "Test", year: 2024, rating10: 8, tmdbId: 123, tmdbType: "movie", watchedDate: "2024-01-01" },
    ];
    const body = buildWatchlistRemoveBody(items);
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].ids.tmdb).toBe(123);
  });

  it("skips items without tmdbId", () => {
    const items: SyncItem[] = [
      { title: "Unknown", year: 2024, rating10: 7, tmdbId: null, tmdbType: null, watchedDate: "2024-01-01" },
    ];
    const body = buildSyncRatingsBody(items);
    expect(body.movies).toHaveLength(0);
    expect(body.shows).toHaveLength(0);
  });
});
