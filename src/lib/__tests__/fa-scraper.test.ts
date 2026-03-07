import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrapeFilmAffinity } from "@/lib/fa-scraper";
import path from "path";
import fs from "fs/promises";

vi.mock("child_process", () => {
  const exec = vi.fn();
  return {
    execFile: exec,
  };
});

const SAMPLE_CSV = `Title,Year,Directors,WatchedDate,Rating,Rating10
Tinker Tailor Soldier Spy,2011,Tomas Alfredson,2026-03-06,4.5,9
Marty Supreme,2025,Joshua Safdie,2026-02-27,4.0,8
`;

describe("scrapeFilmAffinity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("executes fa-scraper and parses resulting CSV", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const outputPath = path.resolve(process.cwd(), "data/fa_scraped.csv");
      fs.mkdir(path.dirname(outputPath), { recursive: true })
        .then(() => fs.writeFile(outputPath, SAMPLE_CSV, "utf-8"))
        .then(() => {
          if (typeof callback === "function") {
            callback(null, "", "");
          }
        });
      return undefined as never;
    });

    const ratings = await scrapeFilmAffinity("664084");
    expect(ratings).toHaveLength(2);
    expect(ratings[0].title).toBe("Tinker Tailor Soldier Spy");
    expect(ratings[0].year).toBe(2011);
    expect(ratings[0].rating10).toBe(9);
    expect(ratings[1].title).toBe("Marty Supreme");
  }, 10_000);
});
