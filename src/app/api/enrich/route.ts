import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import { readCache } from "@/lib/cache";
import { enrichBatch } from "@/lib/enrich";
import type { EnrichedRating } from "@/types";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const csvPath = path.resolve(process.cwd(), "data/filmaffinity_ratings.csv");

    // Check if request has a file upload
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.mkdir(path.dirname(csvPath), { recursive: true });
      await fs.writeFile(csvPath, buffer);
    }

    const ratings = await parseFilmAffinityCSV(csvPath);
    const { results, newlyEnriched, notFound } = await enrichBatch(ratings);

    return NextResponse.json({
      total: results.length,
      newlyEnriched,
      notFound,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const data = await readCache<EnrichedRating[]>("enriched_ratings.json");
  if (!data) {
    return NextResponse.json(
      { error: "No enriched data. Run POST /api/enrich first." },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const full = searchParams.get("full") === "true";
  const notFound = data.filter((r) => r.tmdbId === null).length;

  if (full) {
    return NextResponse.json({
      total: data.length,
      notFound,
      ratings: data,
    });
  }

  return NextResponse.json({
    total: data.length,
    notFound,
    sample: data.slice(0, 3),
  });
}
