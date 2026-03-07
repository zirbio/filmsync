import { NextResponse } from "next/server";
import { getGenreList } from "@/lib/tmdb";

export async function GET() {
  try {
    const genres = await getGenreList();
    return NextResponse.json(genres);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
