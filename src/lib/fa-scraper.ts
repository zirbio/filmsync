import { execFile } from "child_process";
import { promisify } from "util";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import type { FilmAffinityRating } from "@/types";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export async function scrapeFilmAffinity(
  userId: string
): Promise<FilmAffinityRating[]> {
  const outputPath = path.resolve(process.cwd(), "data/fa_scraped.csv");

  await execFileAsync(
    "fa-scraper",
    [userId, "--csv", outputPath, "--lang", "en"],
    { timeout: 120_000 }
  );

  const ratings = await parseFilmAffinityCSV(outputPath);

  await fs.unlink(outputPath).catch(() => {});

  return ratings;
}
