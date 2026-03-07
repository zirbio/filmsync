import { NextResponse } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import { generateTasteProfile } from "@/lib/claude";
import type { EnrichedRating, TasteProfile } from "@/types";

export async function POST() {
  try {
    const enriched = await readCache<EnrichedRating[]>("enriched_ratings.json");
    if (!enriched) {
      return NextResponse.json(
        { error: "No enriched data. Run POST /api/enrich first." },
        { status: 400 }
      );
    }

    const profile = await generateTasteProfile(enriched);
    await writeCache("taste_profile.json", profile);

    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const profile = await readCache<TasteProfile>("taste_profile.json");
  if (!profile) {
    return NextResponse.json(
      { error: "No taste profile. Run POST /api/profile first." },
      { status: 404 }
    );
  }
  return NextResponse.json(profile);
}
