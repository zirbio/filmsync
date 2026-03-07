import Papa from "papaparse";
import fs from "fs/promises";
import type { FilmAffinityRating } from "@/types";

interface CSVRow {
  Title: string;
  Year: string;
  Directors: string;
  WatchedDate: string;
  Rating: string;
  Rating10: string;
}

export async function parseFilmAffinityCSV(
  filePath: string
): Promise<FilmAffinityRating[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const { data } = Papa.parse<CSVRow>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return data.map((row) => ({
    title: row.Title,
    year: parseInt(row.Year, 10),
    directors: row.Directors,
    watchedDate: row.WatchedDate,
    rating: parseFloat(row.Rating),
    rating10: parseInt(row.Rating10, 10),
  }));
}
