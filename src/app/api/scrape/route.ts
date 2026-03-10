import { NextRequest, NextResponse } from "next/server";
import { scrapeFilmAffinity, ScraperError } from "@/lib/fa-scraper";
import { enrichRating } from "@/lib/enrich";
import { readCache, writeCache } from "@/lib/cache";
import type { EnrichedRating } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const scraped = await scrapeFilmAffinity(userId);

    if (scraped.length === 0) {
      return NextResponse.json(
        { error: "User not found on FilmAffinity" },
        { status: 404 }
      );
    }

    const existing = await readCache<EnrichedRating[]>("enriched_ratings.json");
    const enrichedTitles = new Set(
      existing?.map((r) => `${r.title}-${r.year}`) ?? []
    );

    const toEnrich = scraped.filter(
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
    if (error instanceof ScraperError) {
      switch (error.code) {
        case "NOT_INSTALLED":
          return NextResponse.json(
            { error: "fa-scraper tool not available" },
            { status: 500 }
          );
        case "TIMEOUT":
          return NextResponse.json(
            { error: "Scraping timed out" },
            { status: 504 }
          );
        case "SCRAPE_FAILED":
          return NextResponse.json(
            { error: "Failed to scrape FilmAffinity" },
            { status: 500 }
          );
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
