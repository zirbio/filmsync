import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { parseFilmAffinityCSV } from "@/lib/csv-parser";
import { readCache, writeCache } from "@/lib/cache";
import { enrichRating } from "@/lib/enrich";
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

    const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const enrichedTitles = new Set(existing?.map((r) => `${r.title}-${r.year}`) ?? []);

    const toEnrich = ratings.filter(
      (r) => !enrichedTitles.has(`${r.title}-${r.year}`)
    );

    const results: EnrichedRating[] = existing ?? [];
    let processed = 0;

    for (const rating of toEnrich) {
      const enriched = await enrichRating(rating);
      results.push(enriched);
      processed++;

      if (processed % 20 === 0) {
        await writeCache("enriched_ratings.json", results);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await writeCache("enriched_ratings.json", results);

    return NextResponse.json({
      total: results.length,
      newlyEnriched: processed,
      notFound: results.filter((r) => r.tmdbId === null).length,
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

  if (full) {
    return NextResponse.json({
      total: data.length,
      notFound: data.filter((r) => r.tmdbId === null).length,
      ratings: data,
    });
  }

  return NextResponse.json({
    total: data.length,
    notFound: data.filter((r) => r.tmdbId === null).length,
    sample: data.slice(0, 3),
  });
}
