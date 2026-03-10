import { execFile } from "child_process";
import { promisify } from "util";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import type { FilmAffinityRating } from "@/types";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_INSTALLED" | "TIMEOUT" | "SCRAPE_FAILED"
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

export async function scrapeFilmAffinity(
  userId: string
): Promise<FilmAffinityRating[]> {
  const outputPath = path.resolve(process.cwd(), "data/fa_scraped.csv");

  try {
    await execFileAsync(
      "fa-scraper",
      [userId, "--csv", outputPath, "--lang", "en"],
      { timeout: 120_000 }
    );
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean };

    if (err.code === "ENOENT") {
      throw new ScraperError(
        "fa-scraper CLI tool not found",
        "NOT_INSTALLED"
      );
    }

    if (err.killed || err.code === "ETIMEDOUT") {
      throw new ScraperError("Scraping timed out", "TIMEOUT");
    }

    throw new ScraperError(
      err.message ?? "Scraping failed",
      "SCRAPE_FAILED"
    );
  }

  const ratings = await parseFilmAffinityCSV(outputPath);
  await fs.unlink(outputPath).catch(() => {});

  return ratings;
}
