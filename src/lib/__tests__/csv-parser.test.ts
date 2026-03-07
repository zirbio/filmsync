import { describe, it, expect } from "vitest";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import path from "path";

describe("parseFilmAffinityCSV", () => {
  it("parses the CSV file and returns typed ratings", async () => {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");
    const ratings = await parseFilmAffinityCSV(csvPath);

    expect(ratings.length).toBeGreaterThan(0);
    expect(ratings[0]).toHaveProperty("title");
    expect(ratings[0]).toHaveProperty("year");
    expect(ratings[0]).toHaveProperty("directors");
    expect(ratings[0]).toHaveProperty("watchedDate");
    expect(ratings[0]).toHaveProperty("rating");
    expect(ratings[0]).toHaveProperty("rating10");
    expect(typeof ratings[0].year).toBe("number");
    expect(typeof ratings[0].rating).toBe("number");
    expect(typeof ratings[0].rating10).toBe("number");
  });

  it("correctly parses a known entry", async () => {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");
    const ratings = await parseFilmAffinityCSV(csvPath);
    const marty = ratings.find((r) => r.title === "Marty Supreme");

    expect(marty).toBeDefined();
    expect(marty!.year).toBe(2025);
    expect(marty!.directors).toBe("Joshua Safdie");
    expect(marty!.rating10).toBe(8);
  });
});
