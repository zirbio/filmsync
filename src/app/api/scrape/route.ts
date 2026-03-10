import { NextRequest, NextResponse } from "next/server";
import { scrapeFilmAffinity, ScraperError } from "@/lib/fa-scraper";
import { enrichBatch } from "@/lib/enrich";

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

    const { results, newlyEnriched, notFound } = await enrichBatch(scraped);

    return NextResponse.json({
      total: results.length,
      newlyEnriched,
      notFound,
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
