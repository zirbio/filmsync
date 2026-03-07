import { describe, it, expect } from "vitest";
import { scrapeFilmAffinity } from "@/lib/fa-scraper";

describe("scrapeFilmAffinity", () => {
  it("scrapes ratings and returns parsed array", async () => {
    const ratings = await scrapeFilmAffinity("664084");
    expect(ratings.length).toBeGreaterThan(0);
    expect(ratings[0]).toHaveProperty("title");
    expect(ratings[0]).toHaveProperty("year");
    expect(ratings[0]).toHaveProperty("rating10");
    expect(ratings[0]).toHaveProperty("watchedDate");
  }, 120_000);
});
